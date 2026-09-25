import {PhysicsEngine,type PhysicsConfig} from '../PhysicsEngine';
import {VehicleController} from '../VehicleController';
import {SeededRandom} from '../SeededRandom';
import {DEFAULT_MISSION,isTrackingMission} from '../MissionSpec';
import {assertValidConfig} from '../configValidation';
import {RESIDUAL_ACTIONS,STATE_COUNT,stateIndex,greedyAction,applyResidual} from './ResidualPolicy';
export const TRAINING_VERSION='residual-q-v2';
export const TRAIN_EPISODES=120, EVAL_PAIRS=40, HOLD=8, STEPS=1000;
export interface Score {seed:number;wind:boolean;successful:boolean;failed:boolean;steps:number;meanAltitudeErrorM:number;reward:number;energyJ:number}
export interface TrainingState {version:string;config:PhysicsConfig;cursor:number;q:number[][];evaluations:{baseline:Score;policy:Score}[];gate:boolean;summary:string;physicalValidation:false}
export function trainingScope(config:PhysicsConfig){assertValidConfig(config);if(config.droneType!=='quadcopter')throw new Error('Residual training supports quadcopters only, at 1 m hover for 16 s.');}
export function newTraining(config:PhysicsConfig):TrainingState {trainingScope(config);return {version:TRAINING_VERSION,config:structuredClone(config),cursor:0,q:Array.from({length:STATE_COUNT},()=>RESIDUAL_ACTIONS.map(()=>0)),evaluations:[],gate:false,summary:'Training pending.',physicalValidation:false};}
export function trainingEpisode(c:TrainingState,seed:number,wind:boolean,mode:'train'|'baseline'|'policy',epsilon=0):Score {
 const physics=new PhysicsEngine();physics.config=structuredClone(c.config);physics.rng=new SeededRandom(seed);
 physics.tests={windEnabled:wind,payloadShiftEnabled:false,batterySagEnabled:false,motorOutEnabled:false,missionPreset:'none'};
 physics.reset();const rng=new SeededRandom(seed^0x271828),explore=new SeededRandom(seed^314159);
 physics.setInitialConditions(rng.uniform(.5,1.5),rng.uniform(-.2,.2),rng.uniform(-.2,.2));
 const controller=new VehicleController();let s=physics.getState(),errorSum=0,rewardTotal=0,steps=0,tracking=0;
 while(steps<STEPS&&!s.failureReason){const state=stateIndex(s.z,s.z_dot);const a=mode==='baseline'?0:mode==='train'&&explore.next()<epsilon?Math.floor(explore.next()*5):greedyAction(c.q[state]);let reward=0;
  for(let j=0;j<HOLD&&steps<STEPS&&!s.failureReason;j++){s=physics.step(applyResidual(controller.action(s,c.config),a));steps++;const error=Math.abs(s.z-1);errorSum+=error;reward-=error+.05*Math.abs(s.z_dot)+.1*Math.abs(RESIDUAL_ACTIONS[a]);if(steps>STEPS-125&&isTrackingMission(s,DEFAULT_MISSION))tracking++;}
  if(s.failureReason)reward-=100+STEPS-steps;rewardTotal+=reward;
  if(mode==='train'){const terminal=!!s.failureReason||steps===STEPS;c.q[state][a]+=.1*(reward+(terminal?0:.97*Math.max(...c.q[stateIndex(s.z,s.z_dot)]))-c.q[state][a]);}
 }
 return {seed,wind,successful:!s.failureReason&&steps===STEPS&&tracking>=119,failed:!!s.failureReason,steps,meanAltitudeErrorM:errorSum/steps,reward:rewardTotal,energyJ:s.energyConsumed};
}
export function evaluationGate(rows:TrainingState['evaluations']):boolean {
 if(rows.length!==EVAL_PAIRS)return false;
 // Every paired scenario must preserve success, failure and tracking error. The
 // mean paired reward improvement must exceed its normal-approximation 95% CI.
 return [false,true].every(w=>{const r=rows.filter(x=>x.baseline.wind===w);if(r.length!==20)return false;
  if(r.some((x,i)=>x.baseline.seed!==100001+i+(w?1000:0)||x.policy.seed!==x.baseline.seed||x.policy.wind!==w||!Number.isFinite(x.policy.reward)||!Number.isFinite(x.baseline.reward)))return false;
  const sum=(f:(s:Score)=>number,side:'baseline'|'policy')=>r.reduce((a,x)=>a+f(x[side]),0);
  const d=r.map(x=>x.policy.reward-x.baseline.reward),mean=d.reduce((a,b)=>a+b,0)/d.length,se=Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/(d.length-1)/d.length);
  return sum(s=>+s.successful,'policy')>=sum(s=>+s.successful,'baseline')&&sum(s=>+s.failed,'policy')<=sum(s=>+s.failed,'baseline')&&sum(s=>s.meanAltitudeErrorM,'policy')<=sum(s=>s.meanAltitudeErrorM,'baseline')&&mean-2.093*se>0;
 });
}
export function advanceTraining(c:TrainingState,budget=5):boolean {
 if(c.version!==TRAINING_VERSION)throw new Error('Incompatible training checkpoint');
 for(let n=0;n<budget&&c.cursor<TRAIN_EPISODES+EVAL_PAIRS;n++,c.cursor++){
  const i=c.cursor;if(i<TRAIN_EPISODES)trainingEpisode(c,i+1,i%2===1,'train',.3-.27*i/(TRAIN_EPISODES-1));
  else{const e=i-TRAIN_EPISODES,wind=e>=20,seed=100001+e%20+(wind?1000:0);c.evaluations.push({baseline:trainingEpisode(c,seed,wind,'baseline'),policy:trainingEpisode(c,seed,wind,'policy')});}
 }
 const done=c.cursor===TRAIN_EPISODES+EVAL_PAIRS;c.gate=done&&evaluationGate(c.evaluations);
 c.summary=done?(c.gate?'Passed the held-out simulation gate. Eligible for explicit simulator-only promotion.':'Failed the held-out simulation gate. Existing controller retained.'):`Checkpoint ${c.cursor}/${TRAIN_EPISODES+EVAL_PAIRS}. Training seeds 1–120; held-out seeds 100001–100020 and 101001–101020.`;
 return done;
}
export function assertPromotable(c:TrainingState){trainingScope(c.config);if(c.version!==TRAINING_VERSION||c.cursor!==TRAIN_EPISODES+EVAL_PAIRS||!c.gate||!evaluationGate(c.evaluations)||c.q.length!==STATE_COUNT||c.q.some(row=>row.length!==5||!row.every(Number.isFinite)))throw new Error('Candidate has not passed its complete held-out evaluation.');}
