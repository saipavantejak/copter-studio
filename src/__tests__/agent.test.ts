import {describe,it,expect,vi} from 'vitest';
import {localParse,isSimulationCommand,DEF_CONFIG,DEF_TESTS} from '../SimulationParser';
import {createPlan,parseProposal,prepareIntent,validatePlan,reportFor} from '../agent/AgentCore';
import {executePlan} from '../agent/AgentExecutor';
import {EpisodeRunner} from '../EpisodeRunner';
import {RLAgent} from '../RLAgent';
const goal='Compare current drone baseline and wind, 10 episodes for 16 seconds, seed 42';
const plan=()=>createPlan(goal,DEF_CONFIG,DEF_TESTS,{strategy:'compare-wind',explanation:'Compare paired wind conditions'},'local');
describe('Aether intent boundaries',()=>{
 it.each(['Explain how to hover at 2 meters; do not run anything','Do not run a benchmark','What is a benchmark?','How can I fly a drone?'])( 'does not route questions/negation into execution: %s',s=>expect(isSimulationCommand(s)).toBe(false));
 it.each(['Simulate 10 episodes in gusts of 8 m/s','Simulate wind of 8 m/s','Simulate a quad with 10 inch props and 20 inch props','Simulate hover at 2 meters then hover at 5 meters','Simulate for 5 seconds for 10 seconds'])( 'blocks ambiguous or unsupported inputs: %s',s=>expect(localParse(s).ambiguities.some(a=>a.level==='error')).toBe(true));
 it('routes endurance and enables battery drain',()=>{const s='Run endurance test for 30 minutes';expect(isSimulationCommand(s)).toBe(true);expect(localParse(s).tests.batterySagEnabled).toBe(true);});
 it('refuses unsupported aircraft, cloud operations and excessive budgets',()=>{
  for(const s of ['Simulate DJI Mini 4 Pro','Train a quad policy','Deploy a controller','Run 500 episodes'])expect(()=>prepareIntent(s,DEF_CONFIG,DEF_TESTS)).toThrow();
  expect(()=>createPlan('Simulate 50 episodes for 60 minutes',DEF_CONFIG,DEF_TESTS,{strategy:'single',explanation:''},'local')).toThrow(/budget|12,000/);
 });
 it('rejects model-invented tools and workflow changes',()=>{expect(()=>parseProposal('{"strategy":"single","explanation":"ok","shell":"rm"}')).toThrow();expect(()=>createPlan(goal,DEF_CONFIG,DEF_TESTS,{strategy:'fault-isolation',explanation:''},'cloud')).toThrow();});
 it('preserves configuration and varies only the approved wind condition',()=>{const c={...DEF_CONFIG,batteryCapacity:2400};const p=createPlan(goal,c,DEF_TESTS,{strategy:'compare-wind',explanation:''},'local');c.mass=99;expect(p.experiments[0].cfg.physicsConfig.mass).toBe(5);expect(p.experiments[1].cfg.physicsConfig.batteryCapacity).toBe(2400);expect(p.experiments.map(e=>e.cfg.testModules.windEnabled)).toEqual([false,true]);expect(p.experiments.map(e=>e.cfg.masterSeed)).toEqual([42,42]);});
 it('rejects modified approval budgets',()=>{const p=plan();p.experiments[0].cfg.numEpisodes=501;expect(()=>validatePlan(p)).toThrow();});
});
describe('Aether execution evidence',()=>{
 const actualRun=async(e:any,signal:AbortSignal)=>{const agent=new RLAgent();try{return await new EpisodeRunner().run(agent,e.cfg,signal);}finally{agent.dispose();}};
 it('executes a real comparison and produces traceable evidence without changing editor state',async()=>{
  const p=plan(),before=JSON.stringify(p);const result=await executePlan(p,new AbortController().signal,actualRun,()=>{});
  expect(result.status).toBe('completed');expect(result.runs).toHaveLength(2);expect(result.report).toContain('not independently verified');expect(result.runs[0].stats.runId).toBe(p.experiments[0].id);expect(JSON.stringify(p)).toBe(before);
 });
 it('halts stress testing after a failed baseline',async()=>{
  const p=plan();p.experiments.forEach(e=>e.cfg.testModules.mission!.targetAltitudeM=120);
  const run=vi.fn(actualRun);const r=await executePlan(p,new AbortController().signal,run,()=>{});expect(r.status).toBe('stopped');expect(run).toHaveBeenCalledTimes(1);expect(r.report).toContain('FAIL');
 });
 it('refuses incomplete/mismatched evidence',async()=>{
  const p=plan();const run=async(e:any,s:AbortSignal)=>({...await actualRun(e,s),numEpisodes:1});const r=await executePlan(p,new AbortController().signal,run,()=>{});expect(r.status).toBe('failed');expect(r.runs).toHaveLength(0);
 });
 it('does not execute after cancellation',async()=>{const abort=new AbortController();abort.abort();const run=vi.fn(actualRun);const r=await executePlan(plan(),abort.signal,run,()=>{});expect(r.status).toBe('cancelled');expect(run).not.toHaveBeenCalled();});
 it('retains completed evidence if cancelled between runs',async()=>{const abort=new AbortController();const r=await executePlan(plan(),abort.signal,actualRun,t=>{if(t.runs.length===1)abort.abort();});expect(r.status).toBe('cancelled');expect(r.runs).toHaveLength(1);});
 it('repeats identical episodes with identical seed',async()=>{const p=createPlan('Check repeatability of Crazyflie 2.1, 10 episodes for 16 seconds',DEF_CONFIG,DEF_TESTS,{strategy:'repeatability',explanation:''},'local');const r=await executePlan(p,new AbortController().signal,actualRun,()=>{});expect(r.status).toBe('completed');expect(r.report).toContain('Episode-level repeatability: identical');});
});
