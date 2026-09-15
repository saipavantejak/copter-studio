/** Deterministic software regression fixtures, NOT independent physical validation.
 * Nano thrust ceilings are explicit inputs from the previous assessment; passing
 * these fixtures does not independently verify those supplied ceilings or endurance.
 * Other fixtures are representative dimensions, not claimed manufacturer twins.
 */
import { RLAgent } from '../src/RLAgent';
import { EpisodeRunner } from '../src/EpisodeRunner';
import type { PhysicsConfig } from '../src/PhysicsEngine';
import { DEFAULT_DOMAIN_RAND } from '../src/DomainRandomizer';
import { DEF_TESTS } from '../src/SimulationParser';

const nano: PhysicsConfig = {droneType:'quadcopter',mass:0.029,propDiameter:45/25.4,batteryVoltage:3.7,armLength:0.046,batteryCapacity:250,maxThrustPerMotorN:0.060*9.81/4};
const brushless: PhysicsConfig = {...nano,mass:0.032,propDiameter:2.17,batteryCapacity:350,maxThrustPerMotorN:0.120*9.81/4};
const fixtures: Array<[string,PhysicsConfig]> = [
  ['29g nano, supplied 60g thrust ceiling',nano],
  ['44g nano payload fixture',{...nano,mass:0.044,payloadMassKg:0.015}],
  ['32g nano, supplied 120g thrust ceiling',brushless],
  ['72g nano payload fixture',{...brushless,mass:0.072,payloadMassKg:0.040}],
  ['958g representative quad',{droneType:'quadcopter',mass:0.958,propDiameter:9.4,batteryVoltage:15.4,armLength:0.19}],
  ['5kg swashplate approximation',{droneType:'bicopter',mass:5,propDiameter:15,batteryVoltage:22.2,armLength:0.5}],
  ['15.5kg representative hex',{droneType:'hexacopter',mass:15.5,propDiameter:22,batteryVoltage:44.4,armLength:0.8}],
];
const results = [];
for (const [name,config] of fixtures) {
  const agent = new RLAgent();
  try {
    const stats=await new EpisodeRunner().run(agent,{
      numEpisodes:50,maxStepsPerEpisode:1000,randomizeIC:true,
      icAltRange:[0.5,1.5],icAttRange:[-0.2,0.2],physicsConfig:config,
      testModules:{...DEF_TESTS},masterSeed:42,domainRandConfig:{...DEFAULT_DOMAIN_RAND,enabled:false},
    });
    const result={name,config,crashRate:stats.crashRate,successRate:stats.successRate,meanAltError:stats.meanAltError,
      meanSurvivalTime:stats.meanSurvivalTime,totalEnergyJ:stats.totalEnergyJ,efficiencySampleCount:stats.efficiencySampleCount};
    results.push(result);
    console.log(JSON.stringify(result));
  } finally {agent.dispose();}
}
if(results.some(r=>r.crashRate!==0 || r.successRate!==1 || r.meanAltError>=0.1)) process.exitCode=1;
