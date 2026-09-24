import {initialCheckpoint,advanceCheckpoint} from '../../../src/agent/CloudJobCore';
import {assertPromotable} from '../../../src/learning/TrainingJob';
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(fn:(req:Request)=>Promise<Response>)=>void};
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors={'Access-Control-Allow-Origin':'https://copterstudios.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
async function db(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw new Error('Database request failed');return r.status===204?null:r.json();
}
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin');const headers={...cors,...(origin==='https://www.copterstudios.com'?{'Access-Control-Allow-Origin':origin}:{}),'Content-Type':'application/json','Cache-Control':'no-store'};
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return response({});if(req.method!=='POST')return response({error:'POST required'},405);
 let body:any;try{const raw=await req.text();if(raw.length>100000)return response({error:'Request too large'},413);body=JSON.parse(raw);}catch{return response({error:'Invalid JSON'},400);}
 try{
  if(body.action==='tick'){
   if(!/^[0-9a-f-]{36}$/i.test(body.id??'')||!/^[0-9a-f-]{36}$/i.test(body.token??''))return response({error:'Unauthorized'},401);
   const job=await db('rpc/aether_claim',{p_id:body.id,p_token:body.token});if(!job)return response({accepted:false});
   try{const done=await advanceCheckpoint(job.checkpoint);await db('rpc/aether_commit',{p_id:job.id,p_lease:job.lease_id,p_checkpoint:job.checkpoint,p_done:done});}
   catch{await db('rpc/aether_commit',{p_id:job.id,p_lease:job.lease_id,p_checkpoint:job.checkpoint,p_done:false,p_error:'Execution failed; checkpoint retained. Export evidence for diagnosis.'});}
   return response({accepted:true});
  }
  const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return response({error:'Sign in to use cloud jobs'},401);
  const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization}});if(!auth.ok)return response({error:'Session expired. Sign in again.'},401);
  const user=await auth.json();if(!user.id||user.is_anonymous)return response({error:'A registered account is required'},403);
  if(body.action==='submit'){
   if(!/^[0-9a-f-]{36}$/i.test(body.requestId??''))return response({error:'Idempotency key required'},400);
   const checkpoint=initialCheckpoint(body.input);const id=await db('rpc/aether_submit',{p_owner:user.id,p_request:body.requestId,p_checkpoint:checkpoint});return response({id});
  }
  if(!/^[0-9a-f-]{36}$/i.test(body.id??''))return response({error:'Job ID required'},400);
  const rows=await db(`aether_jobs?id=eq.${body.id}&user_id=eq.${user.id}&select=id,status,checkpoint,promoted_at`);const job=rows[0];if(!job)return response({error:'Job not found'},404);
  if(body.action==='cancel'){await db(`aether_jobs?id=eq.${job.id}&user_id=eq.${user.id}&status=in.(queued,running)`,{status:'cancelled',lease_id:null,lease_until:null,updated_at:new Date().toISOString()},'PATCH');return response({cancelled:true});}
  if(body.action==='promote'){
   if(job.status!=='completed'||job.checkpoint.kind!=='training')return response({error:'Completed training required'},409);
   assertPromotable(job.checkpoint.training);await db(`aether_jobs?id=eq.${job.id}&user_id=eq.${user.id}`,{promoted_at:new Date().toISOString()},'PATCH');return response({candidate:job.checkpoint.training});
  }
  return response({error:'Unsupported action'},400);
 }catch(e){return response({error:e instanceof Error&&e.message!=='Database request failed'?e.message:'Cloud request failed. Check the two-jobs/day budget and existing active jobs.'},400);}
});
