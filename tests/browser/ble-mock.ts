import type {Page} from '@playwright/test';

declare global {
  interface Window {
    bleMock: {
      writes: { cmd: string; id: number; at: number }[];
      status(): { controlled: boolean; running: boolean };
      stale(): void;
      busy(): void;
      setRunning(): void;
      setRpm(value: number): void;
      dropStopReply(): void;
      disconnect(): void;
    };
  }
}

export async function mockBle(page:Page){await page.addInitScript(()=>{
 const win=window as any;let owner=false,running=false,seq=0,level=10,stale=false,busy=false,rpm=60;
 const chars=new Map<string,any>(),writes:any[]=[];
 let missingStopReply=false;
 let leaseUntil=0;
 const uuid=(n:number)=>`7e40000${n}-b5a3-f393-e0a9-e50e24dcca9e`;
 function emit(channel:number,value:unknown){const ch=chars.get(uuid(channel===1?2:channel===2?3:5));if(!ch)return;const bytes=new TextEncoder().encode(JSON.stringify(value));for(let offset=0;offset<bytes.length;offset+=12){const end=Math.min(offset+12,bytes.length),f=new Uint8Array(8+end-offset),v=new DataView(f.buffer);f.set([0xa7,1,channel,(offset===0?1:0)|(end===bytes.length?2:0)]);v.setUint16(4,seq&65535,true);v.setUint16(6,offset,true);f.set(bytes.subarray(offset,end),8);ch.value=v;ch.dispatchEvent(new Event('characteristicvaluechanged'));}}
 const lease=()=>{
   const now=performance.now();
   if(owner && now>=leaseUntil){owner=false;running=false;}
   return {owner:owner?1:busy?2:null,you_control:owner,remaining_ms:owner?Math.ceil(leaseUntil-now):0,stopping:false};
 };
 function state(){emit(1,{v:1,type:'state',seq:++seq,uptime_ms:Math.round(performance.now()),lease:lease(),heart:{bpm:84,age_ms:stale?10000:0},machine:{rpm:stale?null:running?rpm:0,age28_ms:stale?5000:0,reported_level:stale?null:level,age3f_ms:stale?5000:0,target_level:level,sent_level:level,level_ack_pending:false,level_queued:false,tracking:running,uart_online:true,pulse:'idle',timeouts:0},rfid:{uid:'00010203'}});}
 class Characteristic extends EventTarget{
  value?:DataView;bytes:number[]=[];
  async startNotifications(){return this;}
  async readValue(){return new DataView(new TextEncoder().encode(JSON.stringify({v:1,protocol:1})).buffer);}
  async writeValueWithResponse(input:Uint8Array){const f=new Uint8Array(input);if(f[3]&1)this.bytes=[];this.bytes.push(...f.subarray(8));if(!(f[3]&2))return;const cmd=JSON.parse(new TextDecoder().decode(new Uint8Array(this.bytes)));writes.push({...cmd,at:performance.now()});let ok=true;
    lease(); // Expired controllers lose their lease before a command is processed.
    if(cmd.cmd==='claim'){if(busy)ok=false;else{owner=true;leaseUntil=performance.now()+30000;}}
    if(cmd.cmd==='heartbeat'){if(owner)leaseUntil=performance.now()+30000;else ok=false;}
    if(cmd.cmd==='start')running=true;if(cmd.cmd==='stop')running=false;if(cmd.cmd==='release'){running=false;owner=false;}if(cmd.cmd==='set_resistance')level=cmd.level;
    if(cmd.cmd==='stop'&&missingStopReply)return;
    setTimeout(()=>{emit(4,{v:1,type:'response',id:cmd.id,cmd:cmd.cmd,ok,error:ok?undefined:'controller_busy',lease:lease()});state();},10);}
 }
 const device=new EventTarget() as any;device.name='RehabWebBLE test';let timer:any;
 device.gatt={connected:false,async connect(){this.connected=true;timer=setInterval(state,100);return{getPrimaryService:async()=>({getCharacteristic:async(id:string)=>{if(!chars.has(id))chars.set(id,new Characteristic());return chars.get(id);}})};},disconnect(){this.connected=false;if(owner)running=false;owner=false;clearInterval(timer);device.dispatchEvent(new Event('gattserverdisconnected'));}};
 Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>device}});
 win.bleMock={writes,status(){return {controlled:lease().you_control,running};},stale(){stale=true;state();},busy(){busy=true;state();},setRpm(value:number){rpm=value;stale=false;state();},setRunning(){running=true;state();},dropStopReply(){missingStopReply=true;},disconnect(){device.gatt.disconnect();}};
});}
