import type {GatewayRequest,GatewayResponse} from './geminiGateway';
export const ANALYTICS_EVENTS=['workspace_open','simulation_start','feedback_open'] as const;
export type AnalyticsEvent=typeof ANALYTICS_EVENTS[number];
export const ANALYTICS_BODY_LIMIT=1024;
export function parseAnalytics(value:unknown):AnalyticsEvent {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid event');
 const data=value as Record<string,unknown>;
 if(Object.keys(data).length!==1||!ANALYTICS_EVENTS.includes(data.event as AnalyticsEvent))throw Error('Invalid event');
 return data.event as AnalyticsEvent;
}
// Global per-instance abuse bound: no IP, cookie, session or user identifier.
let windowEnd=0,count=0;
export async function handleAnalytics(req:GatewayRequest,res:GatewayResponse):Promise<void>{
 const reply=(status:number)=>{res.writeHead(status,{'Cache-Control':'no-store'});res.end();};
 if(process.env.AGGREGATE_ANALYTICS_ENABLED!=='true'){reply(204);return;}
 if(req.method!=='POST'){reply(405);return;}
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){reply(403);return;}}catch{reply(403);return;}}
 if(Date.now()>windowEnd){windowEnd=Date.now()+60000;count=0;}if(++count>60){reply(429);return;}
 let event:AnalyticsEvent;
 try{
  let body=req.body;
  if(body===undefined){const chunks:Buffer[]=[];let size=0;for await(const value of req){const b=Buffer.isBuffer(value)?value:Buffer.from(value);size+=b.length;if(size>ANALYTICS_BODY_LIMIT)throw Error('Oversize');chunks.push(b);}body=JSON.parse(Buffer.concat(chunks).toString());}
  if(Buffer.byteLength(JSON.stringify(body))>ANALYTICS_BODY_LIMIT)throw Error('Oversize');event=parseAnalytics(body);
 }catch{reply(400);return;}
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key){reply(503);return;}
 try{
  const url=new URL('/rest/v1/rpc/increment_aggregate_event',base);if(url.protocol!=='https:')throw Error('Invalid service URL');
  const result=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_event:event}),signal:AbortSignal.timeout(5000)});
  reply(result.ok?204:503);
 }catch{reply(503);}
}
