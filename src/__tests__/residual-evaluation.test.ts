import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROTOCOL, train, recordedEpisode, makeTable, aggregate, gate, comparisonCI } from '../../scripts/learning/residual-experiment';

describe('Residual evaluation integrity', () => {
  it('reproduces the historical Q-table and visit counts with the instrumented runner', () => {
    const legacy = JSON.parse(readFileSync('reports/rl-legacy-reproduction.json', 'utf8'));
    const run = train(314159, 1);
    expect(run.q).toEqual(legacy.q); expect(run.visits).toEqual(legacy.visits);
    for (const row of legacy.evaluations.slice(0, 3)) for (const mode of ['baseline', 'policy'] as const) {
      const original = row[mode], actual = recordedEpisode(original.seed, original.wind, mode, run.q);
      for (const key of Object.keys(original) as (keyof typeof actual)[]) expect(actual[key]).toEqual(original[key]);
    }
  }, 60000);
  it('keeps every validation/test seed out of every training range and the legacy test banks', () => {
    const banks = [...PROTOCOL.validationSeedRanges, ...PROTOCOL.finalTestSeedRanges];
    const other = [...PROTOCOL.trainingRuns.map(r => r.trainSeedRange), ...PROTOCOL.legacyEvaluationSeedRanges];
    for (const [lo, hi] of banks) for (const [a, b] of other) expect(hi < a || lo > b).toBe(true);
    for (const [i, [lo, hi]] of banks.entries()) for (const [a, b] of banks.slice(i + 1)) expect(hi < a || lo > b).toBe(true);
  });
  it('zero residual matches baseline and evaluation cannot update Q-values', () => {
    const q = makeTable(), before = JSON.stringify(q);
    for (const wind of [false, true]) {
      const seed = PROTOCOL.validationSeedRanges[Number(wind)][0];
      expect(recordedEpisode(seed, wind, 'policy', q)).toEqual(recordedEpisode(seed, wind, 'baseline', q));
    }
    expect(JSON.stringify(q)).toBe(before);
  });
  it('accounts for every reward cost and distinguishes mission non-success from engine failure', () => {
    for (const drag of [.01, .47]) {
      const e = recordedEpisode(201001, true, 'baseline', makeTable(), undefined, 0, drag);
      const d = e.diagnostics;
      expect(e.reward).toBeCloseTo(-(d.altitudeCost + d.velocityCost + d.actionCost + d.failureCost), 9);
      expect(e.successful).toBe(false);
      expect(e.failed).toBe(drag === .47);
      expect(aggregate([e]).nonSuccesses).toBe(1);
    }
  });
  it('preserves the gate: ties do not pass and one worse scenario blocks promotion', () => {
    const b = aggregate([recordedEpisode(200001, false, 'baseline', makeTable())]);
    expect(gate([{ baseline: b, policy: { ...b } }])).toBe(false);
    expect(gate([{ baseline: b, policy: { ...b, meanReward: b.meanReward + 1 } }])).toBe(true);
    expect(gate([{ baseline: b, policy: { ...b, meanReward: b.meanReward + 1 } },
      { baseline: b, policy: { ...b, successes: 0 } }])).toBe(false);
  });
  it('paired confidence intervals retain deterministic differences and do not treat repeated baseline as independent', () => {
    const baseline = recordedEpisode(200001, false, 'baseline', makeTable());
    const pairs = [1, 2, 3].flatMap(explorationSeed => [200001, 200002].map(seed => ({ explorationSeed,
      baseline: { ...baseline, seed }, policy: { ...baseline, seed, reward: baseline.reward - 2 } })));
    const ci = comparisonCI(pairs, false, 'reward', 7);
    expect(ci.estimate).toBeCloseTo(-2, 10);
    expect(ci.crossedBootstrap95CI).toEqual([-2, -2]);
    expect(ci.trainingRunT95CI).toEqual([-2, -2]);
  });
});
