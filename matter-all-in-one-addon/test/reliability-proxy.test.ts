import {it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({handler:null as any,request:vi.fn()}));
vi.mock('http',()=>({default:{createServer:(handler:any)=>{state.handler=handler;return {listen:vi.fn()}},request:state.request}}));
vi.stubEnv('MATTER_AIO_ADMIN_TOKEN','audit-token');
await import('../src/proxy.js');
beforeEach(()=>{state.request.mockReset().mockReturnValue({on:vi.fn()})});
it.each(['192.168.1.50','172.200.1.50'])('rejects direct API traffic from %s',(ip)=>{
 const req={socket:{remoteAddress:ip},url:'/api/custom/reset-accessory/vacuum.audit',method:'POST',headers:{},pipe:vi.fn()};
 const res={writeHead:vi.fn(),end:vi.fn()};state.handler(req,res);
 expect(state.request).not.toHaveBeenCalled();expect(res.writeHead).toHaveBeenCalledWith(403,expect.anything());
});
it('accepts Supervisor ingress and injects only the internal token',()=>{
 const req={socket:{remoteAddress:'172.30.32.2'},url:'/api/custom/status',method:'GET',headers:{},pipe:vi.fn()};
 state.handler(req,{writeHead:vi.fn(),end:vi.fn()});expect(state.request.mock.calls[0][0].headers['x-matter-aio-token']).toBe('audit-token');
});
