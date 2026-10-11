import {it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {parseAnalytics,handleAnalytics} from '../../server/aggregateAnalytics';
import type {GatewayRequest,GatewayResponse} from '../../server/geminiGateway';
import {recordAggregate} from '../aggregateAnalytics';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('accepts only event names and rejects identity or arbitrary properties',()=>{
 expect(parseAnalytics({event:'workspace_open'})).toBe('workspace_open');
 for(const x of [{event:'workspace_open',email:'x'},{event:'x'},null,[],{event:'simulation_start',url:'/secret'}])expect(()=>parseAnalytics(x)).toThrow();
});
it('does not collect unless explicitly enabled',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);vi.stubEnv('VITE_AGGREGATE_ANALYTICS_ENABLED','false');recordAggregate('workspace_open');expect(fetcher).not.toHaveBeenCalled();
});
it('enabled client sends no identifiers, cookies or referrer',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal('fetch',fetcher);vi.stubEnv('VITE_AGGREGATE_ANALYTICS_ENABLED','true');recordAggregate('feedback_open');
 expect(fetcher).toHaveBeenCalledWith('/api/analytics',expect.objectContaining({body:'{"event":"feedback_open"}',credentials:'omit',referrerPolicy:'no-referrer'}));
});
it('server defaults to off and never contacts a database',async()=>{
 vi.stubEnv('AGGREGATE_ANALYTICS_ENABLED','false');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const response={writeHead:vi.fn(),end:vi.fn()} as unknown as GatewayResponse;
 await handleAnalytics({method:'POST',headers:{},body:{event:'workspace_open'}} as GatewayRequest,response);expect(response.writeHead).toHaveBeenCalledWith(204,expect.anything());expect(fetcher).not.toHaveBeenCalled();
});
it('SQL increments only daily aggregates and denies anonymous reads/writes/RPC',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(readFileSync('supabase/analytics-schema.sql','utf8'));
 await db.exec("set role service_role; select public.increment_aggregate_event('workspace_open'); select public.increment_aggregate_event('workspace_open'); reset role;");
 const result=await db.query<{event:string;count:number}>("select event,count::int from public.aggregate_events");expect(result.rows).toEqual([{event:'workspace_open',count:2}]);
 await db.exec('set role anon');
 await expect(db.query('select * from public.aggregate_events')).rejects.toThrow();
 await expect(db.query("select public.increment_aggregate_event('workspace_open')")).rejects.toThrow();
 await db.exec('reset role');await expect(db.query("select public.increment_aggregate_event('email')")).rejects.toThrow();
 }finally{await db.close();}
},20000);
