import './style.css';
import { DeviceSession } from './device';
import { COURSE_LENGTH, EscapeRun, SLIDE_RATIO, WARNING_DISTANCE } from './game';
import { fillIcons, setIcon } from './icons';
import type { IconName } from './icons';
import { ExpeditionAudio } from './sound';
import type { TempleScene } from './scene';

const chapters = [
  {name:'苔石古道',art:'trail',range:'0 – 600 公尺',description:'穿過覆苔的石門，沿著遺物指引的彎道深入叢林。看見斷橋時加快踩踏，探險者會自動起跳。'},
  {name:'峽谷吊橋',art:'bridge',range:'600 – 1,300 公尺',description:'瀑布下方是深谷，腳下的木橋一路通向對岸。看見倒木時放慢踏頻，探險者便會俯身滑過。'},
  {name:'火炬神殿',art:'sanctum',range:'1,300 – 2,000 公尺',description:'踏入火光照亮的神殿，在守衛追趕下穿過最後的拱門。沿著前方的光，跑完兩公里即可逃出遺跡。'},
];
type Quality = 'auto'|'high'|'low';
interface Settings { reference:number; quality:Quality; reduced:boolean; sound:boolean }
const storageKey='relic-run.preferences.v1';
function loadSettings():Settings {
  const defaults:Settings={reference:60,quality:'auto',reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,sound:false};
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey) || '{}');
    return {
      reference:Number.isInteger(saved.reference) && saved.reference>=2 && saved.reference<=65535 ? saved.reference : defaults.reference,
      quality:['auto','low','high'].includes(saved.quality) ? saved.quality : defaults.quality,
      reduced:typeof saved.reduced==='boolean' ? saved.reduced : defaults.reduced,
      sound:typeof saved.sound==='boolean' ? saved.sound : defaults.sound,
    };
  } catch { return defaults; }
}
const settings=loadSettings();
const run=new EscapeRun(settings.reference);
const audio=new ExpeditionAudio();
const byId=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const btn=(id:string)=>byId<HTMLButtonElement>(id);
const show=(id:string,visible:boolean)=>{byId(id).hidden=!visible;};
const put=(id:string,value:string)=>{const e=byId(id); if(e.textContent!==value)e.textContent=value;};
const dialog=byId<HTMLDialogElement>('dialog');
let scene:TempleScene|null=null;
let sceneLoading:Promise<void>|null=null;
let frameId=0, lastFrame=0, lastHud=0, lastFootstep=0, operation=0;
let busy=false, readOnly=false, noticeTimer:ReturnType<typeof setTimeout>;
let graphicsLost=false;
const device=new DeviceSession(reason=>{
  if(run.phase==='home'||run.phase==='complete')return;
  ++operation;
  busy=false;
  run.pause();
  sessionPanel('paused',reason);
});
device.onStopUnconfirmed=reason=>{
  toast(reason);
  if(run.phase==='paused'||run.phase==='ready')sessionPanel('paused',reason);
  else if(run.phase==='complete')put('session-detail',reason);
};
const readable=(err:unknown)=>err instanceof Error ? err.message : String(err);
const formattedTime=(sec:number)=>Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0');
function saveSettings(){ try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{/* Storage is optional. */} }
function toast(message:string) {
  put('toast',message);show('toast',true);clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>show('toast',false),5600);
}
function buttonIcon(id:string,name:IconName,label:string) {
  const button=btn(id);
  setIcon(button.querySelector('i')!,name);
  button.title=label;button.setAttribute('aria-label',label);
}
function syncSound() {
  audio.enabled=settings.sound;
  buttonIcon('sound',settings.sound?'volume':'mute',settings.sound?'關閉音效':'開啟音效');
  btn('sound').setAttribute('aria-pressed',String(settings.sound));
}
fillIcons();syncSound();
function showPopup(content:string) {
  if(run.phase==='running'||(busy&&run.phase!=='home'&&run.phase!=='complete'))pause('查看選單時已暫停。');
  byId('dialog-content').innerHTML=content;
  fillIcons(dialog);
  if(!dialog.open)dialog.showModal();
}
btn('dialog-close').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}};
btn('guide').onclick=()=>{
  showPopup('<div class="panel-kicker">FIELD GUIDE</div><h2 id="dialog-title">玩法指南</h2>'+
    '<div class="guide-row"><i data-icon="gauge"></i><div><b>用踏頻控制速度</b>踩快就跑快，停踩即可歇腳。角色會沿著路線自動轉彎。</div></div>'+
    '<div class="guide-row"><i data-icon="jump"></i><div><b>斷橋前加快踩踏</b>達到舒適踏頻便會自動跳躍，跨過缺口可延續連擊。</div></div>'+
    '<div class="guide-row"><i data-icon="slide"></i><div><b>倒木前放慢踏頻</b>維持踩踏並降至舒適踏頻的 85% 以下，讓角色滑過倒木。</div></div>'+
    '<div class="guide-row"><i data-icon="gem"></i><div><b>收集遺物，逃出神廟</b>沿途收集金色遺物。失誤會讓守衛追近，仍可繼續跑向出口。</div></div>');
};
document.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach(button=>button.onclick=()=>{
  const index=Number(button.dataset.chapter), chapter=chapters[index];
  showPopup('<img class="dialog-art" src="'+import.meta.env.BASE_URL+'art/'+chapter.art+'.webp" alt=""><div class="panel-kicker">CHAPTER 0'+(index+1)+'　·　'+chapter.range+'</div><h2 id="dialog-title">'+chapter.name+'</h2><p>'+chapter.description+'</p>');
});
btn('settings').onclick=()=>{
  showPopup('<div class="panel-kicker">PREFERENCES</div><h2 id="dialog-title">遊戲設定</h2><form class="settings-form" id="settings-form">'+
    '<label for="reference">舒適踏頻（RPM）<input id="reference" type="number" min="2" max="65535" step="1" required></label>'+
    '<label for="quality">畫質<select id="quality"><option value="auto">自動</option><option value="high">高畫質</option><option value="low">低畫質</option></select></label>'+
    '<label for="reduced">減少鏡頭動態<input id="reduced" type="checkbox"></label><button class="button primary" type="submit">儲存設定</button></form>');
  byId<HTMLInputElement>('reference').value=String(settings.reference);
  byId<HTMLSelectElement>('quality').value=settings.quality;
  byId<HTMLInputElement>('reduced').checked=settings.reduced;
  byId<HTMLFormElement>('settings-form').onsubmit=event=>{
    event.preventDefault();
    settings.reference=byId<HTMLInputElement>('reference').valueAsNumber;
    settings.quality=byId<HTMLSelectElement>('quality').value as Quality;
    settings.reduced=byId<HTMLInputElement>('reduced').checked;
    saveSettings();run.referenceRpm=settings.reference;setDemoRange();
    scene?.setOptions(settings.quality,settings.reduced);
    if(run.phase!=='home'&&scene)scene.render(run,0);
    dialog.close();toast('已儲存遊戲設定。');
  };
};
btn('sound').onclick=async()=>{
  settings.sound=!settings.sound;saveSettings();syncSound();
  await audio.unlock();audio.play('relic');
};
btn('fullscreen').onclick=async()=>{
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {toast('目前視窗無法切換全螢幕。');}
};
document.addEventListener('fullscreenchange',()=>buttonIcon('fullscreen',document.fullscreenElement?'shrink':'expand',document.fullscreenElement?'離開全螢幕':'進入全螢幕'));
if(!document.fullscreenEnabled)btn('fullscreen').hidden=true;

