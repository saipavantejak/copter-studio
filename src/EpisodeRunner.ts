// EpisodeRunner.ts
// v9 fix: masterRng.fork(ep) used for all episode seeds — consistent with SeededRandom contract.
//         (Previously masterRng was created then never consumed.)

import { DEFAULT_MISSION, missionErrors } from './MissionSpec';
import { DT } from './physics/constants';
import { rateInterval } from './BenchmarkEvidence';
import { propulsionEvidence } from './AircraftProfiles';
import { assertValidConfig } from './configValidation';
import type { SensorConfig } from './SensorNoise';
import { PhysicsEngine, PhysicsConfig, TestModules } from './PhysicsEngine';
import { RLAgent } from './RLAgent';
import type { SerializedModel } from './RLAgent';
import { MissionLogic, MissionMetrics } from './MissionLogic';
import { SeededRandom } from './SeededRandom';
import { DomainRandomizer, DomainRandomConfig, DEFAULT_DOMAIN_RAND } from './DomainRandomizer';

export interface EpisodeBenchmarkConfig {
  sensorConfig?: SensorConfig;
  numEpisodes:         number;
  maxStepsPerEpisode:  number;
  randomizeIC:         boolean;
  icAltRange:          [number, number];
  icAttRange:          [number, number];
  physicsConfig:       PhysicsConfig;
  testModules:         TestModules;
  masterSeed:          number;
  domainRandConfig:    DomainRandomConfig;
  /** Serialized RL model weights. When present the worker benchmarks the RL
   *  policy instead of heuristic PD. Null/undefined → heuristic PD. */
  serializedModel?:    SerializedModel | null;
}

export interface EpisodeResult {
  executedMission?: import('./MissionSpec').MissionSpec;
  executedTests?: TestModules;
  executedSensors?: SensorConfig;
  propulsionEvidence?: ReturnType<typeof propulsionEvidence>;
  id:            number;
  crashed:       boolean;
  outcome?: string;
  successful?: boolean;
  energyJ?: number;
  finalBattery?: number;
  executedConfig?: PhysicsConfig;
  secApplicable?: boolean;
  survivalTime:  number;
  finalAlt:      number;
  meanAltError:  number;
  maxRoll:       number;
  maxPitch:      number;
  sec:           number;
  spt:           number;
  seed:          number;
  /** Which controller ran this episode */
  controller:    'Heuristic PD' | 'RL Policy';
  domainParams?: {
    mass:        number;
    motorTau:    number;
    dragCoeff:   number;
    windEnabled: boolean;
  };
}

export interface BatchStats {
  successRate95CI?: [number, number] | null;
  crashRate95CI?: [number, number] | null;
  cancelled?: boolean;
  requestedConfig?: EpisodeBenchmarkConfig;
  simulatorVersion?: string;
  numEpisodes: number;
  crashRate: number;
  successRate?: number;
  totalEnergyJ?: number;
  efficiencySampleCount?: number;
  durationSeconds?: number;
  meanSurvivalTime: number;
  meanAltError: number;
  stdAltError: number;
  meanSEC: number;
  stdSEC: number;
  meanSPT: number;
  stdSPT: number;
  bestSEC: number;
  worstSEC: number;
  masterSeed: number;
  episodes: EpisodeResult[];
}

function std(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s,x)=>s+(x-mean)**2,0)/(arr.length-1));
}

export class EpisodeRunner {
  private onProgress?: (done: number, total: number, r: EpisodeResult) => void;

  setProgressCallback(cb: (done: number, total: number, r: EpisodeResult) => void) {
    this.onProgress = cb;
  }

