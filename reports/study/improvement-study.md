# Preregistered residual-controller improvement study

A: the selected candidate passes the unchanged simulation gate on fresh data, with the predeclared final evidence requirement also satisfied. Physical promotion remains false.

## Pre-registration and execution order

- [Pre-registration](preregistration.md), commit `bf89608`: exact six candidates, seeds, metrics, correction, selection and stopping rule. This file was committed before any study controller execution.
- [Wind calibration justification](wind-calibration.md), commit `57fe174`: source-backed geometry/drag proxy, relative airspeed and fixed mild-gust scenario, before policy work.
- Study implementation commit `adf410d`: all candidate definitions and guards committed before baseline qualification or training.
- Qualification command/source commit: `node --import tsx scripts/learning/study/run-study.ts --stage=qualify` / `adf410dfec3db7c01b703ef658b1e71e179fc5de`.
- Validation command/source commit: `node --import tsx scripts/learning/study/run-study.ts --stage=validation` / `adf410dfec3db7c01b703ef658b1e71e179fc5de`.
- Validation-only selection was frozen and committed before final execution; final source commit: `65180add7c821d5d37550409fcb46fb1876a4dd1`. Full SHA-256 source and registration hashes are embedded in each artifact.

The required wind correction is the only physics change. Study baseline and every candidate use the same frozen model. The default interactive engine and audit-era reproduction still use the legacy path unless explicitly opted into the study wind model. Results from the old overwhelming wind scenario must not be compared numerically as though they came from the new mild physical proxy.

## Wind qualification

Registered inputs: rho=1.225 kg/m³, Cd=1.28 flat-plate proxy, frontal rectangle 0.092×0.029=0.002668 m²; force 0.5 rho Cd A |air−vehicle velocity| (air−vehicle velocity). Sources and limitations are in [wind-calibration.md](wind-calibration.md), including NASA and Bitcraze links. This supplies correct dimensional scaling and an explicit geometric assumption, not a measured Crazyflie drag fit. No wind severity was adjusted after results.

Qualification used separate baseline-only seeds 510001–510100: 100/100 successes, 0/100 engine failures, mean reward -30.931087, mean altitude error 0.029490 m. The registered threshold was >=20% success, <=20% engine failures and finite records. A 100% success rate was allowed beforehand; the benchmark discriminates continuous tracking/reward, not observed crash rates at this mild severity. Qualification accepted=True.

## Every validation candidate

Reward Δ is learned policy minus engineering baseline: positive is better. Altitude-error Δ is learned minus baseline: negative is better. All scores use the original reward function. Gate/eligibility columns evaluate both scenarios and all three runs. Pooled policy episodes share IC seeds; they are not 300 independent trials for binary CIs.

