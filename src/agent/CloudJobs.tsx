import {useEffect,useRef,useState} from 'react';
import {cloudDatabase} from '../cloudDatabase';
import {useAppContext} from '../context/AppContext';
import {DEFAULT_MISSION} from '../MissionSpec';
import {trainingScope,type TrainingState} from '../learning/TrainingJob';
import type {Plan} from './AgentCore';
import type {CloudCheckpoint} from './CloudJobCore';
type Job={id:string;status:string;checkpoint:CloudCheckpoint;error:string|null;promoted_at:string|null};
const columns='id,status,checkpoint,error,promoted_at';
const style='px-3 py-2 border border-line-strong rounded-lg text-sm disabled:opacity-50';
async function request(body:unknown){
 if(!cloudDatabase)throw new Error('Cloud connection unavailable. Open copterstudios.com and sign in.');
 const {data:auth,error:authError}=await cloudDatabase.auth.getUser();
 if(authError||!auth.user)throw new Error('Sign in through Account before starting a cloud job.');
 const {data,error}=await cloudDatabase.functions.invoke('aether-jobs',{body});
 if(error){let message=error.message;try{const details=await error.context?.json();if(typeof details?.error==='string')message=details.error;}catch{}throw new Error(message);}
 if(data?.error)throw new Error(data.error);return data;
}
export function CloudJobs({plan}:{plan:Plan|null}){
 const app=useAppContext();const [jobs,setJobs]=useState<Job[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('Sign in to submit persistent cloud jobs.');const locked=useRef(false);const mounted=useRef(true);const identity=useRef<string|null>(null);
 const refresh=async()=>{if(!cloudDatabase)return;const {data:{user}}=await cloudDatabase.auth.getUser();if(!user){if(mounted.current)setJobs([]);return;}const owner=user.id;identity.current=owner;const {data,error}=await cloudDatabase.from('aether_jobs').select(columns).order('created_at',{ascending:false}).limit(10);if(error)throw error;if(mounted.current&&identity.current===owner)setJobs((data??[]) as Job[]);};
 useEffect(()=>{mounted.current=true;void refresh().catch(()=>{});const timer=setInterval(()=>void refresh().catch(()=>{}),10000);const subscription=cloudDatabase?.auth.onAuthStateChange((_event,session)=>{identity.current=session?.user.id??null;setJobs([]);});return()=>{mounted.current=false;clearInterval(timer);subscription?.data.subscription.unsubscribe();};},[]);
 const act=async(fn:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);try{await fn();await refresh();}catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:String(e));}finally{locked.current=false;if(mounted.current)setBusy(false);}};
 const submit=async(input:unknown)=>{await request({action:'submit',requestId:crypto.randomUUID(),input});setMessage('Job queued. It continues after you close the browser. Checkpoints run approximately every 10 seconds; training usually takes several minutes.');};
 const promote=async(job:Job)=>{const {candidate}:{candidate:TrainingState}=await request({action:'promote',id:job.id});app.setSimStarted(false);app.setConfig(structuredClone(candidate.config));app.setTests({windEnabled:false,payloadShiftEnabled:false,batterySagEnabled:false,motorOutEnabled:false,missionPreset:'none',mission:{...DEFAULT_MISSION}});app.setDomainRandCfg(c=>({...c,enabled:false}));app.setSensorCfg(c=>({...c,enableNoise:false}));app.setSimResetTrigger(n=>n+1);app.agentRef.current.loadNativePolicy(candidate);app.handleModelLoaded();setMessage('Candidate activated for this session using its exact training configuration and 1 m / 16 s hover. Approval saved privately. Use Restore PD before changing aircraft or mission.');};
 return <section className="bg-surface border border-line rounded-xl p-4 space-y-3"><h3 className="font-bold">Background jobs & controller training</h3>
 <p className="text-sm">Server checkpoints survive closing this page. Two submissions per account per day, one active job per account; shared free-tier budget of 20 jobs/day. Export results before deleting your account.</p>
 <div className="flex flex-wrap gap-2"><button className={style} disabled={busy||!plan} onClick={()=>void act(()=>submit({kind:'benchmark',plan}))}>Approve plan for background execution</button><button className={style} disabled={busy} onClick={()=>void act(async()=>{trainingScope(app.config);await submit({kind:'training',config:structuredClone(app.config)});})}>Approve training current quadcopter</button><button className={style} disabled={busy} onClick={()=>void act(refresh)}>Refresh cloud jobs</button><button className={style} disabled={busy} onClick={()=>{app.setSimStarted(false);app.restorePD();setMessage('PD restored. No experimental controller is active.');}}>Restore PD</button></div>
 <p className="text-sm">Background benchmarks: ≤5 episodes/run, ≤16 seconds, randomization off. Training: 120 tabular Q-learning episodes, followed by 40 paired PD/candidate evaluations on held-out seeds, with clean and built-in wind conditions. Quadcopters only; 1 m hover; full aircraft configuration preserved. No measured gust or real-flight validation.</p>
 <p role="status" className="text-sm whitespace-pre-wrap">{message}</p>
 {jobs.map(j=><article key={j.id} className="border border-line rounded-lg p-3 space-y-2"><strong>{j.checkpoint.kind} · {j.status}</strong><p className="text-xs break-all">{j.id}{j.promoted_at?' · promotion approved':''}</p><p className="text-sm whitespace-pre-wrap">{j.error??(j.checkpoint.kind==='training'?j.checkpoint.training.summary:j.checkpoint.task.report||'Waiting for first checkpoint.')}</p><div className="flex gap-2 flex-wrap">
 {['queued','running'].includes(j.status)&&<button className={style} disabled={busy} onClick={()=>void act(async()=>{await request({action:'cancel',id:j.id});setMessage('Cancellation recorded. In-flight results will be discarded.');})}>Cancel cloud job</button>}
 {j.checkpoint.kind==='training'&&j.status==='completed'&&j.checkpoint.training.gate&&<button className={style} disabled={busy} onClick={()=>void act(()=>promote(j))}>Approve simulator promotion</button>}
 <button className={style} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(j,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`aether-cloud-${j.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export server evidence</button></div></article>)}
 </section>;
}
