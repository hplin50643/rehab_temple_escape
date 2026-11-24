import * as T from 'three';
import { bananaLeaves, canopyTexture, carvedPlaqueTexture, carvedStone, groundTexture, haloTexture, noise, palmCrown, surfaceTexture } from './env-art';

export const courseX=(d:number)=>10*Math.sin(d*.023)+5.4*Math.sin(d*.041+.4);
export const courseY=(d:number)=>1.5*Math.sin(d*.027+.2)+.55*Math.sin(d*.052)+Math.max(0,d-1290)*.009;
export const courseYaw=(d:number)=>-Math.atan((courseX(d+.2)-courseX(d-.2))/.4);
export function coursePosition(d:number,lateral=0,height=0) {
  const angle=courseYaw(d);
  return new T.Vector3(courseX(d)+lateral*Math.cos(angle),courseY(d)+height,-d-lateral*Math.sin(angle));
}
const rocks=['#a3a183','#a7a387','#b1aa8a','#b9b199','#999c82','#9fa28a'];
const moss=['#6d784c','#787f4e','#73815b','#8c8e56','#949361'];
const bark=['#785e45','#887552','#a58c66','#726748'];
const leaves=['#296447','#476d40','#487347','#50804a','#728544','#2a5945','#467553'];
const warm=['#a79673','#c8b283','#bba779','#baa982','#ab9c7c'];
const basalt=['#68655e','#5b5e57','#69675b','#706a5b','#62615c','#777267'];
const tint=(list:string[],i:number)=>list[Math.floor(noise(i)*list.length)];
const blackStone='#515c4c', gilt='#d3a34e', verdigris='#559581';
const scratch=new T.Object3D(),colour=new T.Color(),orientation=new T.Quaternion();
const basisRotation=new T.Euler(0,0,0,'YXZ');

interface Batch { mesh:T.InstancedMesh; used:number }
class Batches {
  readonly rows=new Map<string,Batch>();
  private depth=0;private origin=new T.Vector3();private cs=1;private sn=0;private cp=1;private sp=0;
  constructor(private scene:T.Scene){}
  add(name:string,geometry:T.BufferGeometry,mat:T.Material,count:number){
    const mesh=new T.InstancedMesh(geometry,mat,count);
    mesh.count=0;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.rows.set(name,{mesh,used:0});this.scene.add(mesh);
  }
  reset(){for(const row of this.rows.values())row.used=0;}
  at(d:number,slope=false){
    this.depth=d;this.origin.set(courseX(d),courseY(d),-d);
    const yaw=courseYaw(d),pitch=slope?Math.atan((courseY(d+.2)-courseY(d-.2))/.4*Math.cos(yaw)):0;
    this.cs=Math.cos(yaw);this.sn=Math.sin(yaw);this.cp=Math.cos(pitch);this.sp=Math.sin(pitch);
    orientation.setFromEuler(basisRotation.set(pitch,yaw,0,'YXZ'));
  }
  get distance(){return this.depth;}
  place(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,
    ry=0,rz=0,rx=0) {
    const b=this.rows.get(name)!;
    if(b.used>=b.mesh.instanceMatrix.count)return;
    const slopeZ=z*this.cp+y*this.sp;
    scratch.position.set(this.origin.x+this.cs*x+this.sn*slopeZ,this.origin.y+y*this.cp-z*this.sp,this.origin.z-this.sn*x+this.cs*slopeZ);
    scratch.rotation.set(rx,ry,rz,'YXZ');
    scratch.quaternion.premultiply(orientation);
    scratch.scale.set(sx,sy,sz);scratch.updateMatrix();
    b.mesh.setMatrixAt(b.used,scratch.matrix);
    b.mesh.setColorAt(b.used++,colour.set(color));
  }
  finish(){for(const {used,mesh} of this.rows.values()){
    mesh.count=used;mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }}
  dispose(){for(const {mesh} of this.rows.values()){this.scene.remove(mesh);mesh.dispose();}this.rows.clear();}
}

function dappleTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d')!;
  ctx.filter='blur(1.3px)';ctx.strokeStyle='rgba(0,0,0,.38)';ctx.fillStyle='rgba(0,0,0,.43)';
  for(let i=0;i<4;i++){
    const x=36+i*30,y=i*26-12,angle=.64+i*.68,cs=Math.cos(angle),sn=Math.sin(angle);
    const to=(dist:number,side:number)=>[x+cs*dist-sn*side,y+sn*dist+cs*side];
    const end=to(78,0);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(end[0],end[1]);ctx.lineWidth=1;ctx.stroke();
    for(let j=0;j<12;j++)for(const side of [-1,1]){
      const a=to(j*6,0),b=to(j*6+12,(1-j/15)*17*side),d=to(j*6+4,0);
      ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(d[0],d[1]);ctx.closePath();ctx.fill();
    }
  }
  return new T.CanvasTexture(c);
}

export interface CourseItemFrame {
  obstacles:ReadonlyArray<{distance:number;kind:'jump'|'slide';resolved:boolean}>;
  relics:ReadonlyArray<{distance:number;collected:boolean;missed?:boolean}>;
}

export class TempleWorld {
  private world:Batches;private interactive:Batches;
  private geometries:T.BufferGeometry[]=[];private materials:T.Material[]=[];private textures:T.Texture[]=[];
  private water:T.ShaderMaterial;
  private lastBucket=-10000;private lastLow=false;
  private treesReady=false;private groundReady=false;private disposed=false;
  constructor(scene:T.Scene,refresh:()=>void){
    this.world=new Batches(scene);this.interactive=new Batches(scene);
    const stoneMap=surfaceTexture(false),woodMap=surfaceTexture(true),halo=haloTexture(),shade=dappleTexture();
    const leafImage=canopyTexture(),ground=groundTexture(),panel=carvedPlaqueTexture();
    this.textures.push(stoneMap,woodMap,halo,shade,leafImage,ground,panel);
    const stone=new T.MeshStandardMaterial({map:stoneMap,vertexColors:true,roughness:.93});
    const timber=new T.MeshStandardMaterial({map:woodMap,roughness:.96});
    const leaf=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    const flat=new T.MeshLambertMaterial({map:ground});
    const leafCard=new T.MeshLambertMaterial({map:leafImage,alphaTest:.35,side:T.DoubleSide});
    const gold=new T.MeshStandardMaterial({metalness:.25,roughness:.44,emissive:'#bb6714',emissiveIntensity:.29});
    const glow=new T.MeshBasicMaterial({toneMapped:false});
    const flare=new T.MeshBasicMaterial({map:halo,transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    const shadow=new T.MeshBasicMaterial({map:shade,transparent:true,opacity:.56,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,side:T.DoubleSide});
    const etching=new T.MeshStandardMaterial({map:panel,roughness:.9});
    this.water=new T.ShaderMaterial({
      uniforms:{clock:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,
      vertexShader:'varying vec2 coord; void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 coord;uniform float clock;void main(){
        float strand=sin(coord.x*61.+cos(coord.x*23.))*0.5+0.5;
        float spray=sin(coord.y*83.+coord.x*17.+clock*9.)*0.5+0.5;
        float edge=smoothstep(0.,.15,coord.x)*smoothstep(0.,.14,1.-coord.x);
        vec3 c=mix(vec3(.15,.47,.45),vec3(.76,.93,.81),strand*.68+spray*.18);
        float top=smoothstep(0.,.14,1.-coord.y-.03*sin(coord.x*36.));
        gl_FragColor=vec4(c,edge*top*(.48+strand*.37));
        #include <colorspace_fragment>
      }`});
    // Shader chunks must be on a separate preprocessor line.
    this.materials=[stone,timber,leaf,flat,gold,glow,flare,shadow,leafCard,etching,this.water];
    const block=carvedStone(),palm=palmCrown(),banana=bananaLeaves(),box=new T.BoxGeometry(1,1,1);
    const log=new T.CylinderGeometry(.36,.5,1,8,1),rough=new T.IcosahedronGeometry(.64,1);
    const crown=new T.IcosahedronGeometry(.62,1),pole=new T.CylinderGeometry(.5,.5,1,8,1);
    const plane=new T.PlaneGeometry(1,1),flame=new T.OctahedronGeometry(.5,0);
    const torus=new T.TorusGeometry(.43,.085,5,12),disc=new T.CylinderGeometry(.5,.5,1,10,1);
    const liana=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0,0,0),
      new T.Vector3(.2,-.24,.08),new T.Vector3(-.06,-.57,0),new T.Vector3(.07,-.81,.09),new T.Vector3(-.13,-1,-.04)]),12,.022,4,false);
    this.geometries=[block,palm,banana,box,log,rough,crown,pole,plane,flame,torus,disc,liana];
    const w=this.world,i=this.interactive;
    w.add('stone',block,stone,3000);w.add('wood',box,timber,950);w.add('trunk',log,timber,650);
    w.add('rock',rough,flat,500);w.add('canopy',crown,flat,400);w.add('palm',palm,leaf,90);
    w.add('plant',banana,leaf,530);w.add('pole',pole,timber,650);w.add('gold',box,gold,550);
    w.add('flame',flame,glow,80);w.add('halo',plane,flare,80);w.add('shadow',plane,shadow,95);
    w.add('fall',plane,this.water,25);
    w.add('leaves',plane,leafCard,950);
    w.add('etch',plane,etching,170);w.add('vine',liana,timber,185);
    function cut(left:number,right:number){
      const geometry=new T.PlaneGeometry(1,1),uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setX(i,T.MathUtils.lerp(left,right,uv.getX(i)));
      return geometry;
    }
    function portraitMaterial(){
      return new T.MeshBasicMaterial({alphaTest:.36,side:T.DoubleSide});
    }
    const treePaint=portraitMaterial(),groundPaint=portraitMaterial();
    this.materials.push(treePaint,groundPaint);
    const kapok=cut(0,.539),palmCard=cut(.544,1),fern=cut(0,.509),rubble=cut(.513,1);
    this.geometries.push(kapok,palmCard,fern,rubble);
    w.add('kapok',kapok,treePaint,120);w.add('palmCard',palmCard,treePaint,135);
    w.add('fern',fern,groundPaint,240);w.add('rubble',rubble,groundPaint,150);
    const loadArt=(name:string,material:T.MeshBasicMaterial,ready:()=>void)=>{
      new T.TextureLoader().load(import.meta.env.BASE_URL+'art/'+name,texture=>{
        if(this.disposed){texture.dispose();return;}
        texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
        material.map=texture;material.needsUpdate=true;
        this.textures.push(texture);ready();this.lastBucket=-10000;refresh();
      });
    };
    loadArt('env-trees.webp',treePaint,()=>{this.treesReady=true;});
    loadArt('env-undergrowth.webp',groundPaint,()=>{this.groundReady=true;});
    i.add('stone',block,stone,120);i.add('wood',box,timber,100);i.add('pole',pole,timber,110);
    i.add('trunk',log,timber,65);i.add('plant',banana,leaf,36);i.add('vine',liana,timber,22);
    i.add('gold',box,gold,180);i.add('ring',torus,gold,65);i.add('coin',disc,gold,65);
    i.add('light',flame,glow,100);i.add('halo',plane,flare,70);
  }
  private palm(x:number,y:number,z:number,size:number,seed:number){
    const w=this.world,h=size*(3.4+noise(seed)*.9),lean=(noise(seed+2)-.5)*.25;
    if(this.treesReady&&noise(seed+21)>.16){
      const tall=h*1.38;
      w.place('palmCard',x,y+tall*.5,z,tall*.71,tall,1,tint(['#cad6b9','#e2e7c5','#d4dcc3'],seed),
        -Math.sign(x)*(.2+noise(seed+31)*.75),lean*.15);
      return;
    }
    w.place('trunk',x+h*lean*.46,y+h/2,z,size*.57,h,size*.55,tint(bark,seed+2),0,-lean);
    const px=x+h*lean*.96;
    w.place('palm',px,y+h,z,size,size,size,tint(leaves,seed+7),seed);
    w.place('plant',x,y+.04,z,size*.8,size*.9,size*.8,tint(leaves,seed+15),seed);
  }
  private broadTree(x:number,y:number,z:number,size:number,seed:number){
    const w=this.world,h=size*(5.7+noise(seed)*3);
    if(this.treesReady){
      const tall=h*1.08;
      w.place('kapok',x,y+tall*.5,z,tall*.85,tall,1,tint(['#c7d9c8','#c6d8bc','#e2dfb8','#dbe4c9'],seed),
        -Math.sign(x)*(.15+noise(seed+31)*.95));
      return;
    }
    w.place('trunk',x,y+h*.48,z,size*1.6,h,size*1.45,tint(bark,seed),seed);
    for(let i=0;i<4;i++){
      const a=i*1.58+seed,cs=Math.cos(a),sn=Math.sin(a);
      w.place('rock',x+cs*.46*size,y+.63*size,z+sn*.46*size,size*.58,size*2.4,size*2.2,'#657052',-a);
      w.place('trunk',x+cs*size*.95,y+h*.79,z+sn*size*.95,size*.62,h*.4,size*.57,
        tint(bark,seed+i),-a,-.6);
      w.place('canopy',x+cs*size*1.7,y+h+noise(seed+i)*size,z+sn*size*1.7,size*4.3,size*2.5,size*4,
        tint(leaves,seed+i*8),a);
      const lx=x+cs*size*1.9,ly=y+h+.5*size,lz=z+sn*size*1.9;
      w.place('leaves',lx,ly,lz+1.0*size,6.6*size,3.9*size,1,'#d6e1b3',a*.06);
      w.place('leaves',lx+cs*.8*size,ly-.22*size,lz,6.2*size,3.8*size,1,'#cddfb1',a*.07+1.45);
    }
  }
  private torch(x:number,y:number,z:number,s:number){
    const w=this.world;
    w.place('stone',x,y+.42*s,z,.64*s,.84*s,.66*s,blackStone);
    w.place('gold',x,y+.81*s,z,.75*s,.12*s,.74*s,gilt);
    w.place('trunk',x,y+1.28*s,z,.32*s,.93*s,.32*s,'#725d38');
    w.place('stone',x,y+1.8*s,z,.64*s,.3*s,.62*s,'#615c43');
    w.place('flame',x,y+2.22*s,z,.4*s,1.25*s,.42*s,'#ffad38',.23,-.13);
    w.place('flame',x+.04*s,y+2.1*s,z+.05*s,.25*s,.82*s,.29*s,'#ffed97',-.31,.1);
    w.place('halo',x,y+2.28*s,z+.02*s,2.4*s,2.4*s,1,'#ffc068');
  }
  private carvedPillar(x:number,z:number,h:number,seed:number){
    const w=this.world;
    // The face is an original colour-baked stone relief, with simple capstones for its outer silhouette.
    w.place('stone',x,.24,z,1.82,.48,1.77,tint(rocks,seed));
    w.place('stone',x,.59,z,1.53,.26,1.51,tint(moss,seed));
    w.place('stone',x,h*.52,z,1.20,h-.75,1.21,tint(rocks,seed+2));
    w.place('stone',x,h-.37,z,1.43,.3,1.43,tint(rocks,seed+3));
    w.place('stone',x,h-.12,z,1.70,.21,1.67,tint(moss,seed+4));
    const height=Math.min(2.4,h*.59);
    w.place('stone',x,h*.54,z+.61,.94,height+.09,.13,'#677461');
    w.place('etch',x,h*.54,z+.682,.88,height,1,'#e6ddc2');
  }
  private arch(distance:number,sanctum:boolean){
    const w=this.world,h=sanctum?6.9:5.55,x=3.55;
    w.at(distance);
    for(const s of [-1,1]){
      this.carvedPillar(s*x,0,h,distance+s);
      w.place('stone',s*(x+.73),h*.43,-.3,1.1,h*.83,1.7,tint(rocks,distance+8*s));
      this.torch(s*(x-.62),0,1.7,.85);
    }
    for(let j=0;j<5;j++)w.place('stone',(j-2)*1.57,h+.18,0,1.59,.63,1.46,tint(rocks,distance+j));
    w.place('stone',0,h+.64,0,8.25,.29,1.7,tint(moss,distance));
    w.place('stone',0,h+.98,-.09,6.95,.43,1.63,tint(warm,distance));
    w.place('stone',0,h+1.36,-.17,5.52,.3,1.52,tint(moss,distance+5));
    for(let i=-5;i<=5;i++){
      w.place('gold',i*.59,h+.19,.75,.27,.09,.10,i%2?gilt:verdigris,0,i%2?.68:-.68);
      w.place('stone',i*.53,h+1.05,.77,.18,.21,.13,tint(warm,i+2));
    }
    for(const side of [-1,1]){
      w.place('plant',side*3.55,h+.78,0,1.6,1.2,1.7,tint(leaves,distance+side),side);
      for(let j=0;j<4;j++)w.place('vine',side*(3.18+j*.19),h+.64,.85,1.38,1.35+j*.41,1,'#5e703e',.4*side);
    }
    if(sanctum){
      for(let i=0;i<3;i++)
        w.place('stone',0,h+1.58+i*.35,-.3,3.9-i*.89,.39,1.59-i*.19,tint(warm,distance+i));
      w.place('gold',0,h+2.72,-.33,.56,.56,.35,gilt,0,Math.PI/4);
    }
  }
  private ruin(x:number,z:number,scale:number,seed:number){
    const w=this.world,rot=x>0?-.25:.25;
    for(let row=0;row<6;row++){
      const sz=(12.7-row*1.65)*scale, h=scale*(.92+row*.05);
      w.place('stone',x,(row+0.5)*scale,z,sz,h,sz,tint(rocks,seed+row),rot);
      w.place('stone',x,(row+.86)*scale,z,sz+.12*scale,.22*scale,sz+.12*scale,tint(moss,seed+row),rot);
    }
    w.place('stone',x,6.6*scale,z,3.55*scale,2.2*scale,3.4*scale,tint(rocks,seed+17),rot);
    w.place('stone',x,7.78*scale,z,4.35*scale,.48*scale,4.1*scale,tint(moss,seed),rot);
    w.place('stone',x,8.15*scale,z,2.90*scale,.42*scale,2.85*scale,tint(warm,seed),rot);
    w.place('stone',x+Math.sin(rot)*1.6*scale,6.48*scale,z+Math.cos(rot)*1.6*scale,1.18*scale,1.63*scale,.23*scale,'#455b50',rot);
    for(let j=0;j<10;j++){
      const p=5.7-j*.42;
      w.place('stone',x+Math.sin(rot)*p*scale,(.25+j*.54)*scale,z+Math.cos(rot)*p*scale,
        2.2*scale,.48*scale,1.6*scale,tint(warm,seed+j),rot);
    }
  }
  private stones(d:number,river:boolean,inner:boolean,broken:boolean){
    const w=this.world;w.at(d,true);
    const k=Math.round(d/1.8),n=noise(k*5),path=2.55,spacing=1.8/Math.cos(courseYaw(d));
    if(broken){
      for(const side of [-1,1]){
        w.place('wood',side*2.02,-.27,-.05,.28,.35,spacing+.25,'#6e6046',0,side*.07);
        w.place('wood',side*1.83,-.22,.42,1.15,.19,.29,'#997c55',side*.36,side*.19);
      }
      if(!river){
        w.place('rock',0,-3.3,0,7.4,1.4,5,'#46554f');
        for(const side of [-1,1])w.place('stone',side*2.35,-1.45,0,1.22,2.5,2.7,'#5f6655',0,side*.12);
      }
      return;
    }
    if(river){
      for(let j=0;j<3;j++){
        w.place('wood',(noise(k*3+j)-.5)*.11,-.13+(noise(k*8+j)-.5)*.025,(j-1)*spacing/3,
          4.52+noise(k+j)*.21,.25,spacing/3-.018,tint(bark,k*3+j),(noise(k+j)-.5)*.009);
      }
      for(const sign of [-1,1]){
        w.place('wood',sign*1.65,-.32,0,.21,.29,2.10,'#584e36');
        const level=1.06-.12*Math.sin(Math.PI*((k%4+4)%4)/4);
        w.place('wood',sign*2.30,level,0,.074,.08,spacing+.12,'#a98c5e');
        w.place('wood',sign*2.32,.56+(level-1.06)*.7,0,.052,.048,spacing+.12,'#927d54');
        if(k%4===0)w.place('trunk',sign*2.29,.46,0,.24,1.75,.23,tint(bark,k),.8,sign*.04);
        else if(k%2===0)w.place('pole',sign*2.31,.58,0,.046,1.1,.046,'#b29460');
      }
      return;
    }
    w.place('stone',0,-.39,0,5.37,.68,spacing+.25,'#666954');
    const widths=k%2?[1.47,2.24,1.3]:[1.89,1.4,1.72];
    let x=-path;
    for(let j=0;j<3;j++){
      const width=widths[j],sz=spacing+.035+noise(k+j)*.022;
      w.place('stone',x+width*.5,-.11+(noise(k*4+j)-.5)*.022,(noise(k*3+j)-.5)*.036,width,.23,sz,
        tint(inner?basalt:rocks,k*3+j), (noise(k+j)-.5)*.008);
      x+=width+.02;
    }
    for(const sign of [-1,1]){
      w.place('stone',sign*2.55,.01,0,.35,.34,spacing+.04,tint(inner?warm:n>.39?moss:rocks,k+sign));
      if(inner&&k%4===0)w.place('gold',sign*2.13,.025,0,.07,.018,1.2,'#be9d67');
    }
    if(k%3===0)w.place('shadow',(n-.5)*2,.045,0,4.3,3.9,1,'#4c604b',n*3,0,-Math.PI/2);
  }
  private sanctum(d:number,k:number){
    const w=this.world,opening=d>1960;
    for(const side of [-1,1]){
      w.place('stone',side*3.91,-.29,0,3.55,.69,10.1,'#6d6657');
      for(let row=0;row<(opening?2:5);row++){
        const height=1.11;
        w.place('stone',side*(4.95+.19*row),row*height+.30,(row%2)*.22,
          1.75,height+.08,9.52,tint(basalt,d+row*5+side));
      }
      w.place('stone',side*4.92,.35,0,2.48,.68,9.76,'#877756');
      w.place('stone',side*4.74,1.75,0,1.76,.22,9.70,'#927b55');
      if(!opening){
        w.place('stone',side*4.83,4.34,0,1.68,.24,9.65,'#997f58');
        w.place('stone',side*4.83,4.59,0,1.73,.20,9.68,'#605b50');
        this.carvedPillar(side*3.84,-1.0,5.75,d+side);
        w.place('stone',side*3.90,6.01,-1,1.8,.56,1.82,'#85765d');
        w.place('stone',side*3.53,6.47,-1,2.22,.56,1.85,'#776f5b');
        w.place('etch',side*3.86,3.08,1.89,1.48,2.6,1,'#b0af98',-side*Math.PI/2);
      }
      if(k%2===0){
        this.torch(side*3.04,.2,.4,1.04);
        w.place('halo',side*2.99,.078,.38,3.0,4.4,1,'#db7e27',0,0,-Math.PI/2);
        if(!opening)w.place('halo',side*3.97,2.64,.38,3.8,4.2,1,'#ea9443',-side*Math.PI/2);
      }
      if(this.groundReady&&k%4===1)
        w.place('rubble',side*3.67,.64,-1.8,2.1,1.48,1,'#a9a893',-side*.47);
    }
    if(!opening){
      w.place('stone',0,6.99,-1,8.63,.68,1.87,'#655f51');
      w.place('gold',0,6.69,-.05,7.91,.08,.08,'#9c7950');
      if(k%4!==1)w.place('stone',0,7.47,0,10.67,.54,9.6,'#4f504a');
      if(k%4===1)w.place('vine',2.87,6.93,.2,1.7,2.18,1,'#595d3d');
    }
  }
  private surroundings(d:number,river:boolean,inner:boolean,low:boolean){
    const w=this.world;w.at(d);
    const k=Math.round(d/9);
    if(inner){this.sanctum(d,k);return;}
    const paint=inner?warm:rocks;
    for(const side of [-1,1]){
      const seed=k*13+side*79,r=noise(seed),outer=8+r*2.1;
      if(river){
        const cliff=13+r*11;
        w.place('rock',side*(cliff+5),-7-r*2,0,17+r*5,21+r*6,15+r*6,'#71846e',seed);
        w.place('rock',side*(cliff+5),1-r*3,0,15,3.7,16,tint(moss,seed),seed);
        if(k%3===0){
          this.broadTree(side*(cliff+6),.3,-1,1.5+r,seed);
          if(!low)this.palm(side*(cliff+2),1,1,1.4+r,seed+2);
        }
        if(k%5===(side>0?0:2)){
          const fx=side*(cliff-3.30);
          w.place('rock',fx+side*3.2,-7.9,-1.3,9.7,22.5,11.8,'#839586',seed);
          w.place('fall',fx,-5.85,.6,6.3+r*3.1,22.5,1,'#b8e9d6',side*-1.12);
          w.place('fall',fx-side*.58,-7.7,2.3,3.8+r*2.5,26.4,1,'#c7f1dd',side*-1.19);
        }
        w.place('rock',side*(7+r*14),-22,0,17,2.1,24,'#659c89',seed);
      }else{
        w.place('rock',side*outer,-1.62,0,12.5+r*3,3.4,17,tint(moss,seed),seed);
        if(!this.groundReady)w.place('leaves',side*(6.4+r*1.8),.51+r*.22,0,5+r*2,2.1+r,1,'#c4d5a2',side*.29);
        w.place('rock',side*(16+r*3),-.4,0,16,5+r*5,22,tint(leaves,seed+2),seed+4);
        if(k%2===0)this.palm(side*(7.4+3*r),-.2,1,1.12+r*.68,seed);
        if(k%3!==1)this.broadTree(side*(12+r*4),-.3,-1,1.1+r*.55,seed+5);
        if(!low&&k%2===1)this.palm(side*(16+r*7),.2,1,1.35+r*.65,seed+12);
        if(k%2===0&&!low&&!this.groundReady){
          w.place('palm',side*(3.7+r),.32+r*.31,1,.51,.50,.51,tint(leaves,seed+9),seed*.3);
          w.place('palm',side*(6+r),1.01+r*.3,-2,.62,.58,.62,tint(leaves,seed),seed);
        }
        if(this.groundReady){
          const width=2.05+r*1.25;
          w.place('fern',side*(3.81+r*.93),width*.34-.16,-2+r*2,width,width*.74,1,'#e2e2ba',-side*(.37+r*.45));
          w.place(k%3===0?'rubble':'fern',side*(4.9+r),.88+r*.24,2.7,width*1.27,width*.92,1,'#cfd7b3',-side*.75);
        }
        for(let j=0;j<(low||this.groundReady?2:4);j++){
          const s=seed+j*117, size=.58+noise(s+9)*.83;
          w.place('plant',side*(3.75+noise(s+1)*3.4),-.34+noise(s)*.11,(noise(s+2)-.5)*8,
            size,size,size,tint(leaves,s+10),s);
        }
        if(k%3===1){
          w.place('rock',side*(3.9+r*.6),.19,0,1.4+r,1.1+r,2.1,tint(paint,seed),seed);
          w.place('plant',side*(4+r),.61,.5,.5,.6,.54,tint(moss,seed+2),seed);
        }
        if(inner&&k%3===0)this.carvedPillar(side*4.22,1,2.4+r*2.4,seed);
      }
      if(k%9===(side===1?2:6)){
        this.ruin(side*(river?30:20),-2,(river?1.8:1.05)+r*.45,seed);
      }
      if(k%4===0&&!river){
        if(inner)this.torch(side*3.05,.12,0,.91);
        else if(r>.28)this.carvedPillar(side*(3.67+r),0,1.5+r*1.6,seed);
      }
    }
  }
  update(distance:number,clock:number,frame:CourseItemFrame,low:boolean,reduced:boolean){
    const bucket=Math.floor(distance/10);
    const far=low?100:143, start=bucket*10-12, end=bucket*10+far;
    if(bucket!==this.lastBucket||low!==this.lastLow){
      this.lastBucket=bucket;this.lastLow=low;this.world.reset();
      const breaks=frame.obstacles.filter(g=>g.kind==='jump'&&g.distance>=start-3&&g.distance<=end+3);
      for(let row=Math.floor(start/1.8);row<=Math.ceil(end/1.8);row++){
        const d=row*1.8;this.stones(d,d>=600&&d<1300,d>=1300,breaks.some(g=>Math.abs(g.distance-d)<1.48));
      }
      for(let row=Math.floor(start/9)-1;row<=Math.ceil(end/9)+1;row++){
        const d=row*9;this.surroundings(d,d>=600&&d<1300,d>=1300,low);
      }
      for(let id=Math.floor(start/100)-1;id<=Math.ceil(end/100)+1;id++){
        const d=id*100+40;
        if(d>=start&&d<end&&((d<600)||(d>=1300&&d<1980)))this.arch(d,d>=1300);
      }
      for(const d of [598,1302,2000])if(d>=start&&d<=end)this.arch(d,d!==598);
      this.world.finish();
    }
    this.water.uniforms.clock.value=reduced?0:clock;
    const i=this.interactive;i.reset();
    for(const item of frame.relics){
      if(item.collected||item.missed||item.distance<distance-.3||item.distance>distance+85)continue;
      i.at(item.distance);
      const time=reduced?0:clock*1.8+item.distance*.11;
      const y=1.06+(reduced?0:Math.sin(time)*.09),rot=.22+(reduced?0:Math.sin(time*.75)*.57);
      i.place('coin',0,y,0,.67,.105,.67,'#e0a748',rot,0,Math.PI/2);
      i.place('ring',0,y,.078,.72,.72,.81,'#ffe4a3',rot);
      i.place('gold',0,y,.10,.25,.25,.10,'#fff0a7',rot,Math.PI/4);
      i.place('light',.29,y+.26,.04,.072,.16,.07,'#fff4ad');
      i.place('halo',0,y,.04,.98,.98,1,'#ffd364');
    }
    for(const gate of frame.obstacles){
      if(gate.distance<distance-5||gate.distance>distance+100)continue;
      i.at(gate.distance);const jump=gate.kind==='jump',height=jump?.46:1.47;
      for(const s of [-1,1]){
        if(jump){
          i.place('stone',s*2.4,.38,1.65,.51,.79,.59,'#767967');
          i.place('gold',s*2.4,.79,1.65,.52,.10,.60,'#cc9f54');
          for(const edge of [-1,1])i.place('gold',s*2.4+edge*.095,.51,1.96,.27,.062,.05,'#f7d387',0,-edge*.64);
        }else{
          i.place('stone',s*2.23,.76,0,.59,1.52,.72,'#777c68');
          i.place('stone',s*2.23,1.5,0,.79,.31,.88,'#929577');
        }
      }
      if(jump){
        for(let k=-2;k<=2;k++){
          i.place('wood',k*.68,-.30,1.22,.20,.19,.97+noise(k+gate.distance)*.42,
            tint(bark,k+gate.distance),noise(k)*.36,0,.28);
        }
      }else{
        i.place('trunk',0,height+.17,0,.95,5.68,.90,'#77684b',.08,Math.PI/2-.042);
        i.place('trunk',-.95,1.98,0,.40,1.46,.37,'#756344',.3,-1.01);
        i.place('trunk',1.75,1.88,0,.31,1.04,.32,'#756644',-.24,.77);
        i.place('plant',-2.13,1.89,0,.69,.61,.61,'#487148',.4);
        i.place('vine',1.24,1.71,.44,.9,.63,.85,'#526544');
        for(const s of [-1,1]){
          i.place('pole',s*.53,height+.17,.01,.79,.12,.79,'#8eb5a4',0,Math.PI/2-.04);
          i.place('gold',s*.17,height+.14,.43,.47,.074,.058,'#9bddd0',0,s*.63);
        }
      }
    }
    i.finish();
  }
  dispose(){
    this.disposed=true;
    this.world.dispose();this.interactive.dispose();
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    for(const texture of this.textures)texture.dispose();
  }
}