| Candidate | Scenario | Mean reward Δ vs baseline | 95% crossed CI | Bonferroni 99.5833% CI | Altitude-error Δ (m) | Successes / engine failures | All-run original gate | Eligible |
|---|---|---|---|---|---|---|---|---|
| a: Fine/nonuniform altitude bins | Calm | -5.352714 | [-23.378148, 6.183168] | [-27.123736, 7.841349] | 0.003030 | 300/300 ; 0/300 | False | False |
| a: Fine/nonuniform altitude bins | Wind | -4.880952 | [-22.801761, 7.473830] | [-26.598976, 9.210453] | 0.002474 | 300/300 ; 0/300 | False | False |
| b: Add three tilt bins | Calm | -10.359048 | [-14.012104, -7.323295] | [-15.919317, -6.285030] | 0.007702 | 300/300 ; 0/300 | False | False |
| b: Add three tilt bins | Wind | -11.457777 | [-15.912420, -7.152678] | [-17.545952, -5.824641] | 0.008448 | 300/300 ; 0/300 | False | False |
| c: Smaller residual commands | Calm | -0.121031 | [-1.554515, 0.613475] | [-2.566366, 1.067917] | -0.000165 | 300/300 ; 0/300 | False | False |
| c: Smaller residual commands | Wind | 0.686729 | [-0.084552, 1.909511] | [-0.577263, 2.784580] | -0.000976 | 300/300 ; 0/300 | False | False |
| d: Hold two physics steps | Calm | -15.009476 | [-30.646233, 1.173427] | [-36.426588, 2.242279] | 0.013365 | 300/300 ; 0/300 | False | False |
| d: Hold two physics steps | Wind | -13.546357 | [-26.798829, 1.127498] | [-32.477586, 2.316491] | 0.011912 | 300/300 ; 0/300 | False | False |
| e: Separate calm/wind Q-tables | Calm | -0.787896 | [-2.369906, 0.584637] | [-3.224876, 1.284478] | 0.000049 | 300/300 ; 0/300 | False | False |
| e: Separate calm/wind Q-tables | Wind | -16.089692 | [-23.982670, -6.092897] | [-25.970471, -3.405092] | 0.012235 | 286/300 ; 0/300 | False | False |
| f: 3000 episodes and visit-decaying alpha | Calm | 3.044150 | [1.542642, 4.557519] | [0.970602, 5.192938] | -0.003287 | 300/300 ; 0/300 | True | True |
| f: 3000 episodes and visit-decaying alpha | Wind | 4.188806 | [2.604940, 5.657222] | [1.972444, 6.165017] | -0.004476 | 300/300 ; 0/300 | True | True |

Ordinary intervals are two-sided 95% crossed percentile bootstrap CIs. Reward intervals adjusted by Bonferroni use confidence 1−0.05/(6×2)=99.5833333333%, simultaneously protecting the twelve primary comparisons. There are 50,000 predeclared resamples per metric/scenario/candidate, with recorded bootstrap seeds. Altitude, success and engine-failure CIs are descriptive and are stored in [validation.json](validation.json). Complete per-run outcomes, tables, visit counts and raw episode rows are retained; no negative candidate is dropped.

Three training streams use exploration seeds 424001/424002/424003 and IC ranges beginning 710001/720001/730001. Candidates a–e train 600 episodes each; f trains 3,000 with alpha=0.1/(1+state-action visits/100). Altitude-only, tilt, command magnitude, hold and table separation changes are isolated exactly as registered. Candidate d changes hold from 8 to 2 steps with gamma fixed at 0.97 per decision; its effective temporal discount horizon is therefore shorter, a confound within the declared hold factor. None changes the reward or success criteria.

### Descriptive unchanged-learning control

The unchanged Q-learning algorithm was also trained under the corrected physics to separate a new training environment from candidate changes. This control was not an additional candidate and was excluded from selection. It has no final-test access.

| Reference training seed | Scenario | Baseline reward | Unchanged Q-learning reward |
|---|---|---|---|
| 424001 | Calm | -26.393057 | -28.630755 |
| 424001 | Wind | -27.744555 | -30.390740 |
| 424002 | Calm | -26.393057 | -27.845415 |
| 424002 | Wind | -27.744555 | -27.923441 |
| 424003 | Calm | -26.393057 | -25.058935 |
| 424003 | Wind | -27.744555 | -24.887413 |

## Frozen selection

Selected: **f — 3000 episodes and visit-decaying alpha**. Eligible validation IDs: ['f']. Diagnostic-only selection=False. The registered score is the minimum mean reward difference across scenarios; selected score 3.044150. Eligibility additionally required every training run's unchanged gate and corrected lower confidence bounds >=0 in both scenarios with strict positivity in one. With no eligible candidate, the same score identifies a diagnostic finalist; it is not a validated winner. Tie-breaking retains registered order. No training seed was picked as a winner.

[selection.json](selection.json) records the validation hash and was committed before final testing. [final-attempt.json](final-attempt.json) is written before accessing the first final seed and blocks subsequent study stages/final runs. No final-test data were used to fit, tune or select.

## Single final test

