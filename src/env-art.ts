import * as T from 'three';

export function noise(seed: number): number {
  const x = Math.sin(seed * 127.139 + 93.61) * 43758.5453;
  return x - Math.floor(x);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement) {
  const result = new T.CanvasTexture(c);
  result.colorSpace = T.SRGBColorSpace;
  return result;
}

// The same carved block takes on a different stone colour on every instance.
export function surfaceTexture(wood: boolean) {
  const c = canvas(192, 192);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  const grids = [4, 12, 32, 96].map(size => Array.from({length: size * size}, (_, i) => noise(i + size)));
  function layer(x: number, y: number, level: number) {
    const grid = grids[level], s = Math.sqrt(grid.length);
    x *= s; y *= s;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sample = (a: number, b: number) => grid[(a % s) + ((b % s) * s)];
    return T.MathUtils.lerp(T.MathUtils.lerp(sample(ix, iy), sample(ix + 1, iy), fx),
      T.MathUtils.lerp(sample(ix, iy + 1), sample(ix + 1, iy + 1), fx), fy);
  }
  for (let i = 0; i < 192 * 192; i++) {
    const x = (i % 192) / 192, y = Math.floor(i / 192) / 192;
    const n = layer(x, y, 0) * .42 + layer(x, y, 1) * .32 + layer(x, y, 2) * .18 + layer(x, y, 3) * .08;
    const grit = noise(i);
    let value = 155 + n * 78 + grit * 26;
    if (wood) value -= (1 - Math.abs(Math.sin(48 * Math.PI * x + n * 17))) ** 6 * 57;
    else value += Math.max(0, .41 - n) * 95 - (grit < .019 ? 39 : 0);
    img.data.set([value + 3, value, value - (wood ? 15 : 5), 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  if (!wood) {
    for (let i = 0; i < 8; i++) {
      let x = noise(i * 13 + 7) * 192, y = noise(i * 17 + 9) * 192;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (noise(i * 11 + j) - .3) * 13; y += noise(i * 19 + j) * 7;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(40,48,30,.23)'; ctx.lineWidth = .7; ctx.stroke();
    }
  }
  const result = tex(c);
  result.anisotropy = 4;
  return result;
}

export function horizonTexture() {
  const w = 3072, h = 768, c = canvas(w, h), ctx = c.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  [[0,'#638b91'],[.21,'#a4b6aa'],[.44,'#e1cf9d'],[.61,'#efd8a4'],[.79,'#8ca899'],[1,'#477f71']]
    .forEach(([p, colour]) => gradient.addColorStop(Number(p), String(colour)));
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  function haze(x: number, y: number, rx: number, ry: number, colour: string) {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,colour); g.addColorStop(1,'rgba(255,240,186,0)');
    ctx.fillStyle = g; ctx.fillRect(-1,-1,2,2); ctx.restore();
  }
  for (let i = 0; i < 120; i++) {
    const x = noise(i + 100) * w, y = 85 + noise(i + 218) * 275;
    haze(x, y, 60 + noise(i + 72) * 240, 4 + noise(i + 38) * 16,'rgba(255,234,187,.29)');
  }
  // CylinderGeometry's seam points towards +Z; forward looks at the central part of the painting.
  haze(w * .53, h * .34, 300, 200, 'rgba(255,231,159,.9)');
  haze(w * .53, h * .34, 62, 62, 'rgba(255,244,191,.95)');
  ctx.fillStyle = '#fff0b8'; ctx.beginPath(); ctx.arc(w * .53,h * .34,13,0,Math.PI * 2);ctx.fill();
  function ridge(x: number, layer: number) {
    const t = x / w * Math.PI * 2;
    return 455 + layer * 32 + Math.sin(t * 6 + layer * 2) * 24
      + Math.sin(t * 12 - layer) * (13 + layer * 2)
      - (Math.max(0, Math.sin(t * (layer + 7) + layer * 3.4)) ** 4) * (68 - layer * 9)
      + Math.cos(t * 46 + layer) * 6;
  }
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = ['#c2bf99','#a7b399','#90a995','#769b88','#598c78'][k];
    ctx.beginPath();ctx.moveTo(0,h);
    for (let x = 0; x <= w; x += 2) {
      ctx.lineTo(x, ridge(x,k) - noise(x + k * 206) * (2 + k * 1.3));
    }
    ctx.lineTo(w,h);ctx.closePath();ctx.fill();
    if (k >= 2) {
      for (let i = 0; i < 500; i++) {
        const x = noise(i + k * 807) * w, y = ridge(x,k) - .7;
        const r=1.3 + noise(i + k * 695) * 3.5;
        ctx.beginPath();ctx.ellipse(x,y,r * 1.1,r * 1.5,0,0,Math.PI*2);ctx.fill();
      }
    }
  }
  return tex(c);
}

export function haloTexture() {
  const c=canvas(64,64), ctx=c.getContext('2d')!;
  const g=ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.15,'rgba(255,255,255,.6)');
  g.addColorStop(.47,'rgba(255,255,255,.14)');g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return tex(c);
}

