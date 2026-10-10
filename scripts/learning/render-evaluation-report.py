"""Render README evidence and audit report from generated artifacts. No fitting or testing."""
import argparse,json,math,pathlib,statistics
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
load=lambda p:json.loads((ROOT/p).read_text())
p=load('public/learning/residual-policy.json');v=load('reports/rl-validation.json');old=load('reports/rl-legacy-reproduction.json')
rel=load('reports/reliability-v3.json');energy=load('src/learning/energy-model.json');bench=load('src/learning/measured-models.json')
f=lambda x: f'{x:.6f}'
ci=lambda a:'['+', '.join(f(x) for x in a)+']'
rows=['| Training seed | Scenario | Baseline successes | Policy successes | Baseline altitude error (m) | Policy altitude error (m) | Baseline reward | Policy reward | Gate |',
      '|---|---|---|---|---|---|---|---|---|']
for run in p['runResults']:
 for r in run['results']:
  b,a=r['baseline'],r['policy'];rows.append(f"| {run['explorationSeed']} | {'Wind' if r['wind'] else 'Calm'} | {b['successes']}/{b['episodes']} | {a['successes']}/{a['episodes']} | {f(b['meanAltitudeErrorM'])} | {f(a['meanAltitudeErrorM'])} | {f(b['meanReward'])} | {f(a['meanReward'])} | {'Pass' if run['passesSimulationGate'] else 'Fail'} |")
table='\n'.join(rows)
cis=['| Scenario | Mean policy − baseline reward | Crossed-bootstrap 95% CI | Training-run t 95% CI (fixed episode bank) |', '|---|---|---|---|']
for r in p['results']:
 d=r['comparison']['rewardDifference'];cis.append(f"| {'Wind' if r['wind'] else 'Calm'} | {f(d['estimate'])} | {ci(d['crossedBootstrap95CI'])} | {ci(d['trainingRunT95CI'])} |")
citable='\n'.join(cis)
resume=f"Implemented and evaluated a tabular Q-learning residual controller in Copter Studios across {p['trainingSeedCount']} training runs of {p['trainingEpisodes']} episodes each, using separate validation and held-out test seeds with paired confidence intervals. Retained the existing controller when every candidate failed the simulation promotion gate."
section=f'''## Reproducible ML evaluation

The current simulation-only artifact is [`public/learning/residual-policy.json`](public/learning/residual-policy.json). `physicalValidation=false`, `passesSimulationGate={str(p['passesSimulationGate']).lower()}`, and `promoted=false`. The existing controller remains active.

Training: {p['trainingSeedCount']} predeclared runs × {p['trainingEpisodes']} episodes = {p['trainingEpisodesTotal']} episodes. Settings, state bins, reward, physics, success criteria and the candidate gate are unchanged. Validation banks: {p['validationSeedRanges'][0][0]}–{p['validationSeedRanges'][0][1]} (calm), {p['validationSeedRanges'][1][0]}–{p['validationSeedRanges'][1][1]} (synthetic wind). Fresh final banks: {p['evaluationSeedRanges'][0][0]}–{p['evaluationSeedRanges'][0][1]} (calm), {p['evaluationSeedRanges'][1][0]}–{p['evaluationSeedRanges'][1][1]} (wind). No tuning or winner selection was performed. Legacy test banks were used only to reproduce and diagnose the historical run.

{table}

{citable}

There are 50 unique final IC seeds per scenario, shared across the three policies: 100 unique baseline flights and 300 policy flights. Repeated baseline records are not independent observations. Each run's calm success rate has a Wilson 95% CI of {ci(p['runResults'][0]['results'][0]['policy']['successRate95CI'])}; each wind success rate has CI {ci(p['runResults'][0]['results'][1]['policy']['successRate95CI'])}. The crossed bootstrap resamples training runs and shared episode seeds; only three training runs are available. Degenerate observed success-difference intervals do not prove equal underlying success probabilities. The historical candidate gate is applied separately to every run; no seed is selected as a winner.

### Limitations

Simulation only; `physicalValidation=false`. Synthetic sinusoidal wind is uncalibrated for this nano configuration and every final wind flight terminates at the numerical operating envelope. Conditional pre-failure altitude error cannot establish robustness. No measured gust or battery-to-depletion endurance labels exist. The policy observes only altitude error and vertical speed and changes motor collective commands; no physical-flight performance claim is supported. The Q-table at the top level is the first predeclared run for compatibility, not a selected best policy.

Reproduction commands, original and refreshed numeric-claim tables, diagnosis and a supported resume statement are in [`reports/ml-evaluation-audit.md`](reports/ml-evaluation-audit.md). The CI benchmark's mission non-success threshold is separate from the RL promotion gate.
'''
# Relative links must resolve from scripts/learning/README.md too.
learning_section=section.replace('](public/', '](../../public/').replace('](reports/', '](../../reports/')
start='<!-- BEGIN GENERATED ML EVALUATION -->';end='<!-- END GENERATED ML EVALUATION -->'
def update(path,body):
 target=ROOT/path;current=target.read_text();generated=start+'\n'+body+'\n'+end
 if start in current:
  lo=current.index(start);hi=current.index(end,lo)+len(end);expected=current[:lo]+generated+current[hi:]
 else:expected=current.rstrip()+'\n\n'+generated+'\n'
 if args.check:
  if current!=expected:raise SystemExit('Generated evidence drift: '+path)
 else:target.write_text(expected)
