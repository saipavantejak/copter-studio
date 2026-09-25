import {describe,it,expect} from 'vitest';
import {newTraining,advanceTraining,trainingEpisode,evaluationGate,assertPromotable,TRAIN_EPISODES,EVAL_PAIRS} from '../learning/TrainingJob';
import {AIRCRAFT_PROFILES} from '../AircraftProfiles';
import {initialCheckpoint,advanceCheckpoint} from '../agent/CloudJobCore';
import {createPlan} from '../agent/AgentCore';
import {NativePolicy} from '../learning/NativePolicy';
import {DEFAULT_MISSION} from '../MissionSpec';
const config=AIRCRAFT_PROFILES[0].config;
const tests={windEnabled:false,payloadShiftEnabled:false,batterySagEnabled:false,motorOutEnabled:false,missionPreset:'none' as const};
describe('durable cloud execution',()=>{
 it('checkpoint round trips produce identical training weights',()=>{const a=newTraining(config),b=newTraining(config);advanceTraining(a,10);advanceTraining(b,5);const resumed=JSON.parse(JSON.stringify(b));advanceTraining(resumed,5);expect(resumed).toEqual(a);});
 it('held-out evaluation freezes weights and uses disjoint seeds',{timeout:30000},()=>{const c=newTraining(config);advanceTraining(c,TRAIN_EPISODES);const q=JSON.stringify(c.q);advanceTraining(c,EVAL_PAIRS);expect(JSON.stringify(c.q)).toBe(q);expect(c.evaluations).toHaveLength(40);expect(c.evaluations.every(e=>e.baseline.seed>TRAIN_EPISODES)).toBe(true);expect(c.gate).toBe(evaluationGate(c.evaluations));expect(advanceTraining(c)).toBe(true);});
 it('rejects partial, failed or unsupported promotions',()=>{const c=newTraining(config);expect(()=>assertPromotable(c)).toThrow();c.gate=true;expect(()=>assertPromotable(c)).toThrow();expect(()=>newTraining({...config,droneType:'bicopter'})).toThrow();expect(evaluationGate([])).toBe(false);});
 it('runs a server benchmark without TensorFlow and keeps evidence',async()=>{const plan=createPlan('Repeatability 2 episodes for 16 seconds, seed 42',config,tests,{strategy:'repeatability',explanation:'Identical seed'},'local');const c=initialCheckpoint({kind:'benchmark',plan});expect(await advanceCheckpoint(c)).toBe(false);const resumed=JSON.parse(JSON.stringify(c));expect(await advanceCheckpoint(resumed)).toBe(true);expect(resumed.task.runs[0].stats.episodes).toEqual(resumed.task.runs[1].stats.episodes);expect(resumed.task.report).toContain('server-generated');});
 it('rejects cloud budgets without truncating a plan',()=>{const plan=createPlan('Simulate 10 episodes for 16 seconds',config,tests,{strategy:'single',explanation:'Run'},'local');expect(()=>initialCheckpoint({kind:'benchmark',plan})).toThrow('5 episodes');expect(plan.experiments[0].cfg.numEpisodes).toBe(10);});
 it('gate rejects better reward if successful missions regress',{timeout:30000},()=>{const c=newTraining(config);advanceTraining(c,TRAIN_EPISODES+EVAL_PAIRS);const rows=c.evaluations.map(x=>({...x,baseline:{...x.baseline,successful:true,reward:-2},policy:{...x.policy,successful:false,reward:0}}));expect(evaluationGate(rows)).toBe(false);});
 it('native execution preserves held actions and training dynamics',{timeout:30000},()=>{const c=newTraining(config);advanceTraining(c,TRAIN_EPISODES+EVAL_PAIRS); // Synthetic gate fixture tests mechanics, not model quality.
 c.evaluations=c.evaluations.map(x=>({...x,policy:{...x.baseline,reward:x.baseline.reward+1}}));c.gate=true;const p=new NativePolicy(c);expect(p.predict([0,0,1,0,0,0,0,0,0,0,0,0],config,DEFAULT_MISSION).every(Number.isFinite)).toBe(true);expect(()=>p.predict(Array(12).fill(0),{...config,mass:config.mass*2},DEFAULT_MISSION)).toThrow('exact trained');expect(()=>p.predict(Array(12).fill(0),config,{...DEFAULT_MISSION,targetAltitudeM:2})).toThrow();});
});