Final IC banks: 600001–600200 calm, 601001–601200 mild wind. All three selected policies are evaluated; baseline uses 200 unique seeds per scenario. There are 1,200 policy flights and 400 unique baseline trajectories, with paired reuse across training runs. Final primary reward comparisons use ordinary 95% intervals and Bonferroni-adjusted 97.5% intervals across the two scenarios.

| Scenario | Baseline reward | Policy reward | Reward Δ | 95% crossed CI | Two-scenario 97.5% CI | Baseline / policy altitude error (m) | Baseline / policy successes | Engine failures |
|---|---|---|---|---|---|---|---|---|
| Calm | -27.050001 | -23.414768 | 3.635233 | [2.115323, 5.068377] | [1.941497, 5.235808] | 0.025703 / 0.021802 | 200/200 / 600/600 | 0/200 / 0/600 |
| Wind | -29.419173 | -25.185662 | 4.233511 | [2.826502, 5.540468] | [2.631572, 5.687716] | 0.028017 / 0.023495 | 200/200 / 600/600 | 0/200 / 0/600 |

| Training exploration seed | Scenario | Baseline reward | Policy reward | Altitude error baseline / policy (m) | Successes baseline / policy | Original two-scenario gate |
|---|---|---|---|---|---|---|
| 424001 | Calm | -27.050001 | -23.208325 | 0.025703 / 0.021639 | 200/200 / 200/200 | True |
| 424001 | Wind | -29.419173 | -24.979152 | 0.028017 / 0.023333 | 200/200 / 200/200 | True |
| 424002 | Calm | -27.050001 | -22.052715 | 0.025703 / 0.020483 | 200/200 / 200/200 | True |
| 424002 | Wind | -29.419173 | -23.975157 | 0.028017 / 0.022322 | 200/200 / 200/200 | True |
| 424003 | Calm | -27.050001 | -24.983264 | 0.025703 / 0.023285 | 200/200 / 200/200 | True |
| 424003 | Wind | -29.419173 | -26.602677 | 0.028017 / 0.024831 | 200/200 / 200/200 | True |

The unchanged gate requires no worse success/failure counts or mean reward in both scenarios and strict reward improvement in at least one. It is applied separately to every trained policy; all three must pass. The additional predeclared confidence requirement makes a legitimate conclusion stricter, never weaker. Physical promotion remains false regardless of simulation scores. Final original-gate pass=True; final statistical-support check=True.

A: the selected candidate passes the unchanged simulation gate on fresh data, with the predeclared final evidence requirement also satisfied. Physical promotion remains false.

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
npm ci
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
npm run build
```

The reporting helpers are restored from the completed-study branch as shown; they only inspect recorded data and do not alter experiment source. Raw artifact generation commands are also embedded in provenance. `residual-policy.json` and `rl-summary.json` were generated only by the committed final-stage script. No result JSON was hand-edited. After final testing, presentation text was corrected to distinguish a passed simulation gate from missing physical validation, and an old test assumption that test seeds must be numerically larger than training seeds was corrected to check disjointness. These changes do not affect experimental code or data; execution-source hashes are verified against the recorded execution commits, rather than later presentation-only revisions.

## Verification and numeric-claim inventory

The current checkout passes 211 tests, TypeScript checking and the production build. `verify-artifacts.ts` reconstructs all six validation summaries/CIs, selection and final comparisons from recorded data, and verifies source hashes against their execution commits without simulating another episode. The complete refreshed inventory is [numeric-claims-final.csv.gz](../numeric-claims-final.csv.gz); `audit-claims.py` also writes the uncompressed CSV locally. The source diff is [improvement-code.patch](improvement-code.patch).

## Supported resume statement

Executed a preregistered six-candidate tabular Q-learning study with three training seeds per candidate and multiple-comparison-corrected paired evaluation. A 3,000-episode candidate with a decaying learning rate passed the unchanged held-out simulation gate, reducing mean altitude error by 15.2% in calm and 16.1% in mild synthetic wind; physical-flight validation was not performed.