update('README.md',section);update('scripts/learning/README.md',learning_section)
peak=.47*(15*math.log(2)/math.log(31))**2
oldwind=[e['baseline'] for e in old['evaluations'] if e['baseline']['wind']]
vald=[e for e in v['evaluations'] if e['explorationSeed']==314159 and not e['baseline']['wind']]
def costs(mode):return [statistics.mean(e[mode]['diagnostics'][k] for e in vald) for k in ['altitudeCost','velocityCost','actionCost']]
sensitivity='\n'.join(f"| {r['dragCoefficient']} | {r['successes']}/{r['episodes']} | {r['failures']}/{r['episodes']} | {f(r['meanSteps'])} | {', '.join(r['failureReasons'])} |" for r in v['windSensitivity'])
report=f'''# Copter Studios ML evaluation integrity audit

Audited source baseline: `e2018dcf490db8245ebc3ffc3b6c118766f3a827`. This report separates historical reproduction, diagnostics, unchanged multi-seed training, validation and one fresh final-test access. No controller, physics, success criterion, reward, action set, state bins or candidate promotion gate was optimized for a pass.

## Numeric-claim audit

Complete tables: [numeric-claims-original.csv](numeric-claims-original.csv) and [numeric-claims-final.csv](numeric-claims-final.csv). Every numeric JSON leaf in `reports/*.json` is included; numeric-bearing metadata strings are classified separately. README numeric-bearing lines are grouped as complete claims, including examples, versions and protocol inputs. Values in raw episode records were generated by the commands below; aggregates/CIs were independently recomputed from those records by `verify-artifacts.ts`. Parameter values are inputs, not measured outcomes. Hashes, URLs, ordering and dates are provenance, not experimental scores. Comparisons use absolute tolerance 1e-12 plus relative tolerance 1e-10 for floating-point roundoff.

| Original claim | Source | Recomputed | Finding / correction |
|---|---|---|---|
| Calm error 0.0303 / 0.0371 m; each 50/50 successes | scripts/learning/README.md | {old['results'][0]['baseline']['meanAltitudeErrorM']:.10f} / {old['results'][0]['policy']['meanAltitudeErrorM']:.10f} m; 50/50 each | Matches historical reproduction; retained explicitly as historical |
| Wind failures 50/50 each | scripts/learning/README.md | 50/50 each, numerical operating envelope | Matches; no robustness win |
| 100 / 109 tests passed | reports/reliability-v2.json / reliability-v3.json | {rel['unitTestsPassed']} current tests | Historical counts lacked checkout provenance; refreshed by generator, old versions retained in git |
| Catalog and additional reliability metrics | reports/reliability-v2.json / reliability-v3.json | Executed benchmark output | All original numeric performance metrics reproduced within tolerance |
| 30% crash threshold | README.md | Code uses 30% mission non-success threshold | Number matches; meaning corrected |
| Node 18+ supports checkout tooling | README.md | Locked jsdom needs 20.19+, 22.13+ or 24+; plugin-react also has newer minimum | Corrected recommended runtime to 22.13+ or 24+ |
| No network needed to reproduce all training | scripts/learning/README.md | Energy script downloads CSV on a cold cache | Corrected; no API key required |
| 195 flights / 14 ancillary recordings in broader external dataset; historical HTTP 403 | scripts/learning/README.md | Cannot recompute broader-source counts or historic HTTP status from committed subset | Removed numeric assertions; retained source link |
| Neural test MAE 51.77 → 13.06 W; ridge 10.90 W | scripts/learning/README.md | {energy['initialUntrainedTest']['maeW']:.8f} → {energy['test']['maeW']:.8f}; ridge {energy['ridgeBaseline']['maeW']:.8f} | Matches; neural model still loses to ridge |
| Resume bullet “below” | User request | No original bullet was included | Cannot audit absent wording; final supported statement below |

The refreshed reliability reports record this checkout's test count and generation command. They are software regression fixtures, not physical validation. The original reports remain available at the audited source commit.

## Diagnosis before repair

The original RL artifact reproduced byte-for-byte with its historical script before edits. Historical training seeds 1–600; exploration seed 314159; legacy test ranges 100001–100050 and 101001–101050. All original metrics and Q/visit tables matched. Zero-residual equivalence and frozen-policy checks also passed on the new validation bank.

### Wind scenario

All historical wind runs fail with `Numerical operating envelope exceeded`, not merely a strict mission-tracking threshold. Baseline mean execution is {statistics.mean(e['steps'] for e in oldwind):.2f} steps = {statistics.mean(e['steps'] for e in oldwind)*.016:.5f} seconds of a 16-second mission. The legacy wind branch uses `0.47 * gust * abs(gust)` directly as force, with no aircraft frontal area or relative-airspeed calibration. At 1 m altitude, a conservative per-axis bound is {peak:.6f} N, versus weight {p['config']['mass']*9.81:.6f} N and total thrust limit {4*p['config']['maxThrustPerMotorN']:.6f} N. This is a bound, not the observed force in every episode. The baseline limits roll/pitch targets to 0.3 rad. The wind forcing is excessive for the reference nano configuration.

Conclusion: the numerical guard is functioning; this is an uncalibrated extreme stress case that saturates the success/failure comparison. As a physically meaningful wind-rejection benchmark it lacks validity. There is no evidence that Q-learning itself caused the common wind failure. Both controllers failing does not prove policy equivalence. The scored wind setting and success criterion were preserved; the following drag-coefficient ablation is diagnostic only, on validation seeds 201001–201050, with no chosen replacement:

| Diagnostic drag coefficient | Successes | Engine failures | Mean steps | Outcome |
|---|---|---|---|---|
{sensitivity}

### Calm degradation

| Component (validation run 314159, calm) | Baseline mean cost | Policy mean cost |
|---|---|---|
| Altitude error | {f(costs('baseline')[0])} | {f(costs('policy')[0])} |
| Vertical velocity | {f(costs('baseline')[1])} | {f(costs('policy')[1])} |
| Residual action | {f(costs('baseline')[2])} | {f(costs('policy')[2])} |

- **Reward:** negative altitude, vertical-speed and action costs are applied correctly. Calm loss is not just an action penalty: altitude and vertical-motion costs also increase. Wind's early-termination penalty dominates. Reward excludes horizontal tracking even though success requires it, and no terminal penalty is applied to completed-but-untracked missions.
- **State:** 81 bins observe only altitude error and vertical speed. The central error bin spans −0.03 to +0.03 m; its width is large compared with the baseline's mean error. Attitude, horizontal motion, baseline integral state, motor dynamics, wind phase and remaining horizon are hidden, so a tabular bin is not a fully Markov state. Calm/wind visits share one table. These are plausible causes, not isolated causal proof.
- **Update:** Q-learning uses alpha 0.1 and gamma 0.97 per decision, with terminal bootstrap zero. This is internally consistent with the defined undiscounted eight-step block objective; it is not per-physics-step discounting. The fixed alpha/exploration schedule and finite training do not establish convergence. The refactored runner exactly reproduces the legacy Q-table and visits.
- **Coverage/greedy action:** {sum(n==0 for row in old['visits'] for n in row)} of {len(old['visits'])*len(old['actions'])} state/action pairs are unvisited after the historical run. All-zero rows choose no residual; a partly visited row can prefer an unvisited zero-valued action over negative visited actions. Inspect visitation before claiming convergence.
- **Actions:** offsets are normalized motor commands, not forces or metres. The nonlinear command-to-thrust mapping means a shared offset can affect moments as well as collective thrust. Action 0 preserves the controller; the existence of this action does not guarantee the learned greedy policy selects it.
- **Decision interval:** the residual is held for 8 × 0.016 = 0.128 s, while the engineering controller updates every physics step. That can create oscillatory corrections near hover. The effective decision discount horizon is about 4.27 s. No off-by-eight update defect was found.
- **Success:** unchanged criterion: no engine failure, 1000 steps, and at least 119 of the final 125 steps satisfy the shared mission limits: altitude within 0.1 m, x/y within 0.25 m, and horizontal speeds within 0.5 m/s. `failed` means engine termination; `nonSuccesses` also includes tracking misses. This experiment is not the separate EpisodeRunner reliability protocol, which applies additional termination checks.

No single cause of calm degradation is proven. A future optimization study should separately ablate state resolution/observability, residual magnitude and hold interval on another newly reserved validation bank, leaving its eventual new test bank untouched. No such optimization was performed in this repair.

## Repair and final protocol

The historical script is retained as `train-residual-legacy.ts` and writes an archive rather than overwriting the current artifact. The current trainer has explicit validation/final stages, source hashes and exact commands. Three predeclared exploration/IC seed streams train the unchanged algorithm. Validation contains all negative results and diagnostic ablations. Final reads frozen validation tables, verifies source/protocol identity, accesses fresh seeds, and performs no fitting or winner selection. A representative Q-table is exported for compatibility; all three policies remain in the artifact.

Original candidate gate: no worse success/failure counts or mean reward in either scenario, and strict reward improvement in at least one scenario. It permits a tie in one scenario; “improve both” in historical prose was imprecise. This gate is applied unchanged to each run. The overall protocol requires every run to pass, so the repair cannot weaken promotion. Physical validation would still be required even if the simulation gate passed.

{section}

## Reproduction commands

Run from the repository root. The exact protocol is committed in `scripts/learning/residual-experiment.ts`. Training and final commands are also embedded in artifact provenance. Replaying the final command reproduces the same fixed test; it does not create a new independent test or authorize further tuning against it.

```sh
npm ci
python -m pip install -r scripts/learning/requirements.txt
python scripts/learning/train_measured.py
python scripts/learning/train_energy.py
node --import tsx scripts/learning/train-residual-legacy.ts
npm run train:residual -- --stage=validation
npm run train:residual -- --stage=final
node --import tsx scripts/learning/verify-artifacts.ts
node --import tsx scripts/audit-reliability.ts --date=2026-10-10
python scripts/learning/render-evaluation-report.py
python scripts/learning/audit-claims.py
npm run lint
npm run build
```

Python dependency versions are pinned. Energy training downloads and verifies the immutable CSV on a cold cache. Bench and energy artifacts reproduced in this environment; no measured models were changed. Confidence intervals are recomputed from raw final records, with a seeded 5,000-replicate crossed bootstrap and a t interval across three training-run means (df=2). Per-run success and failure intervals use Wilson binomial intervals. Only three training seeds limit precision, and conditional pre-failure error must not replace failure reporting.

Validation: {rel['unitTestsPassed']} tests passed, TypeScript check passed, production build passed. Existing canvas-stub diagnostics and bundle-size warnings do not establish ML validity. Generated docs are checked with `python scripts/learning/render-evaluation-report.py --check`. The code-only diff is [ml-evaluation-code.patch](ml-evaluation-code.patch).

## Supported resume statement

{resume}
'''
# Fix section links inside report (it lives in reports/).
report=report.replace('](public/', '](../public/').replace('](reports/ml-evaluation-audit.md)', '](ml-evaluation-audit.md)')
path=ROOT/'reports/ml-evaluation-audit.md'
if args.check:
 if path.read_text()!=report:raise SystemExit('Audit report drift')
else:path.write_text(report)
print('Generated evidence matches artifacts.' if args.check else 'Rendered README evidence and audit report.')
