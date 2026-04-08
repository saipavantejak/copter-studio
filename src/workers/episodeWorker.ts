// src/workers/episodeWorker.ts — v11
// Headless batch benchmark in a Web Worker.
//
// v11 changes:
//   • Accepts optional serializedModel in the run message.
//   • When present, reconstructs the tf.LayersModel via tf.io.fromMemory()
//     and benchmarks the real RL policy. Falls back to heuristic PD when absent.
//   • Reports controller:'RL Policy' or 'Heuristic PD' per episode.
//
// Messages IN:
//   { type:'run',   cfg: EpisodeBenchmarkConfig, transfer: [weightData ArrayBuffer] }
//   { type:'abort' }
//
// Messages OUT:
//   { type:'progress', done, total, result: EpisodeResult }
//   { type:'done',     stats: BatchStats }
//   { type:'aborted' }
//   { type:'error',    message: string }

import { PhysicsEngine } from '../PhysicsEngine';
import { RLAgent } from '../RLAgent';
import { MissionLogic } from '../MissionLogic';
import { SeededRandom } from '../SeededRandom';
import { DomainRandomizer } from '../DomainRandomizer';
import type { EpisodeBenchmarkConfig, EpisodeResult, BatchStats } from '../EpisodeRunner';

// ── Stat helpers ──────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function stdDev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (arr.length - 1));
}

// ── Worker state ──────────────────────────────────────────────────────────────

let aborted = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, cfg } = e.data as { type: string; cfg: EpisodeBenchmarkConfig };

  if (type === 'abort') { aborted = true; return; }
  if (type !== 'run')   return;

  aborted = false;

  try {
    // ── Build agent — RL Policy if serialized model present, else heuristic PD ──
    const agent = new RLAgent();
    let   controllerLabel: 'RL Policy' | 'Heuristic PD' = 'Heuristic PD';

    if (cfg.serializedModel) {
      try {
        await agent.loadFromWorkerData(cfg.serializedModel);
        controllerLabel = 'RL Policy';
        self.postMessage({ type: 'controller', label: 'RL Policy' });
      } catch (modelErr: any) {
        // Model load failed in worker — fall back silently and report
        self.postMessage({ type: 'controller', label: 'Heuristic PD (model load failed)',
          warning: modelErr?.message ?? String(modelErr) });
      }
    } else {
      self.postMessage({ type: 'controller', label: 'Heuristic PD' });
    }

    const masterRng  = new SeededRandom(cfg.masterSeed);
    const domainizer = new DomainRandomizer(cfg.domainRandConfig);
    const results: EpisodeResult[] = [];

    for (let ep = 0; ep < cfg.numEpisodes; ep++) {
      if (aborted) break;

      // Yield every 5 episodes to keep message queue drained
      if (ep % 5 === 0) await new Promise<void>(r => setTimeout(r, 0));

      const epRng     = masterRng.fork(ep);
      const epSeed    = epRng.getState();
      const domainCfg = domainizer.randomize(cfg.physicsConfig, epRng.fork(ep), epSeed);

      const phys = new PhysicsEngine();
      phys.config = { ...domainCfg.physicsConfig };
      phys.tests  = {
        ...cfg.testModules,
        windEnabled:         cfg.testModules.windEnabled         || domainCfg.windEnabled,
        payloadShiftEnabled: cfg.testModules.payloadShiftEnabled || domainCfg.payloadEnabled,
      };
      phys.sensorCfg         = domainCfg.sensorConfig;
      phys.motorTauOverride  = domainCfg.motorTau;
      phys.dragCoeffOverride = domainCfg.dragCoeff;
      phys.rng               = epRng;

      phys.reset();
      if (cfg.randomizeIC) {
        const z0     = cfg.icAltRange[0] + epRng.next() * (cfg.icAltRange[1] - cfg.icAltRange[0]);
        const phi0   = cfg.icAttRange[0] + epRng.next() * (cfg.icAttRange[1] - cfg.icAttRange[0]);
        const theta0 = cfg.icAttRange[0] + epRng.next() * (cfg.icAttRange[1] - cfg.icAttRange[0]);
        phys.setInitialConditions(z0, phi0, theta0);
      }

      const history: any[] = [];
      let crashed      = false;
      let altErrorSum  = 0;
      let maxRoll      = 0;
      let maxPitch     = 0;

      for (let step = 0; step < cfg.maxStepsPerEpisode; step++) {
        const obs    = phys.getObservation();
        const sa     = [obs.x, obs.y, obs.z, obs.x_dot, obs.y_dot, obs.z_dot,
                        obs.phi, obs.theta, obs.psi, obs.p, obs.q, obs.r];
        const action = agent.predictAction(sa, cfg.physicsConfig.droneType, cfg.testModules.missionPreset, domainCfg.physicsConfig.mass);
        const ns     = phys.step(action);

        history.push({ ...ns, servos: action });
        altErrorSum += Math.abs(ns.z - 1.0);
        maxRoll      = Math.max(maxRoll,  Math.abs(ns.phi));
        maxPitch     = Math.max(maxPitch, Math.abs(ns.theta));

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
      const metrics    = MissionLogic.calculateMetrics(
        cfg.physicsConfig, finalState, history,
        phys.totalEnergyConsumed, phys.totalDistance
      );

      const result: EpisodeResult = {
        id:           ep,
        crashed,
        survivalTime: finalState.time,
        finalAlt:     finalState.z,
        meanAltError: altErrorSum / Math.max(1, history.length),
        maxRoll,
        maxPitch,
        sec:          metrics.sec,
        spt:          metrics.spt,
        seed:         epSeed,
        controller:   controllerLabel,
        domainParams: {
          mass:        domainCfg.physicsConfig.mass,
          motorTau:    domainCfg.motorTau,
          dragCoeff:   domainCfg.dragCoeff,
          windEnabled: domainCfg.windEnabled,
        },
      };

      results.push(result);
      self.postMessage({ type: 'progress', done: ep + 1, total: cfg.numEpisodes, result });
    }

    if (aborted) { self.postMessage({ type: 'aborted' }); return; }

    // ── Aggregate ────────────────────────────────────────────────────────────
    const nCrashed = results.filter(r => r.crashed).length;
    const times    = results.map(r => r.survivalTime);
    const altErrs  = results.map(r => r.meanAltError);
    const secs     = results.filter(r => r.sec > 0).map(r => r.sec);
    const spts     = results.map(r => r.spt);
    const mAlt = avg(altErrs), mSEC = avg(secs), mSPT = avg(spts);

    const stats: BatchStats = {
      numEpisodes:      results.length,
      crashRate:        nCrashed / results.length,
      meanSurvivalTime: avg(times),
      meanAltError:     mAlt,  stdAltError: stdDev(altErrs, mAlt),
      meanSEC:          mSEC,  stdSEC:      stdDev(secs, mSEC),
      meanSPT:          mSPT,  stdSPT:      stdDev(spts, mSPT),
      bestSEC:          secs.length ? Math.min(...secs) : 0,
      worstSEC:         secs.length ? Math.max(...secs) : 0,
      masterSeed:       cfg.masterSeed,
      episodes:         results,
    };

    self.postMessage({ type: 'done', stats });

  } catch (err: any) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
