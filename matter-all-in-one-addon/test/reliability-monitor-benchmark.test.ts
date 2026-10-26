import {it} from 'vitest';
import './mocks/matterbridge.mock.js';
import {HomeAssistantPlatform} from '../src/platform.js';
import {mockMatterbridge,mockLog} from './mocks/matterbridge.mock.js';
it('measures the periodic Matter connection monitor for a large inventory',()=>{
 const p:any=new HomeAssistantPlatform(mockMatterbridge as any,mockLog as any,{name:'audit',type:'dynamic',host:'localhost',token:'fake'} as any);
 p.nodeIdentities={get:()=>undefined};p.ha={hassStates:new Map(),hassEntities:new Map(),hassDevices:new Map(),hassAreas:new Map(),hassConfig:{}};
 for(let i=0;i<1804;i++){
  const id=`light.monitor_${i}`;const state={entity_id:id,state:'off',attributes:{friendly_name:`Audit ${i}`}};
  p.entities.set(id,{entityId:id,state,deviceType:{name:'OnOffLight'},constructor:{}});
  p.ha.hassStates.set(id,state);p.ha.hassEntities.set(id,{entity_id:id,device_id:`device-${i}`});p.ha.hassDevices.set(`device-${i}`,{name:`Audit ${i}`});
  if(i<33)p.exportedDevices.add(id);
 }
 const samples=[];for(let i=0;i<3;i++){const start=performance.now();p.monitorMatterConnections();samples.push(Math.round(performance.now()-start));}
 process.stdout.write('MONITOR_BENCHMARK '+JSON.stringify({entities:1804,exported:33,ms:samples})+'\n');
},30000);
