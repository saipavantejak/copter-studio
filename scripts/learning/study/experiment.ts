import { PhysicsEngine } from '../../../src/PhysicsEngine';
import { VehicleController } from '../../../src/VehicleController';
import { AIRCRAFT_PROFILES } from '../../../src/AircraftProfiles';
import { SeededRandom } from '../../../src/SeededRandom';
import { DEFAULT_MISSION, isTrackingMission } from '../../../src/MissionSpec';
import { STUDY_WIND } from '../../../src/physics/studyWind';
import { STUDY, REFERENCE, stateCount, stateIndex, type Candidate } from './protocol';
export const config={...AIRCRAFT_PROFILES[0].config};
export const table=(c:Candidate)=>Array.from({length:stateCount(c)},()=>c.actions.map(()=>0));
export type Run={explorationSeed:number;trainSeedRange:number[];q:number[][];qWind:number[][];visits:number[][];visitsWind:number[][]};
export const emptyRun=(c:Candidate):Run=>{const q=table(c),visits=table(c);return {explorationSeed:0,trainSeedRange:[],q,qWind:c.separate?table(c):q,visits,visitsWind:c.separate?table(c):visits};};
export function episode(seed:number,wind:boolean,mode:'train'|'baseline'|'policy',c:Candidate=REFERENCE,run:Run=emptyRun(c),rng=new SeededRandom(1),epsilon=0){
 const physics=new PhysicsEngine();physics.config={...config};physics.rng=new SeededRandom(seed);physics.studyWindModel={...STUDY_WIND};
 physics.tests={windEnabled:wind,payloadShiftEnabled:false,batterySagEnabled:false,motorOutEnabled:false,missionPreset:'none'};physics.reset();
 const ic=new SeededRandom(seed^0x271828);physics.setInitialConditions(ic.uniform(.5,1.5),ic.uniform(-.2,.2),ic.uniform(-.2,.2));
 const controller=new VehicleController();const q=wind?run.qWind:run.q,visits=wind?run.visitsWind:run.visits;
 let s=physics.getState(),steps=0,tracking=0,sumError=0,rewardTotal=0,altitudeCost=0,velocityCost=0,actionCost=0,failureCost=0;
 let maxHorizontalSpeed=0,maxAngularRate=0,saturatedSteps=0;
 const actionCounts=c.actions.map(()=>0);
 while(steps<STUDY.steps&&!s.failureReason){
  const state=stateIndex(c,s);
  const a=mode==='baseline'?0:mode==='train'&&rng.next()<epsilon?Math.floor(rng.next()*c.actions.length):q[state].reduce((best,v,i)=>v>q[state][best]?i:best,0);
  actionCounts[a]++;let reward=0;
  // Baseline always updates every step; candidate hold only controls the residual.
  for(let j=0;j<c.hold&&steps<STUDY.steps&&!s.failureReason;j++){
   const command=controller.action(s,config).map((v,i)=>i<4?Math.max(-1,Math.min(1,v+c.actions[a])):v);
   s=physics.step(command);steps++;
   const error=Math.abs(s.z-1);sumError+=error;altitudeCost+=error;velocityCost+=.05*Math.abs(s.z_dot);actionCost+=.1*Math.abs(c.actions[a]);
   reward-=error+.05*Math.abs(s.z_dot)+.1*Math.abs(c.actions[a]);
   if(steps>STUDY.steps-125&&isTrackingMission(s,DEFAULT_MISSION))tracking++;
   maxHorizontalSpeed=Math.max(maxHorizontalSpeed,Math.hypot(s.x_dot,s.y_dot));maxAngularRate=Math.max(maxAngularRate,Math.abs(s.p),Math.abs(s.q),Math.abs(s.r));
   if(physics.lastSaturated)saturatedSteps++;
  }
  if(s.failureReason){const cost=100+STUDY.steps-steps;reward-=cost;failureCost+=cost;}rewardTotal+=reward;
  if(mode==='train'){
   const next=stateIndex(c,s),terminal=!!s.failureReason||steps===STUDY.steps;
   const alpha=c.decay?.1/(1+visits[state][a]/100):.1;
   q[state][a]+=alpha*(reward+(terminal?0:STUDY.gammaPerDecision*Math.max(...q[next]))-q[state][a]);visits[state][a]++;
  }
 }
 return {seed,wind,successful:!s.failureReason&&steps===STUDY.steps&&tracking>=119,failed:!!s.failureReason,
 failureReason:s.failureReason??null,outcome:s.failureReason??(tracking>=119?'Successful mission':'Tracking criterion not met'),steps,
 meanAltitudeErrorM:sumError/steps,reward:rewardTotal,energyJ:s.energyConsumed,
 diagnostics:{trackingSteps:tracking,altitudeCost,velocityCost,actionCost,failureCost,maxHorizontalSpeed,maxAngularRate,saturatedSteps,actionCounts}};
}
export type Episode=ReturnType<typeof episode>;
export function train(c:Candidate,explorationSeed:number,startSeed:number){
 const run=emptyRun(c);run.explorationSeed=explorationSeed;run.trainSeedRange=[startSeed,startSeed+c.episodes-1];const rng=new SeededRandom(explorationSeed);
 for(let i=0;i<c.episodes;i++)episode(startSeed+i,i%2===1,'train',c,run,rng,.3-.27*i/(c.episodes-1));return run;
}
// Restores shared-table identity lost on JSON load; required only for reproducible training replays.
export function restore(c:Candidate,run:Run){if(!c.separate){run.qWind=run.q;run.visitsWind=run.visits;}return run;}
export type Pair={explorationSeed:number;baseline:Episode;policy:Episode};
export function evaluate(c:Candidate,runs:Run[],ranges:number[][],includeWind:boolean){
 const pairs:Pair[]=[],before=JSON.stringify(runs);
 const baseline=new Map<string,Episode>();
 for(const wind of includeWind?[false,true]:[false])for(let seed=ranges[Number(wind)][0];seed<=ranges[Number(wind)][1];seed++)baseline.set(`${wind}:${seed}`,episode(seed,wind,'baseline',c));
 for(const run of runs)for(const wind of includeWind?[false,true]:[false])for(let seed=ranges[Number(wind)][0];seed<=ranges[Number(wind)][1];seed++){
  pairs.push({explorationSeed:run.explorationSeed,baseline:baseline.get(`${wind}:${seed}`)!,policy:episode(seed,wind,'policy',c,run)});
 }
 if(JSON.stringify(runs)!==before)throw new Error('Evaluation mutated tables');return pairs;
}
