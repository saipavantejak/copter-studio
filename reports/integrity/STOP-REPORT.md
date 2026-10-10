# Integrity audit: stopped at claim reconciliation

The first task failed its audit integrity check. No follow-up training, validation, final test, PPO run, physics modification, analytics integration or deployment verification was started. No GitHub push was performed.

## Recomputed existing final study

These are recorded-data checks, not clean-worktree experiment reproductions. Confidence intervals below concern paired policy-minus-baseline reward differences; they are not intervals for the individual absolute means. Independent units: three training seeds crossed with two hundred shared episode seeds per scenario. Baseline counts are unique episodes; policy counts pool the three training runs and are not IID.

| Scenario | Baseline reward | Policy reward | Reward difference, 95% CI | Adjusted reward CI | Baseline / policy altitude error (m) | Baseline / policy successes |
|---|---:|---:|---|---|---|---|
| Calm | -27.050001 | -23.414768 | 3.635233, [2.115323, 5.068377] | [1.941497, 5.235808] | 0.025703 / 0.021802 | 200/200 / 600/600 |
| Mild synthetic wind | -29.419173 | -25.185662 | 4.233511, [2.826502, 5.540468] | [2.631572, 5.687716] | 0.028017 / 0.023495 | 200/200 / 600/600 |

Adjusted intervals have 97.5% marginal confidence under the registered two-scenario Bonferroni procedure. Only three training seeds limit bootstrap reliability. The effect is approximately four millimetres, the successful candidate bundles training budget and learning-rate changes, and mild wind provides no evidence of improved failure robustness. Simulation gate passed; physicalValidation=false and promoted=false.

## Check results

| Check | Source | Independent finding | Status |
|---|---|---|---|
| Existing study metrics and gates | reports/study/validation.json; reports/study/final.json | 1348 checks agree within tolerance | PASS |
| Resume audit gate | reports/numeric-claims-final.csv.gz | Actual gate true; audited value says all gates false | FAIL |
| Resume audit note | reports/numeric-claims-final.csv.gz | Claims improvement; note says no improvement claimed | FAIL |
| Unit tests | software-checks.json | 199 passed; 0 failed | PASS |
| TypeScript check | software-checks.json | Exit zero | PASS |
| Production build | software-checks.json | Exit zero; bundle-size warning | PASS |
| Clean-worktree bit-for-bit experiment replay | Not performed | Blocked by stop rule | NOT RUN |
| Whole-repository claim checking in CI | Not completed | Existing audit is not a reliable certificate | NOT RUN |

The exhaustive table for this verifier scope is [claim-to-source.csv](claim-to-source.csv); its machine-readable output is [independent-verifier.json](independent-verifier.json). This is not an inventory certifying every number in all repository documents. See [ERRATA](../../docs/ERRATA.md) for cause, affected outputs and the pending repair. The contradictory old inventory and all result artifacts are preserved.

## Reproduction commands

Run from the repository root:

```bash
node scripts/learning/verify-study-independent.mjs
npm test -- --reporter=json --outputFile=/tmp/copter-integrity-tests.json
npm run lint
npm run build
```

The verifier deliberately exits one while the known audit contradiction persists. It imports no production analysis code and recomputes crossed bootstrap intervals directly from the committed episode records. It does not execute controller episodes or consume a new evaluation bank. The code has not been installed as a passing CI check because the unresolved audit defect must not be hidden.

## Supported resume wording

Conducted a preregistered tabular Q-learning simulation study with paired held-out evaluation and multiple-comparison-corrected confidence intervals. The selected configuration reduced mean altitude error by 15.2% in calm conditions and 16.1% in mild synthetic wind across three training seeds; it remains unpromoted and has no physical-flight validation.

These statements refer only to the existing study, not to the unstarted follow-up or PPO comparison. The first negative study remains documented in the archived audit.

## Remaining work

Task one is incomplete: correct and regenerate the claim inventory, establish exhaustive claim checks and bit-for-bit reproduction, then recheck. Tasks two through seven were not started after the integrity failure. No preregistration for a new study was committed and no new seed bank was read. Trajectory validation also lacks the assumed time-aligned Bitcraze flight logs.
