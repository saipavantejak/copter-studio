import {useEffect,useRef,useState} from 'react';
import type {PhysicsConfig,TestModules} from '../PhysicsEngine';
import {planExperiment} from './AgentPlanner';
import {browserBenchmark,executePlan} from './AgentExecutor';
import {saveTask,loadTasks} from './AgentHistory';
import {cloudDatabase} from '../cloudDatabase';
import {TOOL_CATALOG,type Plan,type TaskRecord} from './AgentCore';
const button='px-3 py-2 rounded-lg border border-line-strong text-sm disabled:opacity-50';
export function AgentWorkspace({config,tests,onClose}:{config:PhysicsConfig;tests:TestModules;onClose:()=>void}){
 const [goal,setGoal]=useState('Compare current drone baseline and wind, 10 episodes for 16 seconds, seed 42');
 const [plan,setPlan]=useState<Plan|null>(null),[task,setTask]=useState<TaskRecord|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[history,setHistory]=useState<TaskRecord[]>([]);
 const dialog=useRef<HTMLDialogElement|null>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const operation=useRef<AbortController|null>(null),lock=useRef(false),alive=useRef(true),approved=useRef(new Set<string>());
 useEffect(()=>{alive.current=true;const subscription=cloudDatabase?.auth.onAuthStateChange(()=>setHistory([]));return()=>{alive.current=false;operation.current?.abort();subscription?.data.subscription.unsubscribe();};},[]);
 const begin=async()=>{
   if(lock.current)return;lock.current=true;setBusy(true);setPlan(null);setTask(null);setMessage('Inspecting request and preparing a bounded plan…');
   const controller=new AbortController();operation.current=controller;
   try{const result=await planExperiment(goal,structuredClone(config),structuredClone(tests),controller.signal);if(alive.current&&!controller.signal.aborted){setPlan(result);setMessage('Review the plan. Nothing has executed yet.');}}
   catch(e){if(alive.current)setMessage(controller.signal.aborted?'Planning cancelled.':e instanceof Error?e.message:String(e));}
   finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const run=async()=>{
   if(!plan||lock.current||approved.current.has(plan.id))return;
   approved.current.add(plan.id);lock.current=true;setBusy(true);setMessage('Running the approved plan. Keep this page open.');
   const controller=new AbortController();operation.current=controller;
   try{const result=await executePlan(plan,controller.signal,browserBenchmark,r=>{if(alive.current)setTask(r);});if(alive.current){setTask(result);setMessage('Execution finished. Export results or save them to your private cloud history.');}}
   catch(e){if(alive.current)setMessage(e instanceof Error?e.message:String(e));}
   finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const cloud=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}};
 return <dialog ref={dialog} onCancel={()=>{operation.current?.abort();onClose();}} aria-label="Aether agent workspace" className="fixed inset-0 z-[200] bg-canvas overflow-y-auto text-ink w-screen h-screen max-w-none max-h-none m-0 border-0">
  <div className="max-w-5xl mx-auto p-5 space-y-5">
   <header className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-emerald-700">Aether · Experiment agent</p><h2 className="text-2xl font-bold">Plan. Execute. Inspect. Compare.</h2><p className="text-sm text-muted mt-2">Bounded simulation experiments with visible tool activity and recorded evidence.</p></div><button className={button} onClick={()=>{operation.current?.abort();onClose();}}>Close{busy?' & stop':''}</button></header>
   <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
    <label className="block font-semibold" htmlFor="agent-goal">Experiment goal</label>
    <textarea id="agent-goal" maxLength={2000} rows={3} disabled={busy} value={goal} onChange={e=>{setGoal(e.target.value);setPlan(null);}} className="w-full border border-line-strong rounded-lg p-3 bg-canvas" />
    <div className="flex gap-2 flex-wrap">{['Compare current drone baseline and wind, 10 episodes for 16 seconds, seed 42','Check repeatability of Crazyflie 2.1, 10 episodes for 16 seconds, seed 42','Investigate fault isolation on current drone, 10 episodes for 16 seconds'].map((g,i)=><button key={g} disabled={busy} className={button} onClick={()=>{setGoal(g);setPlan(null);}}>{['Compare wind','Check repeatability','Isolate faults'][i]}</button>)}</div>
    <button disabled={busy||!goal.trim()} onClick={()=>void begin()} className={button+' bg-emerald-600 text-white'}>Create experiment plan</button>
    {busy&&<button className={button+' ml-2'} onClick={()=>operation.current?.abort()}>Cancel operation</button>}
    <p role="status" className="text-sm whitespace-pre-wrap">{message}</p>
   </div>
   {plan&&<section className="bg-surface border border-line rounded-xl p-4 space-y-3">
    <h3 className="font-bold">Plan for approval · {plan.experiments.length} runs · {plan.planner==='cloud'?'AI-assisted planning':'Local planning'}</h3>
    <p>{plan.explanation}</p><p className="text-sm">Heuristic PD controller · ≤50 episodes/run · ≤12,000 total simulated seconds · 2-minute timeout/run</p>
    <p className="text-sm">Acceptance: zero crashes, all missions successful, mean altitude error below 0.10 m. {plan.stopOnBaselineFailure?'A failed baseline stops subsequent stress tests.':'All approved runs are compared.'}</p>
    <ol className="space-y-3">{plan.experiments.map((e,i)=><li key={e.id} className="bg-canvas rounded-lg p-3"><strong>{i+1}. {e.name}</strong><p className="text-sm">{e.cfg.physicsConfig.droneType} · {e.cfg.physicsConfig.mass} kg · {e.cfg.numEpisodes} episodes · seed {e.cfg.masterSeed} · {e.cfg.testModules.mission?.durationSeconds} s/episode</p><details><summary className="cursor-pointer text-sm underline">Exact configuration and conditions</summary><pre className="text-xs overflow-auto max-h-64 mt-2">{JSON.stringify(e.cfg,null,2)}</pre></details></li>)}</ol>
    <ul className="list-disc pl-5 text-sm text-amber-800">{plan.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
    <button disabled={busy||approved.current.has(plan.id)} onClick={()=>void run()} className={button+' bg-emerald-600 text-white'}>Approve & execute plan</button>
   </section>}
   {task&&<section className="bg-surface border border-line rounded-xl p-4 space-y-3"><h3 className="font-bold">Task {task.status} · {task.runs.length}/{task.plan.experiments.length} runs</h3><p className="text-xs text-muted break-all">Task ID: {task.id}</p>
    <ol aria-label="Agent tool activity" className="text-sm space-y-1 max-h-52 overflow-auto">{task.events.map((e,i)=><li key={i}><strong>{e.tool}</strong> — {e.message}</li>)}</ol>
    {task.report&&<p className="whitespace-pre-wrap text-sm">{task.report}</p>}
    <div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(task,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=`aether-${task.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}}>Export evidence JSON</button><button className={button} disabled={busy} onClick={()=>void cloud(async()=>{await saveTask(task);setMessage('Task saved privately to your account.');})}>Save private history</button></div>
   </section>}
   <section className="space-y-2"><button className={button} disabled={busy} onClick={()=>void cloud(async()=>{setHistory(await loadTasks());setMessage('Loaded your latest ten tasks. Historical records cannot trigger execution.');})}>Load private history</button>{history.map(t=><details key={t.id} className="bg-surface border border-line rounded-lg p-3"><summary>{t.plan.goal} · {t.status}</summary><p className="whitespace-pre-wrap text-sm mt-2">{t.report||'No completed report was saved.'}</p></details>)}</section>
   <details className="text-sm"><summary>Available tools and boundaries</summary><ul>{TOOL_CATALOG.map(t=><li key={t.name}><strong>{t.name}</strong>: {t.effect}</li>)}</ul><p className="mt-2">Training execution, controller promotion, deployment, numeric gust sweeps, and real hardware control are not available. This agent cannot establish real-flight reliability. Cloud history stores browser-generated evidence, not certified measurements.</p></details>
  </div>
 </dialog>;
}
