import {it,vi,expect} from 'vitest';
import {setupTest,resetTest,createTestEnvironment,destroyTestEnvironment,createServerNode,flushServerNode,addDevice} from 'matterbridge/test-utils/vitest';
import {VacuumEntity} from '../src/entities/vacuum.entity.js';
import {MatterDeviceTypes} from '../src/device-registry.js';
it('inspect and initialize actual RVC implementation under strict validation',async()=>{
 await setupTest('AuditRvc241');await createTestEnvironment('strict');
 try{
  const [server]=await createServerNode(5591,0x0074 as any);
  const p:any={matterbridge:{matterbridgeVersion:'3.11.0'},log:Object.fromEntries(['debug','info','notice','warn','error'].map(k=>[k,vi.fn()])),ha:{callService:async()=>{},hassEntities:new Map(),hassDevices:new Map(),hassStates:new Map()}};
  const v=new VacuumEntity(p,{entity_id:'vacuum.audit',state:'docked',attributes:{friendly_name:'AuditRvc',battery_level:70}} as any,MatterDeviceTypes.roboticVacuumCleaner);
  const ep:any=await v.createEndpoint();
  const before={deviceTypes:Array.from(ep.deviceTypes.keys()),descriptor:ep.behaviors.optionsFor(ep.behaviors.supported.descriptor),behaviors:Object.keys(ep.behaviors.supported)};
  const initialized=await addDevice(server,ep);
  expect(initialized).toBe(true);
  expect(ep.state.descriptor.deviceTypeList.map((d:any) => d.deviceType)).toContain(0x0074);
  expect(ep.state.descriptor.deviceTypeList.map((d:any) => d.deviceType)).toContain(0x0011);
  expect(ep.behaviors.supported.rvcCleanMode).toBeUndefined();
  process.stdout.write('AUDIT_RVC_REAL '+JSON.stringify({before,initialized,descriptor:initialized?ep.state.descriptor:undefined})+'\n');
 }finally{await flushServerNode();await destroyTestEnvironment();resetTest()}
},15000);
