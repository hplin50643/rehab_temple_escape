import * as T from 'three';
import { haloTexture, horizonTexture, noise } from './env-art';
import { coursePosition, courseYaw, TempleWorld } from './env-world';
import type { CourseItemFrame } from './env-world';
import type { RunPhase, RunnerAction } from './game';
import { TempleGuardian, TempleRunner } from './runner';

export interface TempleFrame extends CourseItemFrame {
  distance:number;speed:number;elapsed:number;phase:RunPhase;
  action:RunnerAction;actionProgress:number;mistakes:number;threat?:number;
}
type Quality='auto'|'high'|'low';

function contactShadow(map:T.Texture) {
  const material=new T.MeshBasicMaterial({color:'#182318',map,transparent:true,opacity:.56,
    depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const mesh=new T.Mesh(new T.PlaneGeometry(1,1),material);
  mesh.rotation.x=-Math.PI/2;return mesh;
}

export class TempleScene {
  private readonly renderer:T.WebGLRenderer;
  private readonly scene=new T.Scene();
  private readonly camera=new T.PerspectiveCamera(54,1,.12,320);
  private readonly world:TempleWorld;
  private readonly runner=new TempleRunner();
  private readonly guardian=new TempleGuardian();
  private readonly skyline:T.Mesh<T.CylinderGeometry,T.MeshBasicMaterial>;
  private readonly dust:T.Points<T.BufferGeometry,T.PointsMaterial>;
  private readonly shadowMap=haloTexture();
  private readonly runnerShadow=contactShadow(this.shadowMap);
  private readonly guardianShadow=contactShadow(this.shadowMap);
  private readonly cameraTarget=new T.Vector3();
  private readonly fog=new T.FogExp2('#acc1a2',.014);
  private readonly sun=new T.DirectionalLight('#ffe1ac',2.45);
  private readonly fill=new T.HemisphereLight('#c9dfd5','#818674',1.22);
  private readonly torchLights=[new T.PointLight('#ffad58',0,14,2),new T.PointLight('#ffb161',0,14,2)];
  private readonly gradient=[new T.Color('#a6bda3'),new T.Color('#a6c4ac'),new T.Color('#d0bb94')];
  private readonly sceneObserver:ResizeObserver;
  private readonly lostHandler:(event:Event)=>void;
  private quality:Quality='auto';private reduced=false;private low=false;
  private samples=0;private sampleTime=0;private clock=0;
  private intro=1.3;private disposed=false;private lastFrame:TempleFrame|null=null;
  private lastDistance=NaN;private previousPhase:RunPhase|null=null;
  constructor(private readonly canvas:HTMLCanvasElement,onLost:()=>void){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.06;
    this.renderer.setClearColor('#b7c6ac');
    this.scene.fog=this.fog;
    this.sun.position.set(-32,48,-22);
    const rim=new T.DirectionalLight('#cfede2',.63);
    rim.position.set(4,5,7);
    this.scene.add(this.fill,this.sun,rim,...this.torchLights);
    this.skyline=new T.Mesh(new T.CylinderGeometry(218,218,366,72,1,true),
      new T.MeshBasicMaterial({map:horizonTexture(),side:T.BackSide,depthWrite:false,fog:false,toneMapped:false}));
    new T.TextureLoader().load(import.meta.env.BASE_URL+'art/env-horizon.webp',texture=>{
      if(this.disposed){texture.dispose();return;}
      texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;
      texture.repeat.x=2;texture.offset.x=-.5;
      this.skyline.material.map?.dispose();this.skyline.material.map=texture;
      this.skyline.material.needsUpdate=true;
      if(this.previousPhase!==null)this.renderer.render(this.scene,this.camera);
    });
    this.skyline.renderOrder=-100;this.skyline.frustumCulled=false;
    this.scene.add(this.skyline);
    this.world=new TempleWorld(this.scene,()=>{if(this.lastFrame&&!this.disposed)this.render(this.lastFrame,0);});
    this.scene.add(this.runner.group,this.guardian.group,this.runnerShadow,this.guardianShadow);
    this.runnerShadow.scale.set(1.40,2.15,1);this.guardianShadow.scale.set(1.66,2.4,1);
    const offsets=new Float32Array(90*3);
    for(let p=0;p<90;p++)
      offsets.set([(noise(p*3)-.5)*24,.35+noise(p*3+1)*7,5-noise(p*3+2)*40],p*3);
    const particles=new T.BufferGeometry();particles.setAttribute('position',new T.BufferAttribute(offsets,3));
    this.dust=new T.Points(particles,new T.PointsMaterial({color:'#ffe1a1',size:.068,transparent:true,
      opacity:.8,map:this.shadowMap,depthWrite:false,blending:T.AdditiveBlending}));
    this.scene.add(this.dust);
    this.sceneObserver=new ResizeObserver(()=>this.resize());this.sceneObserver.observe(canvas);
    this.lostHandler=e=>{e.preventDefault();onLost();};
    canvas.addEventListener('webglcontextlost',this.lostHandler);
    this.resize();
  }
  setOptions(quality:Quality,reduced:boolean){
    this.quality=quality;this.reduced=reduced;
    this.low=quality==='low'||(quality==='auto'&&this.canvas.clientWidth<650);
    this.samples=0;this.sampleTime=0;this.resize();
  }
  private resize(){
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(w<1||h<1)return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.low?1:1.5));
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    if(this.previousPhase!==null&&!this.renderer.getContext().isContextLost())this.renderer.render(this.scene,this.camera);
  }
  render(frame:TempleFrame,dt:number) {
    if(this.renderer.getContext().isContextLost())return;
    const d=frame.distance, stationary=frame.phase==='paused'||frame.phase==='complete';
    if(!stationary)this.clock+=Math.min(.15,Math.max(0,dt));
    if(this.quality==='auto'&&!this.low&&dt>0&&dt<.22){
      this.samples++;this.sampleTime+=dt;
      if(this.samples>=115){
        if(this.sampleTime/this.samples>1/36){this.low=true;this.resize();}
        this.samples=0;this.sampleTime=0;
      }
    }
    this.world.update(d,this.clock,frame,this.low,this.reduced);
    const chapter=d<600?0:d<1300?1:2;
    this.fog.color.copy(this.gradient[chapter]);
    this.fog.density=chapter===1?.010:.013;
    const interior=T.MathUtils.smoothstep(d,1298,1320)*(1-T.MathUtils.smoothstep(d,1955,1992));
    this.fog.color.lerp(new T.Color('#826f56'),interior*.94);this.fog.density+=interior*.005;
    this.fill.intensity=1.22-interior*.40;this.sun.intensity=2.45-interior*1.32;
    for(let n=0;n<2;n++){
      const light=this.torchLights[n],source=Math.round(d/18)*18;
      light.intensity=interior*68*(this.reduced?1:.95+.05*Math.sin(this.clock*7+source));
      const position=coursePosition(source-.4,n===0?-2.94:2.94,2.40);
      light.position.copy(position);
    }
    const yaw=courseYaw(d),speed=frame.speed,wide=this.camera.aspect>1;
    const reference=coursePosition(d);
    this.runner.group.position.copy(reference);
    this.runner.group.rotation.y=yaw;
    this.runner.update(speed,frame.elapsed,frame.action,frame.actionProgress,stationary?0:dt,this.reduced);
    this.runnerShadow.position.copy(reference);this.runnerShadow.position.y+=.054;
    this.runnerShadow.rotation.z=yaw;
    this.runnerShadow.material.opacity=frame.action==='jump'?.55-.28*Math.sin(Math.PI*frame.actionProgress):.55;
    const threat=frame.threat??Math.min(.92,.18+frame.mistakes*.16);
    const chasePosition=coursePosition(d-2.25+threat*.98,(wide?1.38:.60)+.15*(1-threat));
    this.guardian.group.position.copy(chasePosition);
    this.guardian.group.rotation.y=courseYaw(d-3)-.08;
    this.guardian.group.scale.setScalar(.89);
    this.guardian.update(speed,frame.elapsed,threat,this.reduced);
    this.guardian.group.visible=frame.phase!=='complete';
    this.guardianShadow.visible=this.guardian.group.visible;
    this.guardianShadow.position.copy(chasePosition);this.guardianShadow.position.y+=.06;
    this.guardianShadow.rotation.z=yaw;
    const portrait=this.camera.aspect<.86;
    if(this.previousPhase==='ready'&&frame.phase==='running'&&d<1&&!this.reduced)this.intro=0;
    if(frame.phase==='running')this.intro=Math.min(1.3,this.intro+dt);
    const opening=this.reduced?0:(1-this.intro/1.3)**2;
    const cameraBack=(portrait?5.9:5.35)+(this.reduced?0:speed*.008)+opening*3.8;
    const cameraHeight=(portrait?2.75:2.56)+opening*1.7;
    const targetPosition=coursePosition(d-cameraBack,-opening*(portrait?.38:1.25),cameraHeight);
    const look=coursePosition(d+(portrait?10:12),0,portrait?1.55:1.28);
    const snap=!Number.isFinite(this.lastDistance)||Math.abs(d-this.lastDistance)>7||this.previousPhase!==frame.phase;
    const t=snap?1:1-Math.exp(-Math.max(.001,dt)*14);
    this.camera.position.lerp(targetPosition,t);this.cameraTarget.lerp(look,t);
    const fov=(portrait?58:52)+(this.reduced?0:Math.min(4,speed*.075));
    if(Math.abs(fov-this.camera.fov)>.01){this.camera.fov=T.MathUtils.lerp(this.camera.fov,fov,snap?1:.12);this.camera.updateProjectionMatrix();}
    this.camera.lookAt(this.cameraTarget);
    this.skyline.position.copy(this.camera.position);this.skyline.position.y+=49;
    this.dust.visible=!this.reduced&&!this.low;
    this.dust.position.set(reference.x+Math.sin(this.clock*.15)*.6,reference.y+.16*Math.sin(this.clock*.3),reference.z);
    this.renderer.render(this.scene,this.camera);
    this.previousPhase=frame.phase;this.lastDistance=d;this.lastFrame=frame;
  }
  get drawCalls(){return this.renderer.info.render.calls;}
  dispose(){
    this.disposed=true;
    this.sceneObserver.disconnect();this.canvas.removeEventListener('webglcontextlost',this.lostHandler);
    this.world.dispose();this.runner.dispose();this.guardian.dispose();
    this.skyline.geometry.dispose();this.skyline.material.map?.dispose();this.skyline.material.dispose();
    for(const shadow of [this.runnerShadow,this.guardianShadow]){shadow.material.dispose();shadow.geometry.dispose();}
    this.shadowMap.dispose();this.dust.geometry.dispose();this.dust.material.dispose();
    this.renderer.dispose();
  }
}
