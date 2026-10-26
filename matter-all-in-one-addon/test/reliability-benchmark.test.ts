import {it,vi} from 'vitest';
import './mocks/matterbridge.mock.js';
import {HomeAssistantPlatform} from '../src/platform.js';
import {mockMatterbridge,mockLog} from './mocks/matterbridge.mock.js';
it('measure actual GET /devices with synthetic inventories',async()=>{
 const measurements=[];
 for(const count of [100,500,1000]){
  const p:any=new HomeAssistantPlatform(mockMatterbridge as any,mockLog as any,{name:'audit',type:'dynamic',host:'localhost',token:'fake'} as any);
  p._uiPort=0;p.nodeIdentities={get:()=>undefined};
  p.ha={hassStates:new Map(),hassEntities:new Map(),hassDevices:new Map(),hassAreas:new Map(),hassConfig:{}};
  for(let i=0;i<count;i++){
   const id=`light.audit_${i}`;const state={entity_id:id,state:'off',attributes:{friendly_name:`Audit ${i}`}};
   p.entities.set(id,{entityId:id,state,deviceType:{name:'OnOffLight'},constructor:{}});
   p.ha.hassStates.set(id,state);p.ha.hassEntities.set(id,{entity_id:id,device_id:`device-${i}`});
   p.ha.hassDevices.set(`device-${i}`,{name:`Audit ${i}`});p.catalogedHaEntityIds.add(id);
  }
  await p.startUiServer();const port=p.uiServer.address().port;
  const times=[];const timerDrifts=[];let bytes=0;
  for(let repeat=0;repeat<3;repeat++){const start=performance.now();const timer=new Promise<number>(resolve=>setTimeout(()=>resolve(Math.round(performance.now()-start-10)),10));const response=await fetch(`http://127.0.0.1:${port}/api/custom/devices`);const txt=await response.text();times.push(Math.round(performance.now()-start));bytes=txt.length;timerDrifts.push(await timer);if(JSON.parse(txt).length!==count)throw Error('bad response');}
  measurements.push({entities:count,ms:times,timer10msDrift:timerDrifts,bytes});await new Promise<void>(resolve=>p.uiServer.close(()=>resolve()));
 }
 process.stdout.write('AUDIT_BENCHMARK '+JSON.stringify(measurements)+'\n');
},30000);
