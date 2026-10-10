import { PhysicsEngine } from '../../src/PhysicsEngine';
import { VehicleController } from '../../src/VehicleController';
import { AIRCRAFT_PROFILES } from '../../src/AircraftProfiles';
import { SeededRandom } from '../../src/SeededRandom';
import { DEFAULT_MISSION, isTrackingMission } from '../../src/MissionSpec';
import { RESIDUAL_ACTIONS, STATE_COUNT, stateIndex, greedyAction, applyResidual } from '../../src/learning/ResidualPolicy';

// Predeclared protocol. No hyperparameter search or policy selection in this repair.
export const PROTOCOL = {
  trainingEpisodes: 600, stepsPerEpisode: 1000, decisionEverySteps: 8,
  alpha: .1, gammaPerDecision: .97, epsilon: [.3, .03],
  trainingRuns: [
    { explorationSeed: 314159, trainSeedRange: [1, 600] },
    { explorationSeed: 271828, trainSeedRange: [1001, 1600] },
    { explorationSeed: 161803, trainSeedRange: [2001, 2600] },
  ],
  legacyEvaluationSeedRanges: [[100001, 100050], [101001, 101050]],
  validationSeedRanges: [[200001, 200050], [201001, 201050]],
  finalTestSeedRanges: [[300001, 300050], [301001, 301050]],
  successCriterion: 'No engine failure; 1000 steps; >=119 of final 125 steps satisfy unchanged DEFAULT_MISSION tracking limits',
  promotionGate: 'For every scenario: policy successes >= baseline, failures <= baseline, mean reward >= baseline; strictly greater mean reward in at least one scenario. Physical validation required for deployment.',
  selection: 'No tuning; retain all three predeclared runs. The first Q-table is a compatibility representative, not a selected winner.',
};
export const config = { ...AIRCRAFT_PROFILES[0].config };
export const makeTable = () => Array.from({ length: STATE_COUNT }, () => RESIDUAL_ACTIONS.map(() => 0));
export type Table = number[][];

