import type {IncomingMessage,ServerResponse} from 'http';
export const config={maxDuration:40};
// Public demo limiter is instance-local; a shared quota is required before paid-scale usage.
const buckets=new Map<string,{count:number;reset:number}>();
export function sanitizePayload(body:any){
 if(!body||body.model!=='gemini-2.5-flash')throw new Error('Unsupported model');
 if(Buffer.byteLength(JSON.stringify(body))>65536)throw new Error('Request exceeds 64 KB');
 const p=body.payload;
 const parts=(v:any)=>{if(!Array.isArray(v)||v.length<1||v.length>8||v.some(x=>typeof x?.text!=='string'))throw new Error('Only text parts are supported');return v.map(x=>({text:x.text}));};
 if(!Array.isArray(p?.contents)||p.contents.length<1||p.contents.length>16)throw new Error('Use 1–16 messages');
 const contents=p.contents.map((m:any)=>{if(!['user','model'].includes(m.role))throw new Error('Invalid message role');return {role:m.role,parts:parts(m.parts)};});
 const g=p.generationConfig??{};
 const temperature=typeof g.temperature==='number'&&Number.isFinite(g.temperature)?Math.max(0,Math.min(1,g.temperature)):0.3;
 return {contents,...(p.system_instruction?{system_instruction:{parts:parts(p.system_instruction.parts)}}:{}),generationConfig:{temperature,maxOutputTokens:2048,...(g.responseMimeType==='application/json'?{responseMimeType:'application/json'}:{})}};
}
export default async function handler(req:IncomingMessage&{body?:any},res:ServerResponse&{status:(n:number)=>any;json:(v:any)=>void;send:(v:string)=>void}){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 let payload:ReturnType<typeof sanitizePayload>;
 try{payload=sanitizePayload(req.body);}catch(e){return res.status(400).json({error:e instanceof Error?e.message:'Invalid payload'});}
 const now=Date.now();for(const [k,v]of buckets)if(v.reset<now)buckets.delete(k);
 const ip=String(req.headers['x-forwarded-for']??req.socket.remoteAddress??'unknown').split(',')[0];
 if(!buckets.has(ip)&&buckets.size>=10000)return res.status(429).json({error:'Service busy; try later'});
 const bucket=buckets.get(ip)??{count:0,reset:now+60000};buckets.set(ip,bucket);
 if(++bucket.count>30){res.setHeader('Retry-After','60');return res.status(429).json({error:'Request limit reached. Try again in a minute.'});}
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:'GEMINI_API_KEY not configured'});
 try{
  const upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!upstream.ok)return res.status(upstream.status===429?429:502).json({error:upstream.status===429?'AI provider is busy. Retry later.':'AI provider could not complete the request.'});
  const data=await upstream.text();res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.status(200).send(data);
 }catch(e){return res.status(e instanceof Error&&e.name==='TimeoutError'?504:502).json({error:'AI request timed out or could not connect. Local planning remains available.'});}
}
