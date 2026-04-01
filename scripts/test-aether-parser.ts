// test-aether-parser.ts — Test the local heuristic parser directly
// (Bypasses geminiClient which needs browser fetch)

// Import the local parser internals by re-implementing the call path
// Since localParse is not exported, we test via parseSimulationIntent with no Gemini

// Trick: set global fetch to fail so Gemini path always falls back to local
(globalThis as any).fetch = () => { throw new Error('No network'); };

import { parseSimulationIntent } from '../src/SimulationParser';

const tests = [
  {
    name: 'Heavy bicopter with wind + motor-out',
    input: 'Run a 7kg bicopter in heavy wind with motor-out',
    expect: { type: 'live', drone: 'bicopter', mass: 7, wind: true, motorOut: true },
  },
  {
    name: 'Benchmark with domain rand + noise',
    input: 'Benchmark 100 episodes with domain randomization and sensor noise',
    expect: { type: 'benchmark', episodes: 100, domainRand: true, noise: true },
  },
  {
    name: 'Light quadcopter with battery sag',
    input: 'Simulate a light quadcopter at 14.8V with battery sag',
    expect: { type: 'live', drone: 'quadcopter', voltage: 14.8, batterySag: true },
  },
  {
    name: 'Hex stress test with seed',
    input: 'Stress test 9kg hexacopter, all fault modules, 200 episodes seed 99',
    expect: { type: 'benchmark', drone: 'hexacopter', mass: 9, episodes: 200, seed: 99 },
  },
  {
    name: 'Long-range delivery with wind',
    input: 'fly a delivery drone long range with 22V battery and wind',
    expect: { type: 'live', mission: 'long-range', wind: true },
  },
];

(async () => {
  let passed = 0, failed = 0;

  for (const t of tests) {
    const intent = await parseSimulationIntent(t.input);
    const checks: string[] = [];

    if (t.expect.type && intent.type !== t.expect.type) checks.push(`type: got ${intent.type}, want ${t.expect.type}`);
    if (t.expect.drone && intent.config.droneType !== t.expect.drone) checks.push(`drone: got ${intent.config.droneType}, want ${t.expect.drone}`);
    if (t.expect.mass && intent.config.mass !== t.expect.mass) checks.push(`mass: got ${intent.config.mass}, want ${t.expect.mass}`);
    if (t.expect.wind !== undefined && intent.tests.windEnabled !== t.expect.wind) checks.push(`wind: got ${intent.tests.windEnabled}, want ${t.expect.wind}`);
    if (t.expect.motorOut !== undefined && intent.tests.motorOutEnabled !== t.expect.motorOut) checks.push(`motorOut: got ${intent.tests.motorOutEnabled}, want ${t.expect.motorOut}`);
    if (t.expect.episodes && intent.numEpisodes !== t.expect.episodes) checks.push(`episodes: got ${intent.numEpisodes}, want ${t.expect.episodes}`);
    if (t.expect.domainRand !== undefined && intent.domainRandEnabled !== t.expect.domainRand) checks.push(`domainRand: got ${intent.domainRandEnabled}, want ${t.expect.domainRand}`);
    if (t.expect.noise !== undefined && intent.sensorCfg.enableNoise !== t.expect.noise) checks.push(`noise: got ${intent.sensorCfg.enableNoise}, want ${t.expect.noise}`);
    if (t.expect.batterySag !== undefined && intent.tests.batterySagEnabled !== t.expect.batterySag) checks.push(`batterySag: got ${intent.tests.batterySagEnabled}, want ${t.expect.batterySag}`);
    if (t.expect.voltage !== undefined && intent.config.batteryVoltage !== t.expect.voltage) checks.push(`voltage: got ${intent.config.batteryVoltage}, want ${t.expect.voltage}`);
    if (t.expect.mission && intent.tests.missionPreset !== t.expect.mission) checks.push(`mission: got ${intent.tests.missionPreset}, want ${t.expect.mission}`);
    if (t.expect.seed && intent.masterSeed !== t.expect.seed) checks.push(`seed: got ${intent.masterSeed}, want ${t.expect.seed}`);

    if (checks.length === 0) {
      console.log(`PASS | ${t.name}`);
      console.log(`       confidence=${intent.confidence}, ambiguities=${intent.ambiguities.length}`);
      passed++;
    } else {
      console.log(`FAIL | ${t.name}`);
      for (const c of checks) console.log(`       ${c}`);
      failed++;
    }
  }

  console.log(`\n━━━ Aether Parser Results: ${passed}/${passed + failed} passed ━━━`);
  if (failed > 0) process.exit(1);
})();