export function episode(seed: number, wind: boolean, mode: 'train' | 'baseline' | 'policy', q: Table,
  exploration = new SeededRandom(314159), epsilon = 0, dragCoefficient = .47, forceZero = false) {
  const physics = new PhysicsEngine(); physics.config = { ...config }; physics.rng = new SeededRandom(seed);
  physics.dragCoeffOverride = dragCoefficient;
  physics.tests = { windEnabled: wind, payloadShiftEnabled: false, batterySagEnabled: false, motorOutEnabled: false, missionPreset: 'none' };
  physics.reset(); const rng = new SeededRandom(seed ^ 0x271828);
  physics.setInitialConditions(rng.uniform(.5, 1.5), rng.uniform(-.2, .2), rng.uniform(-.2, .2));
  const controller = new VehicleController();
  let s = physics.getState(), sumError = 0, rewardTotal = 0, steps = 0, tracking = 0;
  let altitudeCost = 0, velocityCost = 0, actionCost = 0, failureCost = 0;
  let maxHorizontalSpeed = 0, maxAbsAngularRate = 0, maxTilt = 0, saturatedSteps = 0;
  const actionCounts = RESIDUAL_ACTIONS.map(() => 0);
  const updates: Array<[number, number]> = [];
  while (steps < PROTOCOL.stepsPerEpisode && !s.failureReason) {
    const state = stateIndex(s.z, s.z_dot);
    const a = mode === 'baseline' || forceZero ? 0 : mode === 'train' && exploration.next() < epsilon
      ? Math.floor(exploration.next() * RESIDUAL_ACTIONS.length) : greedyAction(q[state]);
    actionCounts[a]++;
    let reward = 0;
    for (let j = 0; j < PROTOCOL.decisionEverySteps && steps < PROTOCOL.stepsPerEpisode && !s.failureReason; j++) {
      s = physics.step(applyResidual(controller.action(s, config), a)); steps++;
      const error = Math.abs(s.z - 1); sumError += error;
      altitudeCost += error; velocityCost += .05 * Math.abs(s.z_dot); actionCost += .1 * Math.abs(RESIDUAL_ACTIONS[a]);
      // Keep the historical undiscounted block reward and decision-level gamma.
      reward -= error + .05 * Math.abs(s.z_dot) + .1 * Math.abs(RESIDUAL_ACTIONS[a]);
      if (steps > PROTOCOL.stepsPerEpisode - 125 && isTrackingMission(s, DEFAULT_MISSION)) tracking++;
      maxHorizontalSpeed = Math.max(maxHorizontalSpeed, Math.hypot(s.x_dot, s.y_dot));
      maxAbsAngularRate = Math.max(maxAbsAngularRate, Math.abs(s.p), Math.abs(s.q), Math.abs(s.r));
      maxTilt = Math.max(maxTilt, Math.abs(s.phi), Math.abs(s.theta));
      if (physics.lastSaturated) saturatedSteps++;
    }
    if (s.failureReason) { const penalty = 100 + PROTOCOL.stepsPerEpisode - steps; reward -= penalty; failureCost += penalty; }
    rewardTotal += reward;
    if (mode === 'train') {
      const next = stateIndex(s.z, s.z_dot);
      const terminal = !!s.failureReason || steps === PROTOCOL.stepsPerEpisode;
      q[state][a] += PROTOCOL.alpha * (reward + (terminal ? 0 : PROTOCOL.gammaPerDecision * Math.max(...q[next])) - q[state][a]);
      updates.push([state, a]);
    }
  }
  return {
    seed, wind, successful: !s.failureReason && steps === PROTOCOL.stepsPerEpisode && tracking >= 119,
    failed: !!s.failureReason, failureReason: s.failureReason ?? null, steps,
    meanAltitudeErrorM: sumError / steps, reward: rewardTotal, energyJ: s.energyConsumed,
    outcome: s.failureReason ?? (tracking >= 119 ? 'Successful mission' : 'Tracking criterion not met'),
    diagnostics: { trackingSteps: tracking, altitudeCost, velocityCost, actionCost, failureCost,
      maxHorizontalSpeed, maxAbsAngularRate, maxTilt, saturatedSteps, actionCounts },
    updates,
  };
}
export type Episode = Omit<ReturnType<typeof episode>, 'updates'>;
export function recordedEpisode(...args: Parameters<typeof episode>): Episode {
  const { updates: _updates, ...result } = episode(...args); return result;
}
export function train(explorationSeed: number, startSeed: number) {
  const q = makeTable(), visits = makeTable(), exploration = new SeededRandom(explorationSeed);
  for (let i = 0; i < PROTOCOL.trainingEpisodes; i++) {
    const e = episode(startSeed + i, i % 2 === 1, 'train', q, exploration, .3 - .27 * i / (PROTOCOL.trainingEpisodes - 1));
    for (const [s, a] of e.updates) visits[s][a]++;
  }
  return { explorationSeed, trainSeedRange: [startSeed, startSeed + PROTOCOL.trainingEpisodes - 1], q, visits };
}
export const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
export function wilson(successes: number, n: number): [number, number] {
  const z = 1.959963984540054, p = successes / n, den = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / den;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export function aggregate(rows: Episode[]) {
  const successes = rows.filter(x => x.successful).length, failures = rows.filter(x => x.failed).length;
  const failureReasons: Record<string, number> = {};
  for (const row of rows) failureReasons[row.outcome] = (failureReasons[row.outcome] ?? 0) + 1;
  return { episodes: rows.length, successes, failures, nonSuccesses: rows.length - successes,
    meanAltitudeErrorM: mean(rows.map(x => x.meanAltitudeErrorM)), meanReward: mean(rows.map(x => x.reward)),
    meanSteps: mean(rows.map(x => x.steps)), successRate95CI: wilson(successes, rows.length),
    failureRate95CI: wilson(failures, rows.length), failureReasons };
}
export function gate(results: Array<{ baseline: ReturnType<typeof aggregate>; policy: ReturnType<typeof aggregate> }>) {
  return results.every(r => r.policy.successes >= r.baseline.successes && r.policy.failures <= r.baseline.failures && r.policy.meanReward >= r.baseline.meanReward)
    && results.some(r => r.policy.meanReward > r.baseline.meanReward);
}
export type Pair = { explorationSeed: number; baseline: Episode; policy: Episode };
export function evaluate(runs: ReturnType<typeof train>[], ranges: number[][]): Pair[] {
  const frozen = JSON.stringify(runs), pairs: Pair[] = [];
  for (const run of runs) for (const [wi, range] of ranges.entries()) for (let seed = range[0]; seed <= range[1]; seed++) {
    pairs.push({ explorationSeed: run.explorationSeed,
      baseline: recordedEpisode(seed, wi === 1, 'baseline', run.q), policy: recordedEpisode(seed, wi === 1, 'policy', run.q) });
  }
  if (JSON.stringify(runs) !== frozen) throw new Error('Evaluation mutated policy or visits');
  return pairs;
}

// Crossed bootstrap: resample training runs and shared episode seeds independently.
// Baseline repeats are NOT independent observations. Report per-run Wilson CIs separately.
export function comparisonCI(pairs: Pair[], wind: boolean, key: 'reward' | 'meanAltitudeErrorM' | 'successful', bootstrapSeed: number) {
  const rows = pairs.filter(x => x.baseline.wind === wind);
  const runIds = [...new Set(rows.map(x => x.explorationSeed))], seeds = [...new Set(rows.map(x => x.baseline.seed))];
  const matrix = runIds.map(id => seeds.map(seed => {
    const pair = rows.find(x => x.explorationSeed === id && x.baseline.seed === seed)!;
    return Number(pair.policy[key]) - Number(pair.baseline[key]);
  }));
  const rng = new SeededRandom(bootstrapSeed), samples: number[] = [];
  for (let b = 0; b < 5000; b++) {
    const ri = runIds.map(() => Math.floor(rng.next() * runIds.length));
    const si = seeds.map(() => Math.floor(rng.next() * seeds.length));
    samples.push(mean(ri.flatMap(r => si.map(s => matrix[r][s]))));
  }
  samples.sort((a, b) => a - b);
  const runMeans = matrix.map(mean), estimate = mean(runMeans);
  const sd = Math.sqrt(runMeans.reduce((s, x) => s + (x - estimate) ** 2, 0) / (runMeans.length - 1));
  // df=2 only: training-run sensitivity interval conditional on this shared test bank.
  const radius = 4.302652729911275 * sd / Math.sqrt(runMeans.length);
  return { estimate, crossedBootstrap95CI: [samples[124], samples[4874]],
    trainingRunT95CI: [estimate - radius, estimate + radius], trainingRunMeans: runMeans };
}
