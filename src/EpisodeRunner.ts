// EpisodeRunner.ts
// v9 fix: masterRng.fork(ep) used for all episode seeds — consistent with SeededRandom contract.
//         (Previously masterRng was created then never consumed.)

import { PhysicsEngine, PhysicsConfig, TestModules } from './PhysicsEngine';
import { RLAgent } from './RLAgent';
import type { SerializedModel } from './RLAgent';
import { MissionLogic, MissionMetrics } from './MissionLogic';
import { SeededRandom } from './SeededRandom';
import { DomainRandomizer, DomainRandomConfig, DEFAULT_DOMAIN_RAND } from './DomainRandomizer';

export interface EpisodeBenchmarkConfig {
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
  id:            number;
  crashed:       boolean;
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
  numEpisodes: number;
  crashRate: number;
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
      phys.sensorCfg = domainCfg.sensorConfig;
      phys.motorTauOverride = domainCfg.motorTau;
      phys.dragCoeffOverride = domainCfg.dragCoeff;
      phys.rng = epRng;

      if (cfg.randomizeIC) {
        const z0    = cfg.icAltRange[0] + epRng.next() * (cfg.icAltRange[1] - cfg.icAltRange[0]);
        const phi0  = cfg.icAttRange[0] + epRng.next() * (cfg.icAttRange[1] - cfg.icAttRange[0]);
        const theta0= cfg.icAttRange[0] + epRng.next() * (cfg.icAttRange[1] - cfg.icAttRange[0]);
        phys.reset();
        phys.setInitialConditions(z0, phi0, theta0);
      } else {
        phys.reset();
      }

      const history: any[] = [];
      let crashed = false;
      let altErrorSum = 0;
      let maxRoll = 0, maxPitch = 0;

      for (let step = 0; step < cfg.maxStepsPerEpisode; step++) {
        const obs = phys.getObservation();
        const stateArr = [obs.x,obs.y,obs.z,obs.x_dot,obs.y_dot,obs.z_dot,obs.phi,obs.theta,obs.psi,obs.p,obs.q,obs.r];
        const action = agent.predictAction(stateArr, cfg.physicsConfig.droneType, cfg.testModules.missionPreset, domainCfg.physicsConfig.mass);
        const ns = phys.step(action);

        history.push({ ...ns, servos: action });
        altErrorSum += Math.abs(ns.z - 1.0);
        maxRoll  = Math.max(maxRoll,  Math.abs(ns.phi));
        maxPitch = Math.max(maxPitch, Math.abs(ns.theta));

        // Ground crash: low altitude + bad attitude
        if (ns.z < 0.1 && (Math.abs(ns.phi) > 0.5 || Math.abs(ns.theta) > 0.5)) {
          crashed = true;
          break;
        }
        // Attitude divergence: drone inverted or tumbling at ANY altitude (> 60° roll or pitch)
        if (Math.abs(ns.phi) > Math.PI / 3 || Math.abs(ns.theta) > Math.PI / 3) {
          crashed = true;
          break;
        }
        // Altitude runaway: uncontrolled climb beyond reasonable bounds
        if (ns.z > 500) {
          crashed = true;
          break;
        }
      }

      const finalState = phys.getState();
      const metrics = MissionLogic.calculateMetrics(
        cfg.physicsConfig, finalState, history, phys.totalEnergyConsumed, phys.totalDistance
      );

      const result: EpisodeResult = {
        id: ep, crashed,
        survivalTime: finalState.time,
        finalAlt: finalState.z,
        meanAltError: altErrorSum / Math.max(1, history.length),
        maxRoll, maxPitch,
        sec: metrics.sec, spt: metrics.spt,
        seed: epSeed,
        controller: cfg.serializedModel ? 'RL Policy' : 'Heuristic PD',
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
    const secs    = results.filter(r=>r.sec>0).map(r=>r.sec);
    const spts    = results.map(r=>r.spt);
    const mean    = (a: number[]) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
    const mAlt=mean(altErrs), mSEC=mean(secs), mSPT=mean(spts);

    return {
      numEpisodes: results.length,
      crashRate: crashed / results.length,
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