  async run(
    agent: RLAgent,
    cfg: EpisodeBenchmarkConfig,
    signal?: AbortSignal
  ): Promise<BatchStats> {
    assertValidConfig(cfg.physicsConfig);
    if (!Number.isSafeInteger(cfg.masterSeed) || cfg.masterSeed < 0 || cfg.masterSeed > 0xffffffff) throw new Error('Seed must be uint32');
    for (const [range,name,min,max] of [[cfg.icAltRange,'altitude',0,120],[cfg.icAttRange,'attitude',-Math.PI/3,Math.PI/3]] as const) {
      if (!Array.isArray(range) || range.length!==2 || !range.every(Number.isFinite) || range[0]>range[1] || range[0]<min || range[1]>max) throw new Error('Invalid initial '+name+' range');
    }
    for (const key of ['windEnabled','payloadShiftEnabled','batterySagEnabled','motorOutEnabled'] as const) {
      if (typeof cfg.testModules[key] !== 'boolean') throw new Error(key+' must be boolean');
    }
    if (!Number.isInteger(cfg.numEpisodes) || cfg.numEpisodes < 1 || cfg.numEpisodes > 500) throw new Error('Episode count must be 1–500');
    if (!Number.isInteger(cfg.maxStepsPerEpisode) || cfg.maxStepsPerEpisode < 1 || cfg.maxStepsPerEpisode > 225000) throw new Error('Invalid step budget');
    const mission = cfg.testModules.mission ?? {...DEFAULT_MISSION, durationSeconds:cfg.maxStepsPerEpisode*DT};
    const missionIssues = missionErrors(mission);
    if (missionIssues.length) throw new Error(missionIssues.join('; '));
    const maxSteps = Math.min(cfg.maxStepsPerEpisode, Math.ceil(mission.durationSeconds / DT));
    const results: EpisodeResult[] = [];

    // Fix 5: masterRng is now actually consumed — epRng = masterRng.fork(ep)
    const masterRng  = new SeededRandom(cfg.masterSeed);
    const domainizer = new DomainRandomizer(cfg.domainRandConfig);

    for (let ep = 0; ep < cfg.numEpisodes; ep++) {
      if (signal?.aborted) break;
      if (ep % 5 === 0) await new Promise(r => setTimeout(r, 0));

      // Fix 5: derive per-episode RNG from master via fork (replaces XOR shortcut)
      const epRng  = masterRng.fork(ep);
      const epSeed = epRng.getState();

      const domainCfg = domainizer.randomize(cfg.physicsConfig, epRng.fork(ep), epSeed);

      const phys = new PhysicsEngine();
      phys.config = { ...domainCfg.physicsConfig };
      phys.tests  = {
        ...cfg.testModules,
        windEnabled: cfg.testModules.windEnabled || domainCfg.windEnabled,
        payloadShiftEnabled: cfg.testModules.payloadShiftEnabled || domainCfg.payloadEnabled,
      };
      phys.sensorCfg = cfg.domainRandConfig.enabled ? domainCfg.sensorConfig : cfg.sensorConfig ?? domainCfg.sensorConfig;
      phys.motorTauOverride = domainCfg.motorTau;
      phys.dragCoeffOverride = domainCfg.dragCoeff;
      phys.rng = epRng;

      phys.reset();
      agent.resetIntegral();
      if (cfg.randomizeIC) {
        const z0    = cfg.icAltRange[0] + epRng.next() * (cfg.icAltRange[1] - cfg.icAltRange[0]);
        const phi0  = cfg.icAttRange[0] + epRng.next() * (cfg.icAttRange[1] - cfg.icAttRange[0]);
        const theta0= cfg.icAttRange[0] + epRng.next() * (cfg.icAttRange[1] - cfg.icAttRange[0]);
        phys.setInitialConditions(z0, phi0, theta0);
      }

      const history: any[] = [];
      let crashed = false;
      let outcome = 'Time limit reached';
      let altErrorSum = 0;
      let stepCount = 0;
      let maxRoll = 0, maxPitch = 0;
      let liftedOff = phys.getState().z > 0.05;

      for (let step = 0; step < maxSteps; step++) {
        if (step % 256 === 0) {
          await new Promise(r => setTimeout(r, 0));
          if (signal?.aborted) break;
        }
        const obs = phys.getObservation();
        const stateArr = [obs.x,obs.y,obs.z,obs.x_dot,obs.y_dot,obs.z_dot,obs.phi,obs.theta,obs.psi,obs.p,obs.q,obs.r];
        const action = agent.predictAction(stateArr, cfg.physicsConfig.droneType, cfg.testModules.missionPreset, phys.config, cfg.testModules.mission);
        const ns = phys.step(action);

        history.push({ ...ns, servos: action });
        stepCount++;
        if (history.length > 1000) history.shift();
        altErrorSum += Math.abs(ns.z - mission.targetAltitudeM);
        maxRoll  = Math.max(maxRoll,  Math.abs(ns.phi));
        maxPitch = Math.max(maxPitch, Math.abs(ns.theta));
        liftedOff ||= ns.z > 0.05;
        // A hover/velocity mission requires takeoff; do not waste a long horizon
        // reporting an upright vehicle on the floor as successful survival.
        if (!liftedOff && ns.time >= 5) { outcome = 'Failed takeoff'; break; }

        if (ns.failureReason) { crashed = true; outcome = ns.failureReason; break; }
        // Ground crash: low altitude + bad attitude
        if (ns.z < 0.1 && (Math.abs(ns.phi) > 0.5 || Math.abs(ns.theta) > 0.5)) {
          crashed = true;
          outcome = 'Attitude/operating envelope failure';
          break;
        }
        // Attitude divergence: drone inverted or tumbling at ANY altitude (> 60° roll or pitch)
        if (Math.abs(ns.phi) > Math.PI / 3 || Math.abs(ns.theta) > Math.PI / 3) {
          crashed = true;
          outcome = 'Attitude/operating envelope failure';
          break;
        }
        // Altitude runaway: uncontrolled climb beyond reasonable bounds
        if (ns.z > 500) {
          crashed = true;
          outcome = 'Altitude operating envelope failure';
          break;
        }
      }

      if (signal?.aborted) break;
      const finalState = phys.getState();
      const tail = history.filter(h => h.time > finalState.time - Math.min(2, finalState.time));
      const trackingOK = tail.length > 0 && tail.every(h =>
        Math.abs(h.z - mission.targetAltitudeM) <= 0.1 &&
        (mission.mode !== 'velocity' || Math.abs(h.x_dot - mission.forwardVelocityMps) <= 0.5));
      const completed = finalState.time + DT / 2 >= mission.durationSeconds;
      const successful = !crashed && completed && trackingOK;
      if (!crashed) outcome = successful ? 'Successful mission' : finalState.z < 0.1 ? 'Failed takeoff' : completed ? 'Tracking failure' : 'Time limit reached';
      const metrics = MissionLogic.calculateMetrics(
        phys.config, finalState, history, phys.totalEnergyConsumed, phys.totalDistance
      );

      const result: EpisodeResult = {
        executedMission: {...mission}, executedTests: {...phys.tests,mission:{...mission}},
        executedSensors: {...phys.sensorCfg}, propulsionEvidence: propulsionEvidence(phys.config),
        id: ep, crashed, outcome, successful,
        energyJ: phys.totalEnergyConsumed, finalBattery: finalState.battery,
        executedConfig: {...phys.config}, secApplicable: metrics.secApplicable,
        survivalTime: finalState.time,
        finalAlt: finalState.z,
        meanAltError: altErrorSum / Math.max(1, stepCount),
        maxRoll, maxPitch,
        sec: metrics.sec, spt: metrics.spt,
        seed: epSeed,
        controller: agent.isUsingUserModel ? 'RL Policy' : 'Heuristic PD',
        domainParams: {
          mass: domainCfg.physicsConfig.mass,
          motorTau: domainCfg.motorTau,
          dragCoeff: domainCfg.dragCoeff,
          windEnabled: domainCfg.windEnabled,
        },
      };

      results.push(result);
      this.onProgress?.(ep + 1, cfg.numEpisodes, result);
    }

    const crashed = results.filter(r=>r.crashed).length;
    const times   = results.map(r=>r.survivalTime);
    const altErrs = results.map(r=>r.meanAltError);
    const secs    = results.filter(r=>r.successful && r.secApplicable && Number.isFinite(r.sec)).map(r=>r.sec);
    const spts    = results.map(r=>r.spt);
    const mean    = (a: number[]) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
    const mAlt=mean(altErrs), mSEC=mean(secs), mSPT=mean(spts);

    return {
      simulatorVersion: 'reliability-v2',
      requestedConfig: JSON.parse(JSON.stringify({...cfg,serializedModel:undefined})),
      cancelled: signal?.aborted ?? false,
      successRate95CI: rateInterval(results.filter(r=>r.successful).length,results.length),
      crashRate95CI: rateInterval(crashed,results.length),
      numEpisodes: results.length,
      crashRate: results.length ? crashed / results.length : 0,
      successRate: results.length ? results.filter(r=>r.successful).length / results.length : 0,
      totalEnergyJ: results.reduce((sum,r)=>sum+(r.energyJ ?? 0),0),
      efficiencySampleCount: secs.length,
      durationSeconds: mission.durationSeconds,
      meanSurvivalTime: mean(times),
      meanAltError: mAlt, stdAltError: std(altErrs, mAlt),
      meanSEC: mSEC, stdSEC: std(secs, mSEC),
      meanSPT: mSPT, stdSPT: std(spts, mSPT),
      bestSEC:  secs.length ? Math.min(...secs) : 0,
      worstSEC: secs.length ? Math.max(...secs) : 0,
      masterSeed: cfg.masterSeed,
      episodes: results,
    };
  }
}
