import type {IncomingMessage,ServerResponse} from 'node:http';
export const MAX_BODY_BYTES=65536;
export const MODEL='gemini-2.5-flash';
type TextPart={text:string};
type Message={role:'user'|'model';parts:TextPart[]};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected an object');return v as Record<string,unknown>;};
function parts(value:unknown):TextPart[]{
 if(!Array.isArray(value)||value.length<1||value.length>8)throw Error('Use text parts only');
 return value.map(v=>{const p=object(v);if(typeof p.text!=='string')throw Error('Use text parts only');return {text:p.text};});
}
/** Allowlisted data only: no provider tools/code execution or arbitrary config. */
export function sanitizePayload(body:unknown){
 const b=object(body);if(b.model!==MODEL)throw Error('Unsupported model');
 if(Buffer.byteLength(JSON.stringify(b))>MAX_BODY_BYTES)throw Error('Request exceeds body limit');
 const p=object(b.payload),g=p.generationConfig===undefined?{}:object(p.generationConfig);
 if(!Array.isArray(p.contents)||p.contents.length<1||p.contents.length>16)throw Error('Use bounded messages');
 const contents:Message[]=p.contents.map(v=>{const m=object(v);if(m.role!=='user'&&m.role!=='model')throw Error('Invalid role');return {role:m.role,parts:parts(m.parts)};});
 const temperature=typeof g.temperature==='number'&&Number.isFinite(g.temperature)?Math.max(0,Math.min(1,g.temperature)):.3;
 return {contents,...(p.system_instruction?{system_instruction:{parts:parts(object(p.system_instruction).parts)}}:{}),generationConfig:{temperature,maxOutputTokens:2048,...(g.responseMimeType==='application/json'?{responseMimeType:'application/json'}:{})}};
}
export type GatewayRequest=IncomingMessage&{body?:unknown};
export type GatewayResponse=Pick<ServerResponse,'writeHead'|'end'>;
type Bucket={count:number;reset:number};
/** Bounded instance-local limiter; not a distributed account-wide quota. */
export function createLimiter(limit=30,windowMs=60000,maxKeys=10000){
 const buckets=new Map<string,Bucket>();return (key:string,now=Date.now())=>{
  for(const [k,b]of buckets)if(b.reset<=now)buckets.delete(k);
  if(!buckets.has(key)&&buckets.size>=maxKeys)return false;
  const b=buckets.get(key)??{count:0,reset:now+windowMs};buckets.set(key,b);return ++b.count<=limit;
 };
}
const allowed=createLimiter();
async function readBody(req:GatewayRequest):Promise<unknown>{
 if(req.body!==undefined)return req.body;
 const declared=Number(req.headers['content-length']);if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw Error('Request exceeds body limit');
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=b.length;if(bytes>MAX_BODY_BYTES)throw Error('Request exceeds body limit');chunks.push(b);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function handleGemini(req:GatewayRequest,res:GatewayResponse):Promise<void>{
 const reply=(status:number,body:object)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 if(req.method!=='POST'){reply(405,{error:'Method not allowed'});return;}
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){reply(403,{error:'Origin not allowed'});return;}}catch{reply(403,{error:'Origin not allowed'});return;}}
 const ip=String(req.headers['x-forwarded-for']??req.socket?.remoteAddress??'unknown').split(',')[0];
 if(!allowed(ip)){reply(429,{error:'Request limit reached. Try again later.'});return;}
 let payload:ReturnType<typeof sanitizePayload>;
 try{payload=sanitizePayload(await readBody(req));}catch(error){reply(error instanceof Error&&error.message.includes('body limit')?413:400,{error:'Invalid or oversized request'});return;}
 const key=process.env.GEMINI_API_KEY;if(!key){reply(503,{error:'GEMINI_API_KEY not configured'});return;}
 try{
  const upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+MODEL+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!upstream.ok){reply(upstream.status===429?429:502,{error:'AI provider unavailable. Local planning remains available.'});return;}
  const data:unknown=await upstream.json(),candidate=object(data).candidates;
  if(!Array.isArray(candidate))throw Error('Invalid provider response');
  const raw=object(object(candidate[0]).content).parts;if(!Array.isArray(raw))throw Error('Invalid provider response');
  const clean=raw.filter(v=>{const p=object(v);return typeof p.text==='string'&&!p.thought;}).map(v=>({text:object(v).text}));
  if(!clean.length)throw Error('Empty provider response');reply(200,{candidates:[{content:{parts:clean}}]});
 }catch(error){reply(error instanceof Error&&error.name==='TimeoutError'?504:502,{error:'AI request timed out or could not connect. Local planning remains available.'});}
}
