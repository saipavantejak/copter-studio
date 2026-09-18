import { writeFileSync } from 'node:fs';
import { PhysicsEngine } from '../../src/PhysicsEngine';
import { VehicleController } from '../../src/VehicleController';
import { AIRCRAFT_PROFILES } from '../../src/AircraftProfiles';
import { SeededRandom } from '../../src/SeededRandom';
import { DEFAULT_MISSION,isTrackingMission } from '../../src/MissionSpec';
import { RESIDUAL_ACTIONS,STATE_COUNT,stateIndex,greedyAction,applyResidual } from '../../src/learning/ResidualPolicy';

const TRAIN_EPISODES=600, STEPS=1000, HOLD=8;
const config={...AIRCRAFT_PROFILES[0].config};
const q=Array.from({length:STATE_COUNT},()=>RESIDUAL_ACTIONS.map(()=>0));
const visits=Array.from({length:STATE_COUNT},()=>RESIDUAL_ACTIONS.map(()=>0));
const exploration=new SeededRandom(314159);
function episode(seed:number,wind:boolean,mode:'train'|'baseline'|'policy',epsilon=0){
  const physics=new PhysicsEngine();physics.config={...config};physics.rng=new SeededRandom(seed);
  physics.tests={windEnabled:wind,payloadShiftEnabled:false,batterySagEnabled:false,motorOutEnabled:false,missionPreset:'none'};
  physics.reset();const rng=new SeededRandom(seed ^ 0x271828);
  physics.setInitialConditions(rng.uniform(.5,1.5),rng.uniform(-.2,.2),rng.uniform(-.2,.2));
  const controller=new VehicleController();let s=physics.getState(),sumError=0,rewardTotal=0,steps=0,tracking=0;
  while(steps<STEPS&&!s.failureReason){
    const state=stateIndex(s.z,s.z_dot);
    const a=mode==='baseline'?0:mode==='train'&&exploration.next()<epsilon?Math.floor(exploration.next()*RESIDUAL_ACTIONS.length):greedyAction(q[state]);
    let reward=0;
    for(let j=0;j<HOLD&&steps<STEPS&&!s.failureReason;j++){
      s=physics.step(applyResidual(controller.action(s,config),a));steps++;
      const error=Math.abs(s.z-1);sumError+=error;
      reward-=error+.05*Math.abs(s.z_dot)+.1*Math.abs(RESIDUAL_ACTIONS[a]);
      if(steps>STEPS-125&&isTrackingMission(s,DEFAULT_MISSION))tracking++;
    }
    if(s.failureReason)reward-=100+STEPS-steps;
    rewardTotal+=reward;
    if(mode==='train'){
      const next=stateIndex(s.z,s.z_dot);
      const terminal=!!s.failureReason||steps===STEPS;
      q[state][a]+=.1*(reward+(terminal?0:.97*Math.max(...q[next]))-q[state][a]);visits[state][a]++;
    }
  }
  return {seed,wind,successful:!s.failureReason&&steps===STEPS&&tracking>=119,failed:!!s.failureReason,failureReason:s.failureReason??null,steps,meanAltitudeErrorM:sumError/steps,reward:rewardTotal,energyJ:s.energyConsumed};
}
for(let i=0;i<TRAIN_EPISODES;i++)episode(i+1,i%2===1,'train',.3-(.27*i/(TRAIN_EPISODES-1)));
const frozen=JSON.stringify(q);
const evaluations=[];
for(const wind of [false,true])for(let i=0;i<50;i++){
 const seed=100001+i+(wind?1000:0);
 evaluations.push({baseline:episode(seed,wind,'baseline'),policy:episode(seed,wind,'policy')});
}
if(JSON.stringify(q)!==frozen)throw new Error('Evaluation mutated policy');
function aggregate(rows:ReturnType<typeof episode>[]){return {episodes:rows.length,successes:rows.filter(x=>x.successful).length,failures:rows.filter(x=>x.failed).length,meanAltitudeErrorM:rows.reduce((s,x)=>s+x.meanAltitudeErrorM,0)/rows.length,meanReward:rows.reduce((s,x)=>s+x.reward,0)/rows.length};}
const results=[false,true].map(wind=>({wind,baseline:aggregate(evaluations.filter(e=>e.baseline.wind===wind).map(e=>e.baseline)),policy:aggregate(evaluations.filter(e=>e.policy.wind===wind).map(e=>e.policy))}));
const improves=results.every(r=>r.policy.successes>=r.baseline.successes&&r.policy.failures<=r.baseline.failures&&r.policy.meanReward>=r.baseline.meanReward)&&results.some(r=>r.policy.meanReward>r.baseline.meanReward);
const artifact={schemaVersion:1,method:'Tabular Q-learning residual collective controller',scope:'Crazyflie 2.1 reference configuration in Copter PhysicsEngine only',physicalValidation:false,trainingEpisodes:TRAIN_EPISODES,trainSeedRange:[1,600],evaluationSeedRanges:[[100001,100050],[101001,101050]],stepsPerEpisode:STEPS,decisionEverySteps:HOLD,alpha:.1,gamma:.97,epsilon:[.3,.03],config,actions:RESIDUAL_ACTIONS,q,visits,results,passesSimulationGate:improves,promoted:false,promotionReason:improves?'Independent physical testing still required':'Did not improve both held-out scenarios; existing controller retained',limitations:['Synthetic sinusoidal wind, not measured gusts.','No measured endurance labels.','Error is conditional on executed steps; use success/failure and penalized reward together.','Single training run; no statistical evidence of universal improvement.'],evaluations};
writeFileSync('public/learning/residual-policy.json',JSON.stringify(artifact,null,2)+'\n');
writeFileSync('src/learning/rl-summary.json',JSON.stringify({...artifact,q:undefined,visits:undefined,evaluations:undefined},null,2)+'\n');
console.log(JSON.stringify({trainingEpisodes:TRAIN_EPISODES,results,passesSimulationGate:improves,promoted:false},null,2));
