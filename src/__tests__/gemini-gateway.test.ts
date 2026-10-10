import {describe,it,expect,vi,afterEach} from 'vitest';
import {createLimiter,handleGemini,type GatewayRequest,type GatewayResponse} from '../../server/geminiGateway';
import {Readable} from 'node:stream';
const body=()=>({model:'gemini-2.5-flash',payload:{contents:[{role:'user',parts:[{text:'hello'}]}]}});
let serial=0;
async function request(value:unknown,method='POST',origin?:string){
 const req=Object.assign(Readable.from([]),{method,body:value,headers:{host:'localhost',...(origin?{origin}:{})},socket:{remoteAddress:'test-'+serial++}}) as unknown as GatewayRequest;
 let status=0,data='';
 const res={writeHead:(code:number)=>{status=code;},end:(value:string)=>{data=value;}} as unknown as GatewayResponse;
 await handleGemini(req,res);return {status,data};
}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('shared Gemini gateway boundaries',()=>{
 it('limits requests and bounded keys without storing raw prompts',()=>{
  const allow=createLimiter(2,100,2);expect(allow('a',0)).toBe(true);expect(allow('a',0)).toBe(true);expect(allow('a',0)).toBe(false);
  expect(allow('b',0)).toBe(true);expect(allow('c',0)).toBe(false);expect(allow('a',100)).toBe(true);
 });
 it('rejects cross-origin and unsupported-method requests before provider calls',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect((await request(body(),'GET')).status).toBe(405);
  expect((await request(body(),'POST','https://other.example')).status).toBe(403);expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects malformed and oversized requests before provider calls',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect((await request({model:'unapproved',payload:{}})).status).toBe(400);
  const b=body();b.payload.contents[0].parts[0].text='x'.repeat(70000);
  expect((await request(b)).status).toBe(413);expect(fetch).not.toHaveBeenCalled();
 });
 it('returns graceful unavailable status when the server key is absent',async()=>{
  vi.stubEnv('GEMINI_API_KEY','');expect((await request(body())).status).toBe(503);
 });
 it('keeps the key out of the URL and strips tool/hidden provider responses',async()=>{
  vi.stubEnv('GEMINI_API_KEY','synthetic-server-key');
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:'hello'},{functionCall:{name:'dangerous'}}]}}]})});vi.stubGlobal('fetch',fetch);
  const r=await request(body());expect(r.status).toBe(200);expect(r.data).toContain('hello');expect(r.data).not.toContain('hidden');expect(r.data).not.toContain('functionCall');
  expect(fetch.mock.calls[0][0]).not.toContain('synthetic-server-key');expect(fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('synthetic-server-key');
 });
 it('does not return provider error bodies, exception details or secrets',async()=>{
  vi.stubEnv('GEMINI_API_KEY','synthetic-server-key');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:400,text:async()=>'synthetic-server-key'}));
  let r=await request(body());expect(r.status).toBe(502);expect(r.data).not.toContain('synthetic-server-key');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('synthetic-server-key')));r=await request(body());expect(r.status).toBe(502);expect(r.data).not.toContain('synthetic-server-key');
 });
});
