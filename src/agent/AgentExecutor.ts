import {validatePlan,validateEvidence,baselinePassed,reportFor,type Plan,type TaskRecord,type Experiment} from './AgentCore';
import type {BatchStats} from '../EpisodeRunner';
import {LIMITS} from './AgentCore';
export type BenchmarkTool=(e:Experiment,signal:AbortSignal,progress:(done:number,total:number)=>void)=>Promise<BatchStats>;
export async function executePlan(plan:Plan,signal:AbortSignal,run:BenchmarkTool,onUpdate:(record:TaskRecord)=>void):Promise<TaskRecord>{
  plan=structuredClone(plan);validatePlan(plan);
  const task:TaskRecord={id:plan.id,plan,status:'running',events:[],runs:[],report:''};
  const event=(tool:string,message:string)=>{task.events.push({at:new Date().toISOString(),tool,message});onUpdate(structuredClone(task));};
  event('validate_experiment','Approved immutable plan validated. No configuration changes or policy promotion tools are available.');
  try{
    for(const e of plan.experiments){
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      event('run_benchmark',`${e.name}: starting ${e.cfg.numEpisodes} episodes`);
      const stats=await run(e,signal,(done,total)=>{if(done===total||done%5===0)event('get_run_status',`${e.name}: ${done}/${total}`);});
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      validateEvidence(e,stats);stats.runId=e.id;task.runs.push({experimentId:e.id,name:e.name,stats});
      event('inspect_failure',`${e.name}: recorded ${stats.episodes.filter(r=>!r.successful).length} failed missions; mean error ${stats.meanAltError.toFixed(4)} m`);
      if(plan.stopOnBaselineFailure&&task.runs.length===1&&!baselinePassed(stats,plan.altitudeToleranceM)){
        task.status='stopped';event('stop','Baseline failed the approved acceptance criterion. Stress runs skipped; inspect baseline assumptions first.');break;
      }
    }
    if(task.status==='running')task.status='completed';
  }catch(e){task.status=signal.aborted?'cancelled':'failed';event('stop',e instanceof Error?e.message:String(e));}
  task.report=reportFor(task);event('compare_runs',task.report);return task;
}
export const browserBenchmark:BenchmarkTool=(experiment,signal,onProgress)=>new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
  const worker=new Worker(new URL('../workers/episodeWorker.ts',import.meta.url),{type:'module'});
  let settled=false;
  const finish=(error?:Error,stats?:BatchStats)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(stats!);};
  const abort=()=>finish(new DOMException('Cancelled','AbortError'));
  const timer=setTimeout(()=>finish(new Error('Worker exceeded the two-minute wall-clock budget')),LIMITS.wallMs);
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>finish(new Error('Simulation worker failed'));
  worker.onmessage=({data})=>{if(data.type==='done')finish(undefined,data.stats);else if(data.type==='error')finish(new Error(data.message));else if(data.type==='progress')onProgress(data.done,data.total);};
  try{worker.postMessage({type:'run',cfg:experiment.cfg});}catch(e){finish(e instanceof Error?e:new Error(String(e)));}
});
