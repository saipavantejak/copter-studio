import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PROTOCOL, config, train, evaluate, aggregate, gate, comparisonCI, recordedEpisode, makeTable } from './residual-experiment';
import { RESIDUAL_ACTIONS } from '../../src/learning/ResidualPolicy';

const args = process.argv.slice(2);
const stage = args.find(x => x.startsWith('--stage='))?.split('=')[1];
if (!['validation', 'final'].includes(stage ?? '')) throw new Error('Specify --stage=validation or --stage=final. Historical reproduction: node --import tsx scripts/learning/train-residual-legacy.ts');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const sources = ['scripts/learning/residual-experiment.ts', 'scripts/learning/train-residual.ts', 'package-lock.json',
  ...readdirSync('src', { recursive: true }).map(String).filter(p => p.endsWith('.ts') && !p.includes('__tests__')).map(p => `src/${p}`)].sort();
const sourceHashes = Object.fromEntries(sources.map(path => [path, sha(readFileSync(path))]));
const provenance = { command: `npm run train:residual -- --stage=${stage}`, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes, node: process.version, protocolSha256: sha(JSON.stringify(PROTOCOL)) };
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

if (stage === 'validation') {
  const runs = PROTOCOL.trainingRuns.map(r => train(r.explorationSeed, r.trainSeedRange[0]));
  const pairs = evaluate(runs, PROTOCOL.validationSeedRanges);
  const results = runs.map(run => ({ explorationSeed: run.explorationSeed, results: [false, true].map(wind => {
    const eps = pairs.filter(p => p.explorationSeed === run.explorationSeed && p.baseline.wind === wind);
    return { wind, baseline: aggregate(eps.map(p => p.baseline)), policy: aggregate(eps.map(p => p.policy)) };
  }) }));
  // Zero-residual equivalence under exactly matched ICs on validation seeds only.
  for (const wind of [false, true]) for (const seed of PROTOCOL.validationSeedRanges[Number(wind)]) {
    const a = recordedEpisode(seed, wind, 'baseline', makeTable());
    const b = recordedEpisode(seed, wind, 'policy', makeTable(), undefined, 0, .47, true);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('Zero residual differs from baseline');
  }
  // Diagnostic ablation only; no modified drag setting is selected or promoted.
  const windSensitivity = [0, .0001, .001, .01, .47].map(dragCoefficient => {
    const eps = Array.from({ length: 50 }, (_, i) => recordedEpisode(201001 + i, true, 'baseline', makeTable(), undefined, 0, dragCoefficient));
    return { dragCoefficient, ...aggregate(eps) };
  });
  write('reports/rl-validation.json', { schemaVersion: 2, physicalValidation: false, provenance, protocol: PROTOCOL,
    runs, results, evaluations: pairs, windSensitivity, zeroResidualEquivalencePassed: true,
    decision: 'No hyperparameter changes or winner selection; all predeclared training runs proceed to final test.' });
  console.log(JSON.stringify({ stage, results, windSensitivity }, null, 2));
} else {
  const validationBytes = readFileSync('reports/rl-validation.json');
  const validation = JSON.parse(validationBytes.toString());
  if (validation.provenance.protocolSha256 !== provenance.protocolSha256 || JSON.stringify(validation.provenance.sourceHashes) !== JSON.stringify(sourceHashes)) throw new Error('Protocol/source changed after validation: rerun validation before final testing');
  const runs = validation.runs as ReturnType<typeof train>[];
  // Fresh bank first accessed here. No fitting, tuning or selection after this point.
  const evaluations = evaluate(runs, PROTOCOL.finalTestSeedRanges);
  const runResults = runs.map(run => {
    const results = [false, true].map(wind => {
      const eps = evaluations.filter(p => p.explorationSeed === run.explorationSeed && p.baseline.wind === wind);
      return { wind, baseline: aggregate(eps.map(p => p.baseline)), policy: aggregate(eps.map(p => p.policy)) };
    });
    return { explorationSeed: run.explorationSeed, results, passesSimulationGate: gate(results) };
  });
  // Pool means across policies; baseline is stored once per shared seed, never inflated.
  const results = [false, true].map(wind => {
    const eps = evaluations.filter(p => p.baseline.wind === wind);
    const baseline = aggregate(eps.filter(p => p.explorationSeed === runs[0].explorationSeed).map(p => p.baseline));
    const all = aggregate(eps.map(p => p.policy));
    const policy = { ...all, successRate95CI: undefined, failureRate95CI: undefined,
      intervalNote: '150 policy episodes share 50 IC seeds and three trained policies; use per-run Wilson and crossed-bootstrap comparisons, not an IID pooled binomial interval.' };
    // Compare average per-run counts on the unchanged historical gate scale.
    const gateBaseline = baseline, gatePolicy = { ...all, successes: all.successes / runs.length, failures: all.failures / runs.length };
    return { wind, baseline, policy, comparison: {
      rewardDifference: comparisonCI(evaluations, wind, 'reward', 424242 + Number(wind)),
      altitudeErrorDifferenceM: comparisonCI(evaluations, wind, 'meanAltitudeErrorM', 424244 + Number(wind)),
      successRateDifference: comparisonCI(evaluations, wind, 'successful', 424246 + Number(wind)),
    }, passesScenarioChecks: gatePolicy.successes >= gateBaseline.successes && gatePolicy.failures <= gateBaseline.failures && gatePolicy.meanReward >= gateBaseline.meanReward };
  });
  // Preserve the original gate for every candidate separately; never pick the best seed.
  const improves = runResults.every(r => r.passesSimulationGate);
  const artifact = { schemaVersion: 2, method: 'Tabular Q-learning residual collective controller',
    scope: 'Crazyflie 2.1 reference configuration in Copter PhysicsEngine only', physicalValidation: false,
    trainingEpisodes: PROTOCOL.trainingEpisodes, trainingEpisodesTotal: PROTOCOL.trainingEpisodes * runs.length,
    trainSeedRange: runs[0].trainSeedRange, trainingSeedCount: runs.length,
    evaluationSeedRanges: PROTOCOL.finalTestSeedRanges, validationSeedRanges: PROTOCOL.validationSeedRanges,
    stepsPerEpisode: PROTOCOL.stepsPerEpisode, decisionEverySteps: PROTOCOL.decisionEverySteps,
    alpha: PROTOCOL.alpha, gamma: PROTOCOL.gammaPerDecision, epsilon: PROTOCOL.epsilon,
    config, actions: RESIDUAL_ACTIONS, q: runs[0].q, visits: runs[0].visits, runs,
    qTableRole: PROTOCOL.selection, protocol: PROTOCOL,
    provenance: { ...provenance, validationArtifactSha256: sha(validationBytes), trainingCommand: 'npm run train:residual -- --stage=validation' },
    results, runResults, passesSimulationGate: improves, promoted: false,
    promotionReason: improves ? 'Independent physical testing still required' : 'Did not improve both held-out scenarios across all predeclared training runs; existing controller retained',
    limitations: ['Simulation only; physicalValidation=false.', 'Synthetic sinusoidal wind is uncalibrated and overwhelms this nano configuration.',
      'No measured endurance labels.', 'Altitude error is conditional on executed steps; inspect termination reasons and penalized reward.',
      'Only three training runs; confidence intervals are approximate and cannot establish universal improvement.',
      'Shared IC seeds across policies are paired, not independent repeated baseline trials.',
      'Crossed-bootstrap CIs describe this protocol; training-run t intervals condition on the fixed episode bank.',
      'Existing legacy tests were inspected for diagnosis, never used for tuning this protocol.', 'No hyperparameters, physics, success criterion or candidate gate changed.'], evaluations };
  write('public/learning/residual-policy.json', artifact);
  const { q: _q, visits: _visits, runs: _runs, evaluations: _evals, ...summary } = artifact;
  write('src/learning/rl-summary.json', summary);
  console.log(JSON.stringify({ stage, results, runResults, passesSimulationGate: improves, promoted: false }, null, 2));
}
