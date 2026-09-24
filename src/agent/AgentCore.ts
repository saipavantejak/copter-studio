import {localParse, isExplanationOnly, type SimulationIntent} from '../SimulationParser';
import type {PhysicsConfig, TestModules} from '../PhysicsEngine';
import type {BatchStats, EpisodeBenchmarkConfig} from '../EpisodeRunner';
import {DEFAULT_DOMAIN_RAND} from '../DomainRandomizer';
import {DT} from '../physics/constants';
import {resolveMission} from '../MissionSpec';

export const AGENT_VERSION='aether-agent-1';
export const LIMITS={runs:4,episodesPerRun:50,simulatedSeconds:12000,wallMs:120000};
export type Strategy='single'|'compare-wind'|'repeatability'|'fault-isolation';
export type Proposal={strategy:Strategy; explanation:string};
export type Experiment={id:string;name:string;cfg:EpisodeBenchmarkConfig};
export type Plan={id:string;version:string;createdAt:string;goal:string;planner:'cloud'|'local';strategy:Strategy;explanation:string;warnings:string[];experiments:Experiment[];stopOnBaselineFailure:boolean;altitudeToleranceM:number};
export type RunEvidence={experimentId:string;name:string;stats:BatchStats};
export type TaskRecord={id:string;plan:Plan;status:'running'|'completed'|'cancelled'|'failed'|'stopped';events:{at:string;tool:string;message:string}[];runs:RunEvidence[];report:string};
export const TOOL_CATALOG=[
  {name:'inspect_configuration',effect:'Read aircraft, mission, controller and calibration assumptions'},
  {name:'validate_experiment',effect:'Check supported inputs and finite execution budget'},
  {name:'run_benchmark',effect:'Run the approved immutable configuration in an isolated worker'},
  {name:'inspect_failure',effect:'Read recorded outcomes; never invent a physical cause'},
  {name:'compare_runs',effect:'Compare paired conditions and report uncertainty'},
];
export function parseProposal(text:string):Proposal {
  const p=JSON.parse(text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
  if(!p||Object.keys(p).some(k=>!['strategy','explanation'].includes(k))||!['single','compare-wind','repeatability','fault-isolation'].includes(p.strategy)||typeof p.explanation!=='string'||p.explanation.length>1200)throw new Error('Planner returned an unsupported tool plan');
  return p;
}
export function suggestedStrategy(goal:string):Strategy {
  if(/repeat|reproduc|determinism/i.test(goal))return 'repeatability';
  if(/isolate|fault.isolation/i.test(goal))return 'fault-isolation';
  if(/compar|baseline|investigat|evaluat/i.test(goal)&&/wind|gust/i.test(goal))return 'compare-wind';
  return 'single';
}
export function prepareIntent(goal:string,config:PhysicsConfig,tests:TestModules):SimulationIntent {
  if(!goal.trim()||goal.length>2000)throw new Error('Describe an experiment in 1–2000 characters.');
  if(isExplanationOnly(goal))throw new Error('This asks for an explanation or forbids execution. Use Aether chat for questions.');
  if(/\b(train|training|deploy|promote|firmware|hardware|real flight|upload|delete|shell)\b/i.test(goal))throw new Error('This workspace runs simulation experiments only. Training, deployment and hardware operations are not exposed as agent tools.');
  if(/(?:increasing|decreasing|sweep|steps? of|increment).*\b(?:wind|gust)|(?:wind|gust).*\b(?:sweep|increasing|decreasing|increment)/i.test(goal))throw new Error('Numeric or increasing wind sweeps are unsupported. Compare built-in wind on/off instead.');
  const p=localParse(goal,config,tests);
  const errors=p.ambiguities.filter(a=>a.level==='error');
  if(errors.length)throw new Error(errors.map(a=>a.field+': '+a.issue).join('\n'));
  if(p.numEpisodes>LIMITS.episodesPerRun)throw new Error('Agent budget: at most 50 episodes per run.');
  return p;
}
export function createPlan(goal:string,config:PhysicsConfig,tests:TestModules,proposal:Proposal,planner:Plan['planner']):Plan {
  const p=prepareIntent(goal,config,tests);
  // The LLM selects a workflow, never writes numeric inputs or executable code.
  if(proposal.strategy!==suggestedStrategy(goal))throw new Error('The proposed workflow does not match the requested comparison. Rephrase the goal.');
  if(proposal.strategy==='compare-wind'&&/\b(?:no|without|disable)\s+(?:wind|gust)/i.test(goal))throw new Error('Wind comparison conflicts with the request to disable wind.');
  if(proposal.strategy!=='single'&&p.domainRandEnabled)throw new Error('Controlled comparisons require domain randomization off. Run randomized single experiments separately.');
  const mission=resolveMission(p.tests);
  const make=(name:string,mods:TestModules,seed=p.masterSeed):Experiment=>({id:crypto.randomUUID(),name,cfg:{physicsConfig:structuredClone(p.config),testModules:{...structuredClone(mods),mission},sensorConfig:p.sensorCfg,domainRandConfig:{...DEFAULT_DOMAIN_RAND,enabled:p.domainRandEnabled},numEpisodes:p.numEpisodes,maxStepsPerEpisode:Math.ceil(mission.durationSeconds/DT),masterSeed:seed,randomizeIC:true,icAltRange:[0.5,1.5],icAttRange:[-0.2,0.2],serializedModel:null}});
  const clean={...p.tests,windEnabled:false,payloadShiftEnabled:false,batterySagEnabled:false,motorOutEnabled:false};
  let experiments:Experiment[];
  if(proposal.strategy==='compare-wind')experiments=[make('Baseline — wind off',{...p.tests,windEnabled:false}),make('Wind — built-in stochastic model',{...p.tests,windEnabled:true})];
  else if(proposal.strategy==='repeatability')experiments=[make('Repeat A',p.tests),make('Repeat B — identical seed',p.tests)];
  else if(proposal.strategy==='fault-isolation')experiments=[make('Baseline — faults off',clean),make('Wind only',{...clean,windEnabled:true}),make('Battery sag only',{...clean,batterySagEnabled:true}),make('Motor-out only',{...clean,motorOutEnabled:true})];
  else experiments=[make('Requested experiment',p.tests)];
  const plan:Plan={id:crypto.randomUUID(),version:AGENT_VERSION,createdAt:new Date().toISOString(),goal,planner,strategy:proposal.strategy,explanation:proposal.explanation,warnings:[...p.ambiguities.filter(a=>a.level!=='info').map(a=>a.issue),'Controller: Heuristic PD. Uploaded RL policies are not used in this workspace.','Wind uses the existing stochastic model; numeric gust speeds and gust-endurance predictions are unsupported.','Runs execute in this browser. Closing or reloading stops execution.'],experiments,stopOnBaselineFailure:proposal.strategy==='compare-wind'||proposal.strategy==='fault-isolation',altitudeToleranceM:0.1};
  validatePlan(plan);
  return plan;
}
export function validatePlan(plan:Plan) {
  if(plan.version!==AGENT_VERSION||plan.experiments.length<1||plan.experiments.length>LIMITS.runs)throw new Error('Unsupported plan version or run count');
  if(plan.altitudeToleranceM!==0.1)throw new Error('Unexpected acceptance threshold');
  let cost=0;
  for(const e of plan.experiments){
    const c=e.cfg;
    if(!Number.isInteger(c.numEpisodes)||c.numEpisodes<1||c.numEpisodes>50||!Number.isInteger(c.maxStepsPerEpisode)||c.maxStepsPerEpisode<1||c.serializedModel)throw new Error('Invalid episode budget or unsupported controller');
    // Reuse the engine validation before any worker starts.
    const p=localParse('simulate',c.physicsConfig,c.testModules);
    if(p.ambiguities.some(a=>a.level==='error'))throw new Error('Invalid experiment configuration');
    if(!Number.isSafeInteger(c.masterSeed)||c.masterSeed<0||c.masterSeed>0xffffffff)throw new Error('Invalid seed');
    cost+=c.numEpisodes*c.maxStepsPerEpisode*DT;
  }
  if(cost>LIMITS.simulatedSeconds)throw new Error('Plan exceeds 12,000 total simulated seconds. Reduce episodes or duration.');
}
export function validateEvidence(e:Experiment,s:BatchStats) {
  if(s.cancelled||s.numEpisodes!==e.cfg.numEpisodes||s.episodes.length!==e.cfg.numEpisodes||!s.requestedConfig||JSON.stringify(s.requestedConfig)!==JSON.stringify({...e.cfg,serializedModel:undefined}))throw new Error('Incomplete or mismatched execution evidence');
  if(![s.crashRate,s.meanAltError,s.meanSurvivalTime,s.totalEnergyJ,s.successRate].every(Number.isFinite))throw new Error('Non-finite benchmark results');
}
export function baselinePassed(s:BatchStats,tolerance:number){return s.crashRate===0&&s.successRate===1&&s.meanAltError<tolerance;}
export function reportFor(task:TaskRecord):string {
  const rows=task.runs.map(r=>`- ${r.name} [run ${r.stats.runId}]: ${(r.stats.successRate!*100).toFixed(1)}% mission success, ${(r.stats.crashRate*100).toFixed(1)}% crashes, ${r.stats.meanAltError.toFixed(4)} m mean altitude error; ${baselinePassed(r.stats,task.plan.altitudeToleranceM)?'PASS':'FAIL'} the explicit 0% crashes / 100% mission success / <0.10 m error criterion. SEC ${r.stats.meanSEC===null?'N/A':r.stats.meanSEC.toFixed(4)+' J/(g payload·km)'}. 95% simulated-success interval: ${r.stats.successRate95CI?.map(v=>(100*v).toFixed(1)+'%').join('–')??'unavailable'}.`);
  if(task.runs.length>1){const a=task.runs[0].stats,b=task.runs[1].stats;rows.push(`Comparison of first two runs: altitude-error change ${(b.meanAltError-a.meanAltError).toFixed(4)} m; crash-rate change ${((b.crashRate-a.crashRate)*100).toFixed(1)} percentage points. Descriptive comparison, not a significance test.`);}
  if(task.plan.strategy==='repeatability'&&task.runs.length===2)rows.push(`Episode-level repeatability: ${JSON.stringify(task.runs[0].stats.episodes)===JSON.stringify(task.runs[1].stats.episodes)?'identical':'DIFFERENT — investigate reproducibility'}.`);
  for(const r of task.runs){const failures=r.stats.episodes.filter(e=>!e.successful);if(failures.length)rows.push(`${r.name} recorded outcomes: ${[...new Set(failures.map(e=>e.outcome??'unknown'))].join(', ')}. Physical cause remains unestablished.`);}
  return [`Task ${task.status}. Completed ${task.runs.length}/${task.plan.experiments.length} planned runs.`,...rows,'These are browser-generated simulation records, not independently verified flight measurements. Success does not establish physical reliability or gust endurance.'].join('\n\n');
}
