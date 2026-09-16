// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {isSimulationCommand,localParse,DEF_TESTS} from '../SimulationParser';
import {resolveMission,isTrackingMission} from '../MissionSpec';
import {benchmarkAudit} from '../BenchmarkAudit';
import {benchmarkRecord,configurationRecord} from '../cloudDatabase';
import {EpisodeRunner,type BatchStats} from '../EpisodeRunner';
import {AIRCRAFT_PROFILES} from '../AircraftProfiles';
import {RLAgent} from '../RLAgent';
import {DEFAULT_DOMAIN_RAND} from '../DomainRandomizer';

describe('Production integration regressions',()=>{
  it.each(['Run a -0.032kg quad','Run 2.5 episodes','Run a 2kg quad','Run a hex seed 0'])('routes %s through deterministic parsing',s=>{
    expect(isSimulationCommand(s)).toBe(true);
    if(s.includes('-0.')||s.includes('2.5'))expect(localParse(s).ambiguities.some(a=>a.level==='error')).toBe(true);
  });
  it('shares legacy mission interpretation and rejects horizontal drift',()=>{
    const hover=resolveMission(DEF_TESTS);
    const s={z:1,x:0,y:0,x_dot:0,y_dot:0};
    expect(isTrackingMission(s,hover)).toBe(true);
    expect(isTrackingMission({...s,x:1},hover)).toBe(false);
    expect(isTrackingMission({...s,y_dot:1},hover)).toBe(false);
    const velocity=resolveMission({...DEF_TESTS,missionPreset:'long-range'},60);
    expect(velocity).toMatchObject({mode:'velocity',forwardVelocityMps:5,durationSeconds:60});
    expect(isTrackingMission({...s,x:100,x_dot:5},velocity)).toBe(true);
    expect(isTrackingMission(s,velocity)).toBe(false);
  });
  it('uses unavailable SEC and actual SPT variation in its audit',()=>{
    const s={numEpisodes:50,successRate:1,crashRate:0,durationSeconds:16,meanAltError:.01,meanSEC:null,stdSEC:null,efficiencySampleCount:0,meanSPT:.4,stdSPT:.2,successRate95CI:[.92865,1]} as BatchStats;
    const audit=benchmarkAudit(s);
    expect(audit).toContain('Conditional SEC: N/A');
    expect(audit).toContain('SEC standard deviation: N/A');
    expect(audit).toContain('sample standard deviation: 0.20000');
    expect(audit).toContain('92.9%–100.0%');
    expect(audit).toContain('does not establish certainty');
  });
  it('does not upload model weights or incomplete benchmarks',()=>{
    const s={numEpisodes:1,episodes:[{}],requestedConfig:{serializedModel:{weights:'private'}}} as unknown as BatchStats;
    expect(benchmarkRecord(s).requestedConfig.serializedModel).toBeUndefined();
    expect(s.requestedConfig!.serializedModel).toBeDefined();
    expect(()=>benchmarkRecord({...s,numEpisodes:2})).toThrow('incomplete');
    expect(()=>configurationRecord({...AIRCRAFT_PROFILES[0].config,mass:-1})).toThrow();
  });
  it('withholds randomized physical parameters from the controller and leaves SEC unavailable for hover',async()=>{
    const agent=new RLAgent(),nominal={...AIRCRAFT_PROFILES[0].config};
    const spy=vi.spyOn(agent,'predictAction');
    try{
      const stats=await new EpisodeRunner().run(agent,{numEpisodes:1,maxStepsPerEpisode:1000,randomizeIC:true,icAltRange:[.5,1.5],icAttRange:[-.2,.2],physicsConfig:nominal,testModules:{...DEF_TESTS},masterSeed:0,domainRandConfig:{...DEFAULT_DOMAIN_RAND,enabled:true}});
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls.every(c=>typeof c[3]==='object'&&c[3].mass===nominal.mass)).toBe(true);
      expect(stats.episodes[0].executedConfig.mass).not.toBe(nominal.mass);
      expect(stats.meanSEC).toBeNull();expect(stats.stdSEC).toBeNull();
    }finally{spy.mockRestore();agent.dispose();}
  });
});
