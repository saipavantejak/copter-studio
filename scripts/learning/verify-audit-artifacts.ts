/** Recompute summaries/CIs from raw episode records; no new final-test simulation. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { aggregate, comparisonCI, gate, type Pair } from './residual-experiment';
const p = JSON.parse(readFileSync('public/learning/residual-policy.json', 'utf8'));
const summary = JSON.parse(readFileSync('src/learning/rl-summary.json', 'utf8'));
const { q, visits, runs, evaluations, ...expectedSummary } = p;
if (!isDeepStrictEqual(expectedSummary, summary)) throw new Error('Summary differs from policy artifact');
const pairs = evaluations as Pair[];
for (const run of p.runResults) {
  for (const r of run.results) for (const mode of ['baseline', 'policy'] as const) {
    const rows = pairs.filter(e => e.explorationSeed === run.explorationSeed && e.baseline.wind === r.wind).map(e => e[mode]);
    if (!isDeepStrictEqual(aggregate(rows), r[mode])) throw new Error('Per-run aggregate mismatch');
  }
  if (gate(run.results) !== run.passesSimulationGate) throw new Error('Gate mismatch');
}
for (const r of p.results) {
  const rows = pairs.filter(e => e.baseline.wind === r.wind);
  const b = aggregate(rows.filter(e => e.explorationSeed === p.runs[0].explorationSeed).map(e => e.baseline));
  if (!isDeepStrictEqual(b, r.baseline)) throw new Error('Repeated baseline was pooled incorrectly');
  const a = aggregate(rows.map(e => e.policy));
  for (const k of ['episodes', 'successes', 'failures', 'nonSuccesses', 'meanAltitudeErrorM', 'meanReward', 'meanSteps', 'failureReasons'] as const)
    if (!isDeepStrictEqual(a[k], r.policy[k])) throw new Error(`Pooled policy mismatch: ${k}`);
  for (const [name, key, seed] of [['rewardDifference', 'reward', 424242], ['altitudeErrorDifferenceM', 'meanAltitudeErrorM', 424244], ['successRateDifference', 'successful', 424246]] as const)
    if (!isDeepStrictEqual(comparisonCI(pairs, r.wind, key, seed + Number(r.wind)), r.comparison[name])) throw new Error('CI mismatch');
}
for (const e of pairs) for (const mode of ['baseline', 'policy'] as const) {
  const ep = e[mode], d = ep.diagnostics;
  if (Math.abs(ep.reward + d.altitudeCost + d.velocityCost + d.actionCost + d.failureCost) > 1e-8) throw new Error('Reward accounting mismatch');
}
if (p.passesSimulationGate !== p.runResults.every((r:{passesSimulationGate:boolean}) => r.passesSimulationGate) || p.promoted || p.physicalValidation) throw new Error('Invalid promotion claim');
console.log('Verified all per-run/pool summaries, paired confidence intervals, reward accounting, artifact parity and unchanged gates; no new test episodes run.');
