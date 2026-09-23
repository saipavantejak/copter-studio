import {describe,it,expect,vi} from 'vitest';
import {createUsernameHandler} from '../../supabase/functions/username-login/handler';
const env=(key:string)=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'public-key'}[key]);
const req=(body:unknown,origin='https://copterstudios.com')=>new Request('https://test/functions/v1/username-login',{method:'POST',headers:{origin},body:JSON.stringify(body)});
describe('username password endpoint',()=>{
 it('returns only session tokens after password verification',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json('test-user')).mockResolvedValueOnce(Response.json({email:'private@example.com',email_confirmed_at:'2026-01-01'})).mockResolvedValueOnce(Response.json({access_token:'access',refresh_token:'refresh',user:{email:'private@example.com'}}));
  const response=await createUsernameHandler(env,fetcher)(req({username:'pilot',password:'password'}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({access_token:'access',refresh_token:'refresh'});
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({email:'private@example.com',password:'password'});
  expect(fetcher.mock.calls[2][1].headers.apikey).toBe('public-key');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
 });
 it('rejects missing/rate-limited usernames without requesting account data',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json(null));
  const response=await createUsernameHandler(env,fetcher)(req({username:'pilot',password:'wrong'}));
  expect(response.status).toBe(401);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('rejects unconfirmed users',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json('id')).mockResolvedValueOnce(Response.json({email:'private@example.com',email_confirmed_at:null}));
  expect((await createUsernameHandler(env,fetcher)(req({username:'pilot',password:'password'}))).status).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('never returns account data for bad passwords',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json('id')).mockResolvedValueOnce(Response.json({email:'private@example.com',email_confirmed_at:'yes'})).mockResolvedValueOnce(Response.json({error:'Invalid password for private@example.com'},{status:400}));
  const response=await createUsernameHandler(env,fetcher)(req({username:'pilot',password:'wrong'}));
  expect(response.status).toBe(401);expect(await response.text()).not.toContain('private@example.com');
 });
 it('rejects foreign origins and malformed requests before lookup',async()=>{
  const fetcher=vi.fn();const handler=createUsernameHandler(env,fetcher);
  expect((await handler(req({username:'pilot',password:'password'},'https://evil.test'))).status).toBe(403);
  expect((await handler(req({username:'a',password:'password'}))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
 });
});
