"""Render the pre-registered study from generated records; never runs controller episodes."""
import argparse,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
load=lambda p:json.loads((ROOT/p).read_text())
v=load('reports/study/validation.json');q=load('reports/study/qualification.json');s=load('reports/study/selection.json');p=load('reports/study/final.json');reliability=load('reports/reliability-v3.json')
f=lambda x:f'{x:.6f}'
ci=lambda x:'['+', '.join(f(t) for t in x)+']'
validation=['| Candidate | Scenario | Mean reward Δ vs baseline | 95% crossed CI | Bonferroni 99.5833% CI | Altitude-error Δ (m) | Successes / engine failures | All-run original gate | Eligible |', '|---|---|---|---|---|---|---|---|---|']
for c in v['candidates']:
 for r in c['results']:
  d=r['comparisons']['reward'];a=r['comparisons']['meanAltitudeErrorM'];policy=r['policy'];validation.append(f"| {c['candidate']['id']}: {c['candidate']['label']} | {'Wind' if r['wind'] else 'Calm'} | {f(d['estimate'])} | {ci(d['ci95'])} | {ci(d['adjustedCI'])} | {f(a['estimate'])} | {policy['successes']}/{policy['episodes']} ; {policy['failures']}/{policy['episodes']} | {c['passesOriginalGate']} | {c['eligible']} |")
validation_table='\n'.join(validation)
final=['| Scenario | Baseline reward | Policy reward | Reward Δ | 95% crossed CI | Two-scenario 97.5% CI | Baseline / policy altitude error (m) | Baseline / policy successes | Engine failures |', '|---|---|---|---|---|---|---|---|---|']
for r in p['results']:
 d=r['comparisons']['reward'];b,a=r['baseline'],r['policy'];final.append(f"| {'Wind' if r['wind'] else 'Calm'} | {f(b['meanReward'])} | {f(a['meanReward'])} | {f(d['estimate'])} | {ci(d['ci95'])} | {ci(d['adjustedCI'])} | {f(b['meanAltitudeErrorM'])} / {f(a['meanAltitudeErrorM'])} | {b['successes']}/{b['episodes']} / {a['successes']}/{a['episodes']} | {b['failures']}/{b['episodes']} / {a['failures']}/{a['episodes']} |")
final_table='\n'.join(final)
perrun=['| Training exploration seed | Scenario | Baseline reward | Policy reward | Altitude error baseline / policy (m) | Successes baseline / policy | Original two-scenario gate |', '|---|---|---|---|---|---|---|']
for run in p['runResults']:
 for r in run['results']:
  b,a=r['baseline'],r['policy'];perrun.append(f"| {run['explorationSeed']} | {'Wind' if r['wind'] else 'Calm'} | {f(b['meanReward'])} | {f(a['meanReward'])} | {f(b['meanAltitudeErrorM'])} / {f(a['meanAltitudeErrorM'])} | {b['successes']}/{b['episodes']} / {a['successes']}/{a['episodes']} | {run['passesOriginalGate']} |")
perrun_table='\n'.join(perrun)
reference=['| Reference training seed | Scenario | Baseline reward | Unchanged Q-learning reward |', '|---|---|---|---|']
for run in v['reference']['runResults']:
 for r in run['results']:reference.append(f"| {run['explorationSeed']} | {'Wind' if r['wind'] else 'Calm'} | {f(r['baseline']['meanReward'])} | {f(r['policy']['meanReward'])} |")
ref_table='\n'.join(reference)
verdict=('A: the selected candidate passes the unchanged simulation gate on fresh data, with the predeclared final evidence requirement also satisfied. Physical promotion remains false.' if p['conclusion']=='A' else 'B: nothing tested on the final bank passes the predeclared supported-promotion rule. The selected candidate did not establish a legitimate two-scenario improvement; promoted=false and the existing controller is retained.')
if p['conclusion']=='B' and not p['passesSimulationGate']:
 verdict='B: no selected candidate passes the unchanged gate on fresh final data. The validation-selected finalist fails. promoted=false; the existing controller is retained. The study stopped after this single final test.'
