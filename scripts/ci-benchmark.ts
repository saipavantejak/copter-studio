#!/usr/bin/env tsx
/**
 * ci-benchmark.ts — Headless CI/CD benchmark runner
 *
 * Usage:
 *   npx tsx scripts/ci-benchmark.ts [--episodes=50] [--seed=42] [--threshold=0.5]
 *
 * Exits with code 1 if crash rate exceeds threshold (default 50%).
 * Outputs JSON results to stdout for CI pipeline consumption.
 * Add to package.json scripts: "ci:benchmark": "tsx scripts/ci-benchmark.ts"
 */

import { PhysicsEngine } from '../src/PhysicsEngine';
import { RLAgent } from '../src/RLAgent';
import { EpisodeRunner, EpisodeBenchmarkConfig } from '../src/EpisodeRunner';
import { DEFAULT_DOMAIN_RAND } from '../src/DomainRandomizer';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);

const numEpisodes = parseInt(args.episodes ?? '50');
const masterSeed  = parseInt(args.seed ?? '42');
const threshold   = parseFloat(args.threshold ?? '0.5');

async function main() {
  console.error(`[CI Benchmark] ${numEpisodes} episodes, seed=${masterSeed}, threshold=${threshold}`);

  const agent  = new RLAgent();
  const runner = new EpisodeRunner();

  const cfg: EpisodeBenchmarkConfig = {
    numEpisodes,
    maxStepsPerEpisode: 1000,
    randomizeIC: true,
    icAltRange: [0.5, 2.0],
    icAttRange: [-0.15, 0.15],
    physicsConfig: { droneType: 'bicopter', mass: 5.0, propDiameter: 15, batteryVoltage: 22.2, armLength: 0.5 },
    testModules: { windEnabled: false, payloadShiftEnabled: false, batterySagEnabled: false, motorOutEnabled: false, missionPreset: 'none' },
    masterSeed,
    domainRandConfig: { ...DEFAULT_DOMAIN_RAND, enabled: false },
  };

  const stats = await runner.run(agent, cfg);

  const result = {
    timestamp: new Date().toISOString(),
    version: 'v12-pro',
    numEpisodes: stats.numEpisodes,
    crashRate: stats.crashRate,
    successRate: stats.successRate,
    totalEnergyJ: stats.totalEnergyJ,
    efficiencySampleCount: stats.efficiencySampleCount,
    meanSurvivalTime: stats.meanSurvivalTime,
    meanAltError: stats.meanAltError,
    meanSEC: stats.meanSEC,
    masterSeed,
    threshold,
    passed: (stats.successRate ?? 0) >= 1 - threshold,
  };

  agent.dispose();
  // Output JSON to stdout for CI parsing
  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    console.error(`[CI FAIL] Mission failure rate ${((1-(stats.successRate ?? 0)) * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(0)}%`);
    process.exit(1);
  }

  console.error(`[CI PASS] Mission failure rate ${((1-(stats.successRate ?? 0)) * 100).toFixed(1)}% within threshold`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(2); });
