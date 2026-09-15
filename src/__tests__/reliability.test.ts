// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PhysicsEngine, type PhysicsConfig } from '../PhysicsEngine';
import { DEF_CONFIG, DEF_TESTS, localParse, isSimulationCommand, hydrateGeminiResponse } from '../SimulationParser';
import { commandForThrust, thrustLimit } from '../physics/propulsion';
import { UniversalMixer } from '../UniversalMixer';
import { EpisodeRunner, type EpisodeBenchmarkConfig } from '../EpisodeRunner';
import { DEFAULT_DOMAIN_RAND } from '../DomainRandomizer';
import { RLAgent } from '../RLAgent';
import { MissionLogic } from '../MissionLogic';
import { computeInertia } from '../physics/core';
import { DomainRandomizer } from '../DomainRandomizer';
import { SeededRandom } from '../SeededRandom';

const nano: PhysicsConfig = {droneType:'quadcopter',mass:0.032,propDiameter:2.17,batteryVoltage:3.7,armLength:0.046,batteryCapacity:350,maxThrustPerMotorN:0.12*9.81/4};

describe('Input preservation and mission execution contract', () => {
  it('preserves nano values in cloud hydration and deterministic parsing', () => {
    expect(hydrateGeminiResponse({config:nano}).config).toEqual(nano);
    const intent=localParse('Benchmark 100 episodes with a 0.032kg quadcopter, 2.17 inch props, 3.7V battery, arm length 0.046m, seed 42');
    expect(intent.config).toMatchObject({mass:0.032,propDiameter:2.17,batteryVoltage:3.7,armLength:0.046});
    expect(intent.ambiguities.some(a=>a.level==='error')).toBe(false);
  });
  it('converts grams and preserves advanced configuration during edits', () => {
    const result=localParse('Run a 249 gram quad with 6 inch props and 7.32V battery', {...nano,inertiaOverride:{Ixx:1e-5,Iyy:1e-5,Izz:2e-5}});
    expect(result.config.mass).toBeCloseTo(0.249);
    expect(result.config.batteryVoltage).toBe(7.32);
    expect(result.config.batteryCapacity).toBe(350);
    expect(result.config.inertiaOverride?.Ixx).toBe(1e-5);
  });
  it('routes and represents advertised hover and velocity commands', () => {
    for (const prompt of ['Hover at 2 meters','Fly forward at 5 m/s for 10 seconds']) expect(isSimulationCommand(prompt)).toBe(true);
    expect(localParse('Hover at 2 meters').tests.mission?.targetAltitudeM).toBe(2);
    expect(localParse('Fly forward at 5 m/s for 10 seconds').tests.mission).toMatchObject({mode:'velocity',forwardVelocityMps:5,durationSeconds:10});
  });
  it('supports all faults and explicit negation', () => {
    const all=localParse('Stress test a 9kg bicopter with all fault modules');
    expect(all.tests).toMatchObject({windEnabled:true,payloadShiftEnabled:true,batterySagEnabled:true,motorOutEnabled:true});
    expect(localParse('Run with no wind',DEF_CONFIG,all.tests).tests.windEnabled).toBe(false);
  });
  it('blocks invalid values instead of silently clamping', () => {
    const intent=localParse('Run a -2kg quad');
    expect(intent.config.mass).toBe(-2);
    expect(intent.ambiguities.some(a=>a.level==='error')).toBe(true);
    expect(localParse('Fly an orbit at heading 90').ambiguities.some(a=>a.level==='error')).toBe(true);
    expect(localParse('Run a 29g quad with 15g payload').ambiguities.some(a=>a.level==='error')).toBe(true);
    expect(localParse('Benchmark 100-episode quad with arm 46mm').config.armLength).toBeCloseTo(0.046);
    expect(localParse('Benchmark 100-episode quad').numEpisodes).toBe(100);
  });
});