async function loadScene() {
  if(scene&&!graphicsLost)return;
  if(sceneLoading)return sceneLoading;
  sceneLoading=(async()=>{
    const {TempleScene}=await import('./scene');
    scene?.dispose();scene=null;
    const canvas=document.createElement('canvas');byId('world').replaceChildren(canvas);
    try {
      scene=new TempleScene(canvas,()=>{
        graphicsLost=true;
        if(run.phase!=='home'&&run.phase!=='complete')pause('3D 畫面暫時中斷，按繼續可重新載入場景。');
      });
      graphicsLost=false;scene.setOptions(settings.quality,settings.reduced);
    } catch {
      canvas.remove();throw new Error('無法開啟 3D 畫面。請開啟瀏覽器的圖形加速，或使用支援 WebGL 2 的瀏覽器。');
    }
  })().finally(()=>{sceneLoading=null;});
  return sceneLoading;
}
function refreshHomeButtons(){
  btn('connect').disabled=busy;btn('demo').disabled=busy;
}
function setRideView(active:boolean) {
  document.body.dataset.view=active?'ride':'home';
  show('home',!active);show('ride',active);
  if(!active){show('session-panel',false);show('cue',false);}
}
function sessionPanel(state:'ready'|'paused'|'complete',reason?:string) {
  const complete=state==='complete', paused=state==='paused';
  show('session-panel',true);show('cue',false);show('results',complete);
  btn('pause').disabled=true;
  put('session-kicker',complete?'EXPEDITION COMPLETE':paused?'EXPEDITION PAUSED':'EXPEDITION READY');
  put('session-title',complete?'成功逃出神廟':paused?'探險已暫停':'準備進入遺跡');
  put('session-detail',reason ?? (complete?'石門已在身後關閉，你帶著遺物回到了陽光下。':paused?'里程已保留，準備好後可以繼續。':'已連接單車。按開始會啟動機台，也可以從機台面板啟動後選擇唯讀遊玩。'));
  put('begin',complete?'再跑一次':paused?'繼續逃亡':'開始逃亡');
  show('begin',complete||device.connected);btn('begin').disabled=busy;
  show('readonly',!complete&&device.mode==='ble'&&device.connected&&(!paused||!readOnly));btn('readonly').disabled=busy;
  show('reconnect',!complete&&device.mode==='ble'&&!device.connected);btn('reconnect').disabled=busy;
  if(complete){
    byId('results').innerHTML='<span>逃亡距離<b>2,000 m</b></span><span>踩踏時間<b>'+formattedTime(run.elapsed)+'</b></span><span>收集遺物<b>'+run.relicCount+' / '+run.relics.length+'</b></span><span>冒險得分<b>'+run.score.toLocaleString()+'</b></span><span>最高連擊<b>'+run.maxCombo+' 次</b></span>';
  }
  byId('session-title').focus({preventScroll:true});
  if(scene&&!graphicsLost)scene.render(run,0);
}
function refreshHud(rpm:number|null) {
  const chapter=chapters[run.chapter];
  put('hud-kicker','CHAPTER 0'+(run.chapter+1));put('hud-name',chapter.name);
  put('hud-mode',device.mode==='demo'?'模擬試玩':readOnly?'單車 · 唯讀':'單車 · 藍牙');
  put('distance',String(Math.floor(run.distance)));put('rpm',rpm===null?'—':String(Math.round(rpm)));
  put('speed',String(Math.round(run.speed)));
  put('relics',String(run.relicCount));put('run-score',run.score.toLocaleString());
  byId('progress').style.width=run.distance/COURSE_LENGTH*100+'%';
  const gate=run.nextObstacle, remaining=gate?gate.distance-run.distance:Infinity;
  let symbol:IconName='gauge',title='',caption='';
  if(run.phase==='running'){
    if(rpm===null){title='等待單車轉速';caption='收到有效踏頻後就會前進';}
    else if(rpm===0){title='踩踏即可前進';caption='角色與追逐進度已停住';}
    else if(run.action==='stumble'){symbol='footprint';title='守衛逼近';caption='繼續踩踏，拉開距離';}
    else if(gate&&remaining<=WARNING_DISTANCE){
      symbol=gate.kind;title=gate.kind==='jump'?'加快踩踏':'放慢踩踏';
      const target=gate.kind==='jump'?'至少 '+settings.reference:'不超過 '+Math.floor(settings.reference*SLIDE_RATIO);
      caption=(gate.kind==='jump'?'斷橋':'倒木')+' · '+Math.ceil(remaining)+' m · '+target+' RPM';
    }
  }
  show('cue',!!title);
  if(title){
    if(byId('cue-symbol').dataset.icon!==symbol)setIcon(byId('cue-symbol'),symbol);
    put('cue-title',title);put('cue-caption',caption);
  }
}
function setDemoControl(value:number) {
  device.setDemoRpm(value);
  const slider=byId<HTMLInputElement>('rpm-control');
  slider.value=String(device.demoRpm);put('rpm-value',device.demoRpm+' RPM');
}
function setDemoRange() {
  const slider=byId<HTMLInputElement>('rpm-control');
  slider.max=String(Math.min(65535,Math.max(140,settings.reference*2)));
  if(device.mode==='demo')setDemoControl(Math.min(device.demoRpm,Number(slider.max)));
}
byId<HTMLInputElement>('rpm-control').oninput=e=>setDemoControl(Number((e.currentTarget as HTMLInputElement).value));
function tick(now:number) {
  frameId=0;
  if(run.phase!=='running'||!scene||graphicsLost)return;
  const dt=Math.max(0,Math.min(.5,(now-lastFrame)/1000));lastFrame=now;
  const rpm=device.rpm(),relics=run.relicCount,misses=run.mistakes;
  for(let left=dt;left>0;left-=.25)run.update(Math.min(.25,left),rpm);
  scene.render(run,dt);
  if(relics<run.relicCount)audio.play('relic');
  else if(misses<run.mistakes)audio.play('miss');
  else if(run.speed>0&&run.elapsed-lastFootstep>Math.max(.22,.52-run.speed*.005)){lastFootstep=run.elapsed;audio.play('step');}
  if(run.distance===COURSE_LENGTH){
    refreshHud(rpm);void device.halt();audio.play('finish');sessionPanel('complete');return;
  }
  if(now-lastHud>=90){refreshHud(rpm);lastHud=now;}
  frameId=requestAnimationFrame(tick);
}
function animate(){
  cancelAnimationFrame(frameId);
  lastFrame=performance.now();lastHud=0;
  refreshHud(device.rpm());frameId=requestAnimationFrame(tick);
}
async function connect(mode:'ble'|'demo') {
  if(busy)return;
  const id=++operation;busy=true;refreshHomeButtons();
  show('toast',false);
  const unlock=audio.unlock();
  try{
    // Open the native device chooser directly from the button gesture.
    await device.connect(mode);
    await loadScene();await unlock;
    if(id!==operation)return;
    run.reset();run.referenceRpm=settings.reference;readOnly=false;lastFootstep=0;
    setRideView(true);show('demo-controller',mode==='demo');
    setDemoRange();setDemoControl(settings.reference);
    refreshHud(device.rpm());scene!.render(run,0);
    busy=false;
    if(mode==='demo')await start(false);
    else sessionPanel('ready',device.connected?undefined:'單車連線已中斷，請重新連線。');
  }catch(error){
    if(id===operation){await device.disconnect();setRideView(false);run.phase='home';toast(readable(error));}
  }finally{if(id===operation)busy=false;refreshHomeButtons();}
}
async function start(observer:boolean) {
  if(busy)return;
  const id=++operation;busy=true;
  btn('begin').disabled=btn('readonly').disabled=true;
  try{
    await loadScene();await audio.unlock();
    if(id!==operation)return;
    if(document.hidden)throw new Error('請在遊戲頁面按下開始。');
    if(run.phase==='complete'){run.reset();lastFootstep=0;}
    await device.start(observer);
    if(id!==operation)return;
    readOnly=device.readOnly;run.start();show('session-panel',false);
    btn('pause').disabled=false;audio.play('start');animate();
    if(device.mode!=='demo')btn('pause').focus({preventScroll:true});
  }catch(error) {
    if(id===operation){busy=false;sessionPanel(run.distance||run.phase==='paused'?'paused':'ready',readable(error));}
  }finally{
    if(id===operation){busy=false;btn('begin').disabled=btn('readonly').disabled=false;refreshHomeButtons();}
  }
}
function pause(reason?:string) {
  ++operation;busy=false;cancelAnimationFrame(frameId);run.pause();
  void device.halt();refreshHud(device.rpm());sessionPanel('paused',reason);
}
async function home() {
  ++operation;busy=true;cancelAnimationFrame(frameId);run.pause();
  btn('home-button').disabled=true;
  try{await device.disconnect();}
  finally{
    run.reset();run.phase='home';setRideView(false);busy=false;refreshHomeButtons();
    btn('home-button').disabled=false;btn('demo').focus({preventScroll:true});
  }
}
btn('connect').onclick=()=>void connect('ble');btn('demo').onclick=()=>void connect('demo');
btn('begin').onclick=()=>void start((run.phase==='paused'||run.phase==='complete')&&readOnly);
btn('readonly').onclick=()=>void start(true);btn('pause').onclick=()=>pause();btn('home-button').onclick=()=>void home();
btn('reconnect').onclick=async()=>{
  if(busy)return;const id=++operation;busy=true;btn('reconnect').disabled=true;
  try{await device.connect('ble',true);if(id===operation){busy=false;sessionPanel('paused','已重新連線。按繼續後才會恢復逃亡。');}}
  catch(error){if(id===operation){busy=false;sessionPanel('paused',readable(error));}}
  finally{if(id===operation)busy=false;}
};
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!dialog.open&&run.phase==='running'){event.preventDefault();pause();}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&(run.phase==='running'||(busy&&run.phase!=='home'&&run.phase!=='complete')))pause('頁面已切至背景，冒險進度已保留。');
});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);run.pause();device.closeNow();});
window.addEventListener('pageshow',event=>{if(event.persisted)void home();});
window.addEventListener('resize',()=>{if(scene&&!graphicsLost&&run.phase!=='home'&&run.phase!=='running')requestAnimationFrame(()=>scene?.render(run,0));});
