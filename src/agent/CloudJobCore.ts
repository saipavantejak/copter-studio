import {EpisodeRunner} from '../EpisodeRunner';
import {VehicleController} from '../VehicleController';
import {resolveMission} from '../MissionSpec';
import {validatePlan,validateEvidence,baselinePassed,reportFor,type Plan,type TaskRecord} from './AgentCore';
import {advanceTraining,newTraining,type TrainingState} from '../learning/TrainingJob';
export type CloudCheckpoint={kind:'benchmark';task:TaskRecord}|{kind:'training';training:TrainingState};
export function initialCheckpoint(input:any):CloudCheckpoint {
 if(input.kind==='training')return {kind:'training',training:newTraining(input.config)};
 if(input.kind!=='benchmark')throw new Error('Unsupported job kind');
 const plan:Plan=structuredClone(input.plan);validatePlan(plan);
 // Free-tier slices have a strict CPU envelope. Reject rather than change input.
 for(const e of plan.experiments)if(e.cfg.numEpisodes>5||e.cfg.maxStepsPerEpisode>1000||e.cfg.domainRandConfig.enabled)throw new Error('Cloud experiments support at most 5 episodes/run, 16 seconds and domain randomization off. Use browser execution for larger runs.');
 return {kind:'benchmark',task:{id:plan.id,plan,status:'running',events:[],runs:[],report:''}};
}
export async function advanceCheckpoint(c:CloudCheckpoint):Promise<boolean>{
 if(c.kind==='training')return advanceTraining(c.training,5);
 const t=c.task,e=t.plan.experiments[t.runs.length];if(!e)return true;
 const controller=new VehicleController();const stats=await new EpisodeRunner().run({isUsingUserModel:false,resetIntegral:()=>controller.reset(),predictAction:(s,_type,preset,config,mission)=>{if(typeof config!=='object')throw new Error('Configuration required');return controller.action({x:s[0],y:s[1],z:s[2],x_dot:s[3],y_dot:s[4],z_dot:s[5],phi:s[6],theta:s[7],psi:s[8],p:s[9],q:s[10],r:s[11]},config,resolveMission({mission,missionPreset:preset}));}},e.cfg);
 validateEvidence(e,stats);stats.runId=e.id;t.runs.push({experimentId:e.id,name:e.name,stats});t.events.push({at:new Date().toISOString(),tool:'run_benchmark',message:`Server completed ${e.name}`});
 if(t.runs.length===1&&t.plan.stopOnBaselineFailure&&!baselinePassed(stats,t.plan.altitudeToleranceM))t.status='stopped';else if(t.runs.length===t.plan.experiments.length)t.status='completed';
 t.report=reportFor(t).replace('browser-generated','server-generated');return t.status!=='running';
}