gains=[100*(r['baseline']['meanAltitudeErrorM']-r['policy']['meanAltitudeErrorM'])/r['baseline']['meanAltitudeErrorM'] for r in p['results']]
resume=("Executed a preregistered six-candidate tabular Q-learning study with three training seeds per candidate and multiple-comparison-corrected paired evaluation. " +
 (f"A 3,000-episode candidate with a decaying learning rate passed the unchanged held-out simulation gate, reducing mean altitude error by {gains[0]:.1f}% in calm and {gains[1]:.1f}% in mild synthetic wind; physical-flight validation was not performed." if p['conclusion']=='A' else "Retained the engineering controller when the selected policy did not pass the unchanged gate on fresh calm and mild synthetic-wind simulations."))
commands='''npm ci
# All experiment inputs and source must be committed before execution.
node --import tsx scripts/learning/study/run-study.ts --stage=qualify
node --import tsx scripts/learning/study/run-study.ts --stage=validation
node --import tsx scripts/learning/study/run-study.ts --stage=select
git add reports/study/qualification.json reports/study/validation.json reports/study/selection.json
git commit -m "Freeze validation-only candidate selection before final study test"
node --import tsx scripts/learning/study/run-study.ts --stage=final
node --import tsx scripts/learning/verify-artifacts.ts
node --import tsx scripts/audit-reliability.ts --date=2026-10-10
python scripts/learning/render-study-report.py
npm run lint
npm run build'''
section=f'''## Pre-registered ML improvement study

**Conclusion {p['conclusion']}.** {verdict}

Registration was committed before experiments: `bf89608`. The physically scaled wind correction was committed separately as `57fe174`, using manufacturer dimensions, a declared flat-plate drag proxy and relative airspeed. It is not measured aerodynamic calibration. Baseline qualification was {q['result']['successes']}/{q['result']['episodes']} missions with {q['result']['failures']} engine failures, so the registered mild-wind scenario was retained without further modification.

Six one-factor candidates were evaluated, each with three training seeds. Validation used 500001–500100 (calm) and 501001–501100 (wind), with Bonferroni correction across twelve primary candidate/scenario comparisons. No consumed legacy/audit banks were used for tuning. Candidate **{s['selectedId']} ({p['candidate']['label']})** was selected by the committed validation-only rule{' as a diagnostic finalist because none was eligible' if s['diagnosticOnly'] else ''}. The final test used 600001–600200 / 601001–601200 exactly once, with no subsequent tuning.

{final_table}

Policy figures pool three trained policies sharing 200 episode seeds per scenario; repeated baseline observations are not treated as independent. The ordinary 95% and two-scenario-adjusted reward intervals use a crossed bootstrap over training seeds and episode seeds. Only three training seeds limit the accuracy of interval coverage.

Simulation only; `physicalValidation=false`, `passesSimulationGate={str(p['passesSimulationGate']).lower()}`, `promoted=false`. The success criteria, original reward and per-run promotion gate are unchanged. Physics was frozen after the required calibration commit. A shorter-hold candidate retains the same decision-level gamma, so its temporal discount horizon also changes. No severe-wind, flight robustness or endurance claim is supported.

All six validation results, per-run final outcomes, calibration sources, registered selection and reproduction commands are in [the study audit](reports/study/improvement-study.md). The audit-era results are preserved separately. The final artifact is [residual-policy.json](public/learning/residual-policy.json).
'''
report=f'''# Preregistered residual-controller improvement study

{verdict}

## Pre-registration and execution order

- [Pre-registration](preregistration.md), commit `bf89608`: exact six candidates, seeds, metrics, correction, selection and stopping rule. This file was committed before any study controller execution.
- [Wind calibration justification](wind-calibration.md), commit `57fe174`: source-backed geometry/drag proxy, relative airspeed and fixed mild-gust scenario, before policy work.
- Study implementation commit `adf410d`: all candidate definitions and guards committed before baseline qualification or training.
- Qualification command/source commit: `{q['provenance']['command']}` / `{q['provenance']['sourceCommit']}`.
- Validation command/source commit: `{v['provenance']['command']}` / `{v['provenance']['sourceCommit']}`.
- Validation-only selection was frozen and committed before final execution; final source commit: `{p['provenance']['sourceCommit']}`. Full SHA-256 source and registration hashes are embedded in each artifact.

The required wind correction is the only physics change. Study baseline and every candidate use the same frozen model. The default interactive engine and audit-era reproduction still use the legacy path unless explicitly opted into the study wind model. Results from the old overwhelming wind scenario must not be compared numerically as though they came from the new mild physical proxy.

## Wind qualification

Registered inputs: rho=1.225 kg/m³, Cd=1.28 flat-plate proxy, frontal rectangle 0.092×0.029=0.002668 m²; force 0.5 rho Cd A |air−vehicle velocity| (air−vehicle velocity). Sources and limitations are in [wind-calibration.md](wind-calibration.md), including NASA and Bitcraze links. This supplies correct dimensional scaling and an explicit geometric assumption, not a measured Crazyflie drag fit. No wind severity was adjusted after results.

Qualification used separate baseline-only seeds 510001–510100: {q['result']['successes']}/{q['result']['episodes']} successes, {q['result']['failures']}/{q['result']['episodes']} engine failures, mean reward {f(q['result']['meanReward'])}, mean altitude error {f(q['result']['meanAltitudeErrorM'])} m. The registered threshold was >=20% success, <=20% engine failures and finite records. A 100% success rate was allowed beforehand; the benchmark discriminates continuous tracking/reward, not observed crash rates at this mild severity. Qualification accepted={q['accepted']}.

## Every validation candidate

Reward Δ is learned policy minus engineering baseline: positive is better. Altitude-error Δ is learned minus baseline: negative is better. All scores use the original reward function. Gate/eligibility columns evaluate both scenarios and all three runs. Pooled policy episodes share IC seeds; they are not 300 independent trials for binary CIs.

{validation_table}

Ordinary intervals are two-sided 95% crossed percentile bootstrap CIs. Reward intervals adjusted by Bonferroni use confidence 1−0.05/(6×2)=99.5833333333%, simultaneously protecting the twelve primary comparisons. There are 50,000 predeclared resamples per metric/scenario/candidate, with recorded bootstrap seeds. Altitude, success and engine-failure CIs are descriptive and are stored in [validation.json](validation.json). Complete per-run outcomes, tables, visit counts and raw episode rows are retained; no negative candidate is dropped.

Three training streams use exploration seeds 424001/424002/424003 and IC ranges beginning 710001/720001/730001. Candidates a–e train 600 episodes each; f trains 3,000 with alpha=0.1/(1+state-action visits/100). Altitude-only, tilt, command magnitude, hold and table separation changes are isolated exactly as registered. Candidate d changes hold from 8 to 2 steps with gamma fixed at 0.97 per decision; its effective temporal discount horizon is therefore shorter, a confound within the declared hold factor. None changes the reward or success criteria.

### Descriptive unchanged-learning control

The unchanged Q-learning algorithm was also trained under the corrected physics to separate a new training environment from candidate changes. This control was not an additional candidate and was excluded from selection. It has no final-test access.

{ref_table}

## Frozen selection

Selected: **{s['selectedId']} — {p['candidate']['label']}**. Eligible validation IDs: {s['eligibleIds']}. Diagnostic-only selection={s['diagnosticOnly']}. The registered score is the minimum mean reward difference across scenarios; selected score {f(s['selectionScore'])}. Eligibility additionally required every training run's unchanged gate and corrected lower confidence bounds >=0 in both scenarios with strict positivity in one. With no eligible candidate, the same score identifies a diagnostic finalist; it is not a validated winner. Tie-breaking retains registered order. No training seed was picked as a winner.

[selection.json](selection.json) records the validation hash and was committed before final testing. [final-attempt.json](final-attempt.json) is written before accessing the first final seed and blocks subsequent study stages/final runs. No final-test data were used to fit, tune or select.

## Single final test

Final IC banks: 600001–600200 calm, 601001–601200 mild wind. All three selected policies are evaluated; baseline uses 200 unique seeds per scenario. There are 1,200 policy flights and 400 unique baseline trajectories, with paired reuse across training runs. Final primary reward comparisons use ordinary 95% intervals and Bonferroni-adjusted 97.5% intervals across the two scenarios.

{final_table}

{perrun_table}

The unchanged gate requires no worse success/failure counts or mean reward in both scenarios and strict reward improvement in at least one. It is applied separately to every trained policy; all three must pass. The additional predeclared confidence requirement makes a legitimate conclusion stricter, never weaker. Physical promotion remains false regardless of simulation scores. Final original-gate pass={p['passesSimulationGate']}; final statistical-support check={p['statisticalSupport']}.

{verdict}

## Limitations

Simulation only; physicalValidation=false. The bounding-envelope area and flat-plate Cd are proxies; unknown Reynolds-number effects, actual projected area, rotor flow and attitude-dependent drag are not measured. Wind is mild and synthetic. Only three training seeds limit bootstrap coverage reliability, especially for a candidate with unstable seed outcomes. Binary differences can have degenerate intervals when all trials succeed, which does not prove equal underlying failure probabilities. Altitude error is conditional on executed steps. No physical flight, severe wind or endurance label supports broader claims. Validation-wide intervals and final intervals are distinct; a favorable validation seed is never a final performance claim.

## Reproduction commands

Run in an isolated checkout of the committed study source. Existing result files and the final marker intentionally prevent another study evaluation in place. To independently reproduce, prepare a NEW worktree at `adf410d`, where the plan, calibration and implementation are committed but no study result/attempt files exist; then run the commands below. Use the committed selection step before final. This is an exact protocol replay, not a new opportunity to tune against consumed seeds.

```sh
git worktree add /tmp/copter-study-replay adf410d
cd /tmp/copter-study-replay
# Restore reporting helpers only; experiment source remains at the registered implementation.
git restore --source=audit/ml-evaluation-integrity -- scripts/learning/verify-artifacts.ts scripts/learning/verify-audit-artifacts.ts scripts/learning/verify-study.ts scripts/learning/render-study-report.py src/__tests__/learning.test.ts
git add scripts/learning/verify-artifacts.ts scripts/learning/verify-audit-artifacts.ts scripts/learning/verify-study.ts scripts/learning/render-study-report.py src/__tests__/learning.test.ts
git commit -m "Restore reporting and seed-disjointness checks without changing registered experiment"
{commands}
```

The reporting helpers are restored from the completed-study branch as shown; they only inspect recorded data and do not alter experiment source. Raw artifact generation commands are also embedded in provenance. `residual-policy.json` and `rl-summary.json` were generated only by the committed final-stage script. No result JSON was hand-edited. After final testing, presentation text was corrected to distinguish a passed simulation gate from missing physical validation, and an old test assumption that test seeds must be numerically larger than training seeds was corrected to check disjointness. These changes do not affect experimental code or data; execution-source hashes are verified against the recorded execution commits, rather than later presentation-only revisions.

## Verification and numeric-claim inventory

The current checkout passes {reliability['unitTestsPassed']} tests, TypeScript checking and the production build. `verify-artifacts.ts` reconstructs all six validation summaries/CIs, selection and final comparisons from recorded data, and verifies source hashes against their execution commits without simulating another episode. The complete refreshed inventory is [numeric-claims-final.csv.gz](../numeric-claims-final.csv.gz); `audit-claims.py` also writes the uncompressed CSV locally. The source diff is [improvement-code.patch](improvement-code.patch).

## Supported resume statement

{resume}
'''
start='<!-- BEGIN GENERATED ML EVALUATION -->';end='<!-- END GENERATED ML EVALUATION -->'
def save(path,value):
 target=ROOT/path
 if args.check:
  if target.read_text()!=value:raise SystemExit('Generated study evidence drift: '+path)
 else:target.write_text(value)
for path in ['README.md','scripts/learning/README.md']:
 text=(ROOT/path).read_text();body=section if path=='README.md' else section.replace('](reports/','](../../reports/').replace('](public/','](../../public/')
 lo=text.index(start);hi=text.index(end,lo)+len(end)
 save(path,text[:lo]+start+'\n'+body+'\n'+end+text[hi:])
save('reports/study/improvement-study.md',report)
save('reports/ml-evaluation-audit.md','# Current ML evaluation audit\n\n'+report.replace('](preregistration.md)','](study/preregistration.md)').replace('](wind-calibration.md)','](study/wind-calibration.md)').replace('](validation.json)','](study/validation.json)').replace('](selection.json)','](study/selection.json)').replace('](final-attempt.json)','](study/final-attempt.json)').replace('](../numeric-claims-final.csv.gz)','](numeric-claims-final.csv.gz)').replace('](improvement-code.patch)','](study/improvement-code.patch)')+'\n\nThe preceding audit-era report is archived in [study/archive/audit-era-report.md](study/archive/audit-era-report.md).\n')
print('Study documentation checked.' if args.check else 'Rendered all study outcomes and current README evidence.')
