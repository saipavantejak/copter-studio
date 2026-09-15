// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {localParse,DEF_TESTS,DEF_CONFIG} from '../SimulationParser';
import {AIRCRAFT_PROFILES,editHardware,propulsionEvidence} from '../AircraftProfiles';
import {configErrors} from '../configValidation';
import {rateInterval} from '../BenchmarkEvidence';
import {thrustLimit} from '../physics/propulsion';
import {EpisodeRunner,type EpisodeBenchmarkConfig} from '../EpisodeRunner';
import {RLAgent} from '../RLAgent';
import {DEFAULT_DOMAIN_RAND} from '../DomainRandomizer';
import {PhysicsEngine} from '../PhysicsEngine';
import {VehicleController} from '../VehicleController';
import {eulerToQuat,qToEuler} from '../physics/core';

const errors=(s:string)=>localParse(s).ambiguities.filter(a=>a.level==='error');
describe('Aether adversarial commands',()=>{
  it.each(['Run a DJI Avata 2','Run Crazyflie 2.1+','Run a -0.032kg quad','Run 2.5 episodes','Run a quad seed 4.2',
    'Run a 2kg quad weighing 3kg','Run a quad at 3.7V and 7.4V','Hover at 2m and fly at 5m/s',
    'Run wind at 5m/s','Hover at 10 feet','Run a 4lb quad','Run Crazyflie 2.1 with 15 inch props'])('blocks %s',s=>expect(errors(s).length).toBeGreaterThan(0));
  it.each(['.032kg','3.2e-2kg','32g'])('preserves %s',mass=>expect(localParse('Run a '+mass+' quad').config.mass).toBeCloseTo(.032));
  it('honors run N times',()=>expect(localParse('Run 12 times with a quad').numEpisodes).toBe(12));
  it('honors sensor and randomization off',()=>{
    expect(localParse('Run sensor noise off').sensorCfg.enableNoise).toBe(false);
    expect(localParse('Run domain randomization off').domainRandEnabled).toBe(false);
  });
  it.each(['gusts','turbulence','storm'])('recognizes and negates %s',word=>{
    expect(localParse('Run with '+word).tests.windEnabled).toBe(true);
    expect(localParse('Run without '+word,DEF_CONFIG,{...DEF_TESTS,windEnabled:true}).tests.windEnabled).toBe(false);
  });
  it('all faults except wind leaves the other modules enabled',()=>{
    expect(localParse('Run all faults except wind').tests).toMatchObject({windEnabled:false,batterySagEnabled:true,motorOutEnabled:true,payloadShiftEnabled:true});
  });
  it('no faults disables inherited modules',()=>{
    const t=localParse('Run all faults').tests;
    expect(localParse('Run with no faults',DEF_CONFIG,t).tests).toMatchObject(DEF_TESTS);
  });
  it('loads reference inputs instead of the previous vehicle',()=>{
    const a=localParse('Benchmark Crazyflie 2.1');
    expect(a.config).toEqual(AIRCRAFT_PROFILES[0].config);
    expect(localParse('Benchmark Crazyflie 2.1 Brushless').config).toEqual(AIRCRAFT_PROFILES[1].config);
  });
});

describe('Evidence integrity',()=>{
  it('initializes quaternion consistently at nonzero heading',()=>{
    const angles=[.2,-.3,1.4];
    qToEuler(eulerToQuat(...angles as [number,number,number])).forEach((a,i)=>expect(a).toBeCloseTo(angles[i],10));
  });
  it.each([-Math.PI/2,Math.PI/2])('tracks world forward from heading %s',heading=>{
    const phys=new PhysicsEngine();phys.config={...AIRCRAFT_PROFILES[0].config};phys.reset();phys.setInitialConditions(1,0,0,heading);
    const ctrl=new VehicleController();const mission={mode:'velocity' as const,targetAltitudeM:1,forwardVelocityMps:1,durationSeconds:10};
    for(let i=0;i<625;i++)phys.step(ctrl.action(phys.getState(),phys.config,mission));
    const s=phys.getState();expect(s.failureReason).toBeUndefined();expect(s.x_dot).toBeCloseTo(1,1);expect(Math.abs(s.y_dot)).toBeLessThan(.1);
  });
  it('reference maxima match source inputs without claiming independent validation',()=>{
    for (const [i,g] of [60,120].entries()) {
      const c=AIRCRAFT_PROFILES[i].config;
      expect(thrustLimit(c)*4/9.81*1000).toBeCloseTo(g);
      expect(propulsionEvidence(c).physicallyValidated).toBe(false);
      expect(propulsionEvidence(c).sources.length).toBeGreaterThan(0);
    }
  });
  it('hardware changes invalidate retained rotor data while payload changes retain it',()=>{
    const c=AIRCRAFT_PROFILES[0].config;
    expect(editHardware(c,{propDiameter:3}).maxThrustPerMotorN).toBeUndefined();
    expect(editHardware(c,{mass:.044}).maxThrustPerMotorN).toBe(c.maxThrustPerMotorN);
    expect(propulsionEvidence(editHardware(c,{batteryVoltage:7.4})).sources).toEqual([]);
  });
  it('rejects free thrust, zero authority and conflicting curve ceilings',()=>{
    const c=AIRCRAFT_PROFILES[0].config;
    for(const [thrustN,powerW] of [[1,0],[0,1],[1,5]]) {
      expect(configErrors({...c,propulsionCurve:[{command:-1,thrustN:0,powerW:0},{command:1,thrustN,powerW}]}).length).toBeGreaterThan(0);
    }
  });
  it('100% observed success is not statistical certainty',()=>{
    const ci=rateInterval(50,50)!;
    expect(ci[0]).toBeCloseTo(.92865,4);expect(ci[1]).toBeCloseTo(1);
    expect(rateInterval(0,50)![1]).toBeCloseTo(.07135,4);
    expect(rateInterval(0,0)).toBeNull();
  });
});

describe('Benchmark boundary and audit tests',()=>{
  const cfg=():EpisodeBenchmarkConfig=>({numEpisodes:1,maxStepsPerEpisode:1000,randomizeIC:true,icAltRange:[.5,1.5],icAttRange:[-.2,.2],physicsConfig:{...AIRCRAFT_PROFILES[0].config},testModules:{...DEF_TESTS},masterSeed:42,domainRandConfig:{...DEFAULT_DOMAIN_RAND,enabled:false}});
  it.each([{masterSeed:NaN},{masterSeed:-1},{masterSeed:2**32},{icAltRange:[2,1]},{icAttRange:[NaN,.2]}])('rejects invalid direct inputs %j',async patch=>{
    const agent=new RLAgent();try{await expect(new EpisodeRunner().run(agent,{...cfg(),...patch} as EpisodeBenchmarkConfig)).rejects.toThrow();}finally{agent.dispose();}
  });
  it('records executed settings independently of subsequent editor changes',async()=>{
    const c=cfg(),agent=new RLAgent();
    try{
      const result=await new EpisodeRunner().run(agent,c);
      c.physicsConfig.mass=15;
      expect(result.requestedConfig?.physicsConfig.mass).toBe(.029);
      expect(result.episodes[0].executedConfig?.mass).toBe(.029);
      expect(result.episodes[0].executedMission?.durationSeconds).toBe(16);
      expect(result.episodes[0].propulsionEvidence?.status).toBe('Manufacturer maximum only');
      expect(result.successRate95CI![0]).toBeLessThan(1);
    }finally{agent.dispose();}
  });
});
