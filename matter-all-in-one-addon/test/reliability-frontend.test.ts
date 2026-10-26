import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const ctx=vi.hoisted(()=>({effects:[] as any[],setters:[] as any[],api:Object.fromEntries(['getStatus','getDevices','getCameras','getScryptedConfig','getCameraUiConfig','getCameraUiCameras'].map(k=>[k,vi.fn()]))}));
vi.mock('react',()=>({useState:(x:any)=>{const set=vi.fn();ctx.setters.push(set);return [x,set]},useEffect:(f:any)=>ctx.effects.push(f),useMemo:(f:any)=>f(),useCallback:(f:any)=>f,useRef:(v:any)=>({current:v})}));
vi.mock('../src/frontend/src/api/client',()=>({api:ctx.api}));
import {useAddonState} from '../src/frontend/src/hooks/useAddonState';
class FakeEventSource {static current:any;onopen:any;onmessage:any;onerror:any;close=vi.fn();constructor(){FakeEventSource.current=this}}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
beforeEach(()=>{vi.useFakeTimers();ctx.effects=[];ctx.setters=[];vi.stubGlobal('EventSource',FakeEventSource);Object.values(ctx.api).forEach((f:any)=>f.mockReset().mockResolvedValue([]));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
describe('frontend inventory synchronization',()=>{
 it('shows devices independently of a slow optional service',async()=>{
  let resolve!:any;ctx.api.getScryptedConfig.mockReturnValue(new Promise(r=>resolve=r));ctx.api.getDevices.mockResolvedValue([{entityId:'light.audit'}]);
  useAddonState();const cleanup=ctx.effects[0]();await flush();
  expect(ctx.setters[1]).toHaveBeenCalledWith([{entityId:'light.audit'}]);expect(ctx.setters[6]).toHaveBeenCalledWith(false);
  resolve({});await flush();cleanup();
 });
 it('applies HA state events directly without reloading inventory',async()=>{
  useAddonState();const cleanup=ctx.effects[0]();await flush();const es=FakeEventSource.current;es.onopen();
  es.onmessage({data:JSON.stringify({type:'state_changed',entityId:'light.audit',state:'on',attributes:{brightness:10}})});
  const updater=ctx.setters[1].mock.calls.at(-1)[0];
  expect(updater([{entityId:'light.audit',state:'off',attributes:{friendly_name:'Audit'}}])).toEqual([{entityId:'light.audit',state:'on',attributes:{friendly_name:'Audit',brightness:10}}]);
  await vi.advanceTimersByTimeAsync(2000);expect(ctx.api.getDevices).toHaveBeenCalledTimes(1);cleanup();
 });
 it('retains a realtime state event received before the inventory snapshot returns',async()=>{
  let resolve!:any;ctx.api.getDevices.mockReturnValueOnce(new Promise(r=>resolve=r));
  useAddonState();const cleanup=ctx.effects[0]();const es=FakeEventSource.current;es.onopen();
  es.onmessage({data:JSON.stringify({type:'state_changed',entityId:'light.audit',state:'on',attributes:{brightness:10}})});
  resolve([{entityId:'light.audit',state:'off',attributes:{friendly_name:'Audit'}}]);await flush();
  expect(ctx.setters[1]).toHaveBeenLastCalledWith([{entityId:'light.audit',state:'on',attributes:{friendly_name:'Audit',brightness:10}}]);cleanup();
 });
 it('reconciles a device event received during an in-flight refresh',async()=>{
  let resolve!:any;ctx.api.getScryptedConfig.mockReturnValueOnce(new Promise(r=>resolve=r));
  useAddonState();const cleanup=ctx.effects[0]();await flush();const es=FakeEventSource.current;es.onopen();es.onmessage({data:JSON.stringify({type:'device_update'})});
  await vi.advanceTimersByTimeAsync(1100);resolve({});await flush();expect(ctx.api.getDevices).toHaveBeenCalledTimes(2);cleanup();
 });
});