// A hand-built leafy silhouette fills the spaces between the 3D tree limbs.
export function canopyTexture() {
  const c=canvas(384,250),ctx=c.getContext('2d')!;
  for(let i=0;i<150;i++){
    const angle=noise(i+62)*Math.PI*2,r=Math.sqrt(noise(i+49));
    const x=192+Math.cos(angle)*r*148,y=129+Math.sin(angle)*r*70+11*Math.sin(angle*4);
    const s=16+noise(i+67)*20,k=Math.round(15+noise(i+27)*10+(1-y/250)*8);
    ctx.fillStyle='rgb('+k+','+(k+24)+','+(k+13)+')';
    ctx.beginPath();ctx.ellipse(x,y,s*1.12,s*.84,angle*.12,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<2400;i++){
    const angle=noise(i+84)*Math.PI*2,r=Math.sqrt(noise(i+71));
    const x=192+Math.cos(angle)*r*(157+12*Math.sin(angle*7)),y=122+Math.sin(angle)*r*(80+8*Math.cos(angle*8));
    const s=1.9+noise(i+933)*5.6;
    const high=(1-y/250)*.26+(Math.sin(x*.034+Math.sin(y*.058)*2)*.5+.5)*.22+noise(i+234)*.47;
    const k=8+Math.round(high*66);
    ctx.fillStyle='rgb('+(k+1)+','+Math.round(k+20+high*25)+','+Math.round(k*.82+13)+')';
    ctx.beginPath();ctx.ellipse(x,y,s*1.35,s*.63,(noise(i+921)-.5)*1.4,0,Math.PI*2);ctx.fill();
  }
  return tex(c);
}

export function groundTexture() {
  const c=canvas(320,320),ctx=c.getContext('2d')!;
  ctx.fillStyle='#918e74';ctx.fillRect(0,0,320,320);
  for(let i=0;i<2400;i++){
    const x=noise(i*2+15)*320,y=noise(i*3+42)*320,r=1+noise(i+61)**3*19;
    ctx.fillStyle=['#6d7560','#81836c','#9e9b7f','#8b896e','#86856b','#aaa58a'][i%6]!;
    ctx.globalAlpha=.36+noise(i+49)*.6;
    ctx.beginPath();ctx.ellipse(x,y,r*1.5,r*.58,noise(i+29)*2.4,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  const result=tex(c);result.wrapS=result.wrapT=T.RepeatWrapping;result.repeat.set(2.5,2);
  return result;
}

export function carvedPlaqueTexture() {
  const c=canvas(180,330),g=c.getContext('2d')!;
  const stone=g.createLinearGradient(0,0,180,330);
  stone.addColorStop(0,'#937e54');stone.addColorStop(.45,'#536654');stone.addColorStop(.87,'#655f49');stone.addColorStop(1,'#a19366');
  g.fillStyle=stone;g.fillRect(0,0,c.width,c.height);
  for(let i=0;i<2700;i++){
    const bright=i%3===0;
    g.fillStyle=bright?'rgba(193,178,124,.16)':'rgba(25,48,39,.15)';
    g.fillRect(noise(i+3)*180,noise(i+6)*330,1+noise(i+7)*3,2+noise(i+9)*9);
  }
  function strokePath(values:number[],width:number,base:string){
    for(const [off,color] of [[2.1,'#343c34'],[-1,'#bfaa77'],[0,base]] as const){
      g.beginPath();g.moveTo(values[0]+off,values[1]+off);
      for(let p=2;p<values.length;p+=2)g.lineTo(values[p]+off,values[p+1]+off);
      g.strokeStyle=color;g.lineWidth=width;g.lineJoin='miter';g.stroke();
    }
  }
  function twin(values:number[],w:number,color:string){
    strokePath(values,w,color);strokePath(values.map((v,i)=>i%2?v:180-v),w,color);
  }
  twin([8,321,8,8,30,8,30,17,44,17,44,10,70,10],5,'#8c7f55');
  twin([17,267,17,172,25,164,25,133,17,125,17,39,36,39,36,52,26,52],4,'#859073');
  twin([29,108,46,87,59,86,48,67,48,50,70,70,78,51,77,42],7,'#ad9661');
  twin([28,126,50,108,67,98,83,107],9,'#a18b61');
  twin([40,133,53,121,71,119,82,130,66,135,53,134],6,'#85937a');
  twin([34,145,44,156,51,158,50,172,64,179,74,173],7,'#968965');
  twin([82,133,82,145,72,159,84,162],5,'#bba173');
  strokePath([65,183,76,178,90,184,104,178,115,183,106,193,74,193,65,183],5,'#a19468');
  twin([51,179,56,198,73,210,84,210,90,204],5,'#758671');
  for(let j=0;j<3;j++){
    const y=237+22*j;
    twin([27,y,45,y,51,y-5,60,y-5,60,y+4,72,y+4,78,y-2],4,j%2?'#80917b':'#aa9363');
  }
  strokePath([68,76,90,55,112,76,90,94,68,76],6,'#ba9b62');
  strokePath([80,76,90,68,100,76,90,84,80,76],3,'#709588');
  twin([20,303,48,303,54,297,65,297,75,308,90,308],3,'#a79566');
  return tex(c);
}

type Vertex = readonly [number, number, number];
function meshBuilder() {
  const p:number[]=[], c:number[]=[], uv:number[]=[];
  const colour=new T.Color();
  function tri(a:Vertex,b:Vertex,d:Vertex,shade:number, uvs = [0,0,1,0,.5,1]) {
    p.push(...a,...b,...d); colour.setScalar(shade);
    for(let i=0;i<3;i++) c.push(colour.r,colour.g,colour.b);
    uv.push(...uvs);
  }
  function quad(a:Vertex,b:Vertex,d:Vertex,e:Vertex,shade:number) {
    tri(a,b,d,shade,[0,0,1,0,1,1]);tri(a,d,e,shade,[0,0,1,1,0,1]);
  }
  function done() {
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
  }
  return {tri,quad,done};
}

export function carvedStone() {
  const mesh=meshBuilder();
  const ring=[[-.41,-.5],[.42,-.5],[.5,-.42],[.5,.39],[.41,.5],[-.4,.5],[-.5,.41],[-.5,-.40]];
  const v=(i:number,y:number,s:number):Vertex=>[ring[i%8][0]*s,y,ring[i%8][1]*s];
  for(let i=0;i<8;i++) {
    const j=(i+1)%8;
    mesh.quad(v(i,-.5,.94),v(i,-.40,1),v(j,-.40,1),v(j,-.5,.94),.57);
    mesh.quad(v(i,-.40,1),v(i,.38,1),v(j,.38,1),v(j,-.40,1),.87 + .09 * noise(i));
    mesh.quad(v(i,.38,1),v(i,.5,.94),v(j,.5,.94),v(j,.38,1),1);
    const a=v(i,.5,.94), b=v(j,.5,.94);
    mesh.tri([0,.5,0],b,a,1,[.5,.5,b[0]+.5,b[2]+.5,a[0]+.5,a[2]+.5]);
    const u=v(i,-.5,.94), v2=v(j,-.5,.94);
    mesh.tri([0,-.5,0],u,v2,.64,[.5,.5,u[0]+.5,u[2]+.5,v2[0]+.5,v2[2]+.5]);
  }
  return mesh.done();
}

// Compound palm fronds have individually cut leaflets, so they retain their silhouette from below.
export function palmCrown() {
  const mesh=meshBuilder();
  for(let frond=0;frond<9;frond++){
    const angle=frond*2.39996, length=2.7+noise(frond+8)*1.15;
    const cs=Math.cos(angle),sn=Math.sin(angle),lift=.86+noise(frond+18)*.95;
    function v(t:number, side:number, tip=0):Vertex {
      const r=t*length, y=Math.sin(t*Math.PI*.95)*lift-t*t*.75;
      return [cs*r-sn*side,y-tip,sn*r+cs*side];
    }
    for(let j=0;j<10;j++){
      const t=j/10,n=t+.1, w=.47*Math.sin(Math.PI*(.07+.87*t))*(1-t*.35);
      mesh.quad(v(t,-.022),v(n,-.017),v(n,.017),v(t,.022),.77);
      for(const sign of [-1,1]){
        const tip=v(n+.05,w*sign,.16+w*.32);
        mesh.tri(v(t,0),v(n,.027*sign),tip,.58+noise(frond*20+j)*.4);
        mesh.tri(v(t,0),tip,v(n+.025,w*.68*sign,.22),.72+noise(frond+j)*.28);
      }
    }
  }
  return mesh.done();
}

export function bananaLeaves() {
  const mesh=meshBuilder();
  for(let leaf=0;leaf<7;leaf++){
    const angle=leaf*2.4, cs=Math.cos(angle),sn=Math.sin(angle), len=1.1+noise(leaf+1)*1.35;
    const raised=.25+noise(leaf+84)*.9;
    function part(t:number,width:number):Vertex {
      const r=t*len;
      return [cs*r-sn*width,Math.sin(t*2.5)*raised+t*.35-Math.abs(width)*.45,sn*r+cs*width];
    }
    for(let j=0;j<6;j++){
      const t=j/6,n=(j+1)/6,w=Math.sin(t*Math.PI)*.31,wn=Math.sin(n*Math.PI)*.31;
      for(const sign of [-1,1]){
        const split=j%2?.038:0;
        mesh.quad(part(t,0),part(n,0),part(n-split,wn*sign),part(t,w*sign),.66+noise(leaf+sign+9)*.34);
      }
    }
  }
  return mesh.done();
}