describe('Energy and actuator consistency', () => {
  it('uses dimensionally consistent inertia scaling and preserves overrides in domain randomization', () => {
    const a=computeInertia(2,1,0.1),b=computeInertia(4,1,0.2);
    expect(b.Ixx/a.Ixx).toBeCloseTo(4);
    const original={...nano,inertiaOverride:{Ixx:1e-5,Iyy:1e-5,Izz:2e-5}};
    const varied=new DomainRandomizer({...DEFAULT_DOMAIN_RAND,enabled:true}).randomize(original,new SeededRandom(42),42);
    expect(varied.physicsConfig.inertiaOverride).toEqual(original.inertiaOverride);
    expect(varied.physicsConfig.batteryCapacity).toBe(350);
    expect(varied.physicsConfig.maxThrustPerMotorN).toBe(nano.maxThrustPerMotorN);
  });
  it.each([false,true])('drains battery and conserves nominal energy with sag=%s', sag => {
    const p=new PhysicsEngine();p.config={...nano};p.tests={...DEF_TESTS,batterySagEnabled:sag};p.reset();p.setInitialConditions(100,0,0);
    for(let i=0;i<100;i++) p.step([0,0,0,0,0,0]);
    expect(p.totalEnergyConsumed).toBeGreaterThan(0);
    expect(p.getState().battery).toBeLessThan(1);
    expect((p.batteryCapacity-p.currentBattery)*p.config.batteryVoltage*3.6).toBeCloseTo(p.totalEnergyConsumed,7);
  });
  it('uses a measured curve for both command inverse and electrical draw', () => {
    const p=new PhysicsEngine();p.config={...nano,batteryCapacity:10000,propulsionCurve:[{command:-1,thrustN:0,powerW:0},{command:1,thrustN:1,powerW:25}]};p.reset();p.setInitialConditions(100,0,0);
    expect(commandForThrust(p.config,0.5)).toBeCloseTo(0,6);
    for(let i=0;i<100;i++)p.step([1,1,1,1,0,0]);
    expect(p.lastPowerW).toBeCloseTo(100.05,1);
  });
  it('rotor symmetry produces zero moment, independent of unachieved commands', () => {
    expect(UniversalMixer.fromThrusts('quadcopter',[1,1,1,1],[1,-1,-1,-1],0.1).moments).toEqual({L:0,M:0,N:0});
    expect(UniversalMixer.fromThrusts('quadcopter',[0,0,0,0],[1,1,1,1],0.1).moments).toEqual({L:0,M:0,N:0});
  });
  it('latches ground impact and invalid controller output', () => {
    const p=new PhysicsEngine();p.reset();p.setInitialConditions(0.2,0.1,0.1);
    for(let i=0;i<100;i++)p.step([-1,0,0,-1,0,0]);
    expect(p.failureReason).toBe('Ground impact');expect(p.impactSpeedMps).toBeGreaterThan(0);
    p.reset();p.step([NaN,0,0,0,0,0]);expect(p.failureReason).toBe('Invalid controller output');
  });
  it('does not fabricate payload-specific SEC', () => {
    const p=new PhysicsEngine(); const s=p.getState();
    const m=MissionLogic.calculateMetrics({...DEF_CONFIG,mass:1.99},s,[],100,100);
    expect(m.secApplicable).toBe(false);
    const a=MissionLogic.calculateMetrics({...DEF_CONFIG,mass:1.99,payloadMassKg:0.5},s,[],100,100);
    const b=MissionLogic.calculateMetrics({...DEF_CONFIG,mass:2.01,payloadMassKg:0.5},s,[],100,100);
    expect(a.sec).toBe(b.sec);expect(a.sec).toBeCloseTo(2);
  });
});

describe('Shared benchmark regression', () => {
  const cfg=(config:PhysicsConfig):EpisodeBenchmarkConfig=>({numEpisodes:3,maxStepsPerEpisode:1000,randomizeIC:true,icAltRange:[0.5,1.5],icAttRange:[-0.2,0.2],physicsConfig:config,testModules:{...DEF_TESTS},masterSeed:42,domainRandConfig:{...DEFAULT_DOMAIN_RAND,enabled:false}});
  it('is repeatable across runs using the same agent',async()=>{
    const agent=new RLAgent();try {
      const runner=new EpisodeRunner();const a=await runner.run(agent,cfg(nano));const b=await runner.run(agent,cfg(nano));
      expect(a).toEqual(b);
    } finally {agent.dispose();}
  });
  it('distinguishes failed takeoff from successful survival',async()=>{
    const agent=new RLAgent();try {
      const c=cfg({...nano,maxThrustPerMotorN:0.001});c.randomizeIC=false;
      const result=await new EpisodeRunner().run(agent,c);
      expect(result.successRate).toBe(0);expect(result.episodes.every(r=>r.outcome==='Failed takeoff')).toBe(true);
      expect(result.efficiencySampleCount).toBe(0);
    } finally {agent.dispose();}
  });
  it('tracks a two-metre target on the configuration-aware controller',async()=>{
    const agent=new RLAgent();try {
      const c=cfg(nano);c.testModules.mission={mode:'hover',targetAltitudeM:2,forwardVelocityMps:0,durationSeconds:16};
      const result=await new EpisodeRunner().run(agent,c);
      expect(result.crashRate).toBe(0);expect(result.successRate).toBe(1);
    } finally {agent.dispose();}
  });
  it('executes a 5 m/s, 10-second mission rather than default hover',async()=>{
    const agent=new RLAgent();try {
      const c=cfg({...DEF_CONFIG,droneType:'quadcopter'});
      c.numEpisodes=1;c.testModules.mission={mode:'velocity',targetAltitudeM:1,forwardVelocityMps:5,durationSeconds:10};
      const result=await new EpisodeRunner().run(agent,c);
      expect(result.crashRate).toBe(0);expect(result.successRate).toBe(1);
      expect(result.episodes[0].survivalTime).toBeCloseTo(10,2);
    } finally {agent.dispose();}
  });
  it('supports longer simulations and cancellation without NaN batch rates',async()=>{
    const agent=new RLAgent();try {
      const c=cfg({...DEF_CONFIG,droneType:'quadcopter'});c.numEpisodes=1;c.maxStepsPerEpisode=3750;
      const result=await new EpisodeRunner().run(agent,c);
      expect(result.episodes[0].survivalTime).toBeCloseTo(60,2);
      const abort=new AbortController();abort.abort();
      const empty=await new EpisodeRunner().run(agent,c,abort.signal);
      expect(empty.numEpisodes).toBe(0);expect(empty.crashRate).toBe(0);
    } finally {agent.dispose();}
  });
});
