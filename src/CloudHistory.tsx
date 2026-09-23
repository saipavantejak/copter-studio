import {AuthForm} from './AuthForm';
import {useEffect,useState} from 'react';
import {cloudDatabase,authStartup,benchmarkRecord,configurationRecord} from './cloudDatabase';
import {useAppContext} from './context/AppContext';
import {assertValidConfig} from './configValidation';

export function CloudHistory(){
  const {batchStats,config,setConfig}=useAppContext();
  const [user,setUser]=useState<{id:string;email?:string}|null>(null);
  const [name,setName]=useState(''),[message,setMessage]=useState(authStartup.message);
  const [busy,setBusy]=useState(false),[runs,setRuns]=useState<any[]>([]),[configs,setConfigs]=useState<any[]>([]);
  useEffect(()=>{
    if(!cloudDatabase)return;
    let alive=true;
    cloudDatabase.auth.getSession().then(({data,error})=>{if(alive){setUser(data.session?.user??null);if(error)setMessage(error.message);}}).catch(()=>{if(alive)setMessage('Could not restore your session. Please log in again.');});
    const {data}=cloudDatabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);setRuns([]);setConfigs([]);});
    return ()=>{alive=false;data.subscription.unsubscribe();};
  },[]);
  const task=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Cloud operation failed');}finally{setBusy(false);}};
  if(!cloudDatabase)return <section className="border border-zinc-700 rounded p-3 text-sm"><h3>Cloud history</h3><p>Cloud database is not connected. Benchmarks still work; export JSON to keep your results.</p></section>;
  return <section className="border border-zinc-700 rounded p-3 text-sm space-y-2">
    <h3 className="font-bold">Private cloud history</h3>
    {!user ? <AuthForm client={cloudDatabase} /> : <>
      <p>Signed in as {user.email}. Records are private to your account.</p>
      <button disabled={busy} className="underline mr-3" onClick={()=>void task(async()=>{const {error}=await cloudDatabase.auth.signOut();if(error)throw error;})}>Sign out</button>
      <input aria-label="Cloud record name" placeholder="Optional record name" maxLength={120} value={name} onChange={e=>setName(e.target.value)} className="bg-zinc-950 p-2" />
      <button disabled={busy||!batchStats} className="underline p-2" onClick={()=>void task(async()=>{
        const payload=benchmarkRecord(batchStats!);
        const {error}=await cloudDatabase.from('benchmark_runs').upsert({id:batchStats!.runId??crypto.randomUUID(),user_id:user.id,name:name||'Benchmark',payload},{onConflict:'id'});
        if(error)throw error;setMessage('Benchmark saved to your cloud account.');
      })}>Save benchmark</button>
      <button disabled={busy} className="underline p-2" onClick={()=>void task(async()=>{
        const {error}=await cloudDatabase.from('aircraft_configurations').insert({user_id:user.id,name:name||'Aircraft configuration',config:configurationRecord(config)});
        if(error)throw error;setMessage('Configuration saved to your cloud account.');
      })}>Save configuration</button>
      <button disabled={busy} className="underline p-2" onClick={()=>void task(async()=>{
        const [a,b]=await Promise.all([cloudDatabase.from('benchmark_runs').select('id,name,created_at,payload').order('created_at',{ascending:false}).limit(20),cloudDatabase.from('aircraft_configurations').select('id,name,created_at,config').order('created_at',{ascending:false}).limit(20)]);
        if(a.error)throw a.error;if(b.error)throw b.error;setRuns(a.data??[]);setConfigs(b.data??[]);setMessage('Loaded your latest 20 records of each type.');
      })}>Load saved records</button>
      {runs.map(r=><div key={r.id}>{r.name} — {new Date(r.created_at).toLocaleString()} <button className="underline" onClick={()=>{
        const u=URL.createObjectURL(new Blob([JSON.stringify(r.payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='copter-benchmark-'+r.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
      }}>Download saved benchmark</button></div>)}
      {configs.map(r=><div key={r.id}>{r.name} <button disabled={busy} className="underline" onClick={()=>void task(async()=>{assertValidConfig(r.config);setConfig(r.config);setMessage('Saved configuration loaded into the editor.');})}>Load configuration</button></div>)}
    </>}
    <p role="status">{message}</p>
  </section>;
}
