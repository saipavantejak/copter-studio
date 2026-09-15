/** Negative controls must fail honestly; stress flights need not succeed to pass a reporting test. */
import { AIRCRAFT_PROFILES } from '../src/AircraftProfiles';
import { EpisodeRunner } from '../src/EpisodeRunner';
import { RLAgent } from '../src/RLAgent';
import { DEF_TESTS } from '../src/SimulationParser';
import { DEFAULT_DOMAIN_RAND } from '../src/DomainRandomizer';
import type { PhysicsConfig, TestModules } from '../src/PhysicsEngine';

const nano={...AIRCRAFT_PROFILES[0].config};
const cases: Array<{name:string;config:PhysicsConfig;tests:TestModules;negative?:boolean;steps?:number}> = [
  {name:'Insufficient thrust negative control',config:{...nano,maxThrustPerMotorN:.001},tests:{...DEF_TESTS},negative:true},
  {name:'Battery depletion negative control',config:{...nano,batteryCapacity:.001},tests:{...DEF_TESTS},negative:true},
  {name:'Single motor failure stress',config:nano,tests:{...DEF_TESTS,motorOutEnabled:true}},
  {name:'All faults stress',config:nano,tests:{...DEF_TESTS,windEnabled:true,payloadShiftEnabled:true,batterySagEnabled:true,motorOutEnabled:true}},
  {name:'60-second hover',config:nano,tests:{...DEF_TESTS},steps:3750},
];
for (const c of cases) {
  const agent=new RLAgent();
  try {
    const s=await new EpisodeRunner().run(agent,{numEpisodes:50,maxStepsPerEpisode:c.steps??1000,randomizeIC:!c.negative,icAltRange:[.5,1.5],icAttRange:[-.2,.2],physicsConfig:c.config,testModules:c.tests,masterSeed:42,domainRandConfig:{...DEFAULT_DOMAIN_RAND,enabled:false}});
    const outcomes:Record<string,number>={};
    for(const ep of s.episodes)outcomes[ep.outcome??'Unknown']=(outcomes[ep.outcome??'Unknown']??0)+1;
    console.log(JSON.stringify({name:c.name,config:c.config,tests:c.tests,seed:42,episodes:s.numEpisodes,durationSeconds:s.durationSeconds,successRate:s.successRate,crashRate:s.crashRate,meanAltError:s.meanAltError,meanSurvivalTime:s.meanSurvivalTime,totalEnergyJ:s.totalEnergyJ,outcomes}));
    if(s.numEpisodes!==50 || s.episodes.some(e=>!Number.isFinite(e.energyJ) || !Number.isFinite(e.meanAltError) || (e.crashed && e.successful))) throw new Error('Invalid reporting: '+c.name);
    if(c.negative && (s.successRate!==0 || s.efficiencySampleCount!==0)) throw new Error('Negative control incorrectly succeeded: '+c.name);
    if(c.steps && (s.successRate!==1 || s.crashRate!==0)) throw new Error('Longer hover regression: '+c.name);
  } finally {agent.dispose();}
}
