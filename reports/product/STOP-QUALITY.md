# Historical quality work stop report

Recorded at 28d224c; superseded by reports/quality/STATUS.md.

This is a scoped stop report, not a declaration that the requested quality gates pass.
No follow-up ablation or PPO training was started. No deployment or GitHub push occurred.
The existing controller remains active; promoted=false and physicalValidation=false.

## Blocking findings

The resume inventory repair passes independent checking. However,
`scripts/learning/audit-claims.py:doc_expected` still gives some non-generated
README rows MATCH using classifier literals (for example, the historical training
budget and benchmark command defaults), rather than extracting and comparing
each claim with executable inputs. A passing scoped verifier is not a certificate
for these rows. Task audit repair remains partial. No experimental metric has
been shown wrong by this finding; inventory assurance is overstated.

The first registered product observation stopped with
`FAILED_DOCUMENT_REQUEST` / `net::ERR_CONNECTION_REFUSED`.
Separately launched preview and browser commands could not share their loopback
network in this environment. Performance and accessibility scores are null;
no valid baseline, mobile results or before/after comparison exists. The raw
failure is retained, not overwritten. Product source was not repaired against
an invalid observation. The measurement protocol explicitly requires stopping
on an invalid tool/server run before drawing a conclusion.

## Evidence status

| Evidence | Artifact-derived value | Source | Status |
|---|---|---|---|
| Independent study checks | 1361 passed; 0 failed | reports/integrity/independent-verifier.json | PASS within stated scope |
| Independent trajectory checks | 820 passed; 0 failed | reports/physics/independent-verifier.json | PASS recomputation; accuracy not validated |
| Frozen final evaluation replay | 2 clean-worktree runs, identical output | reports/integrity/final-determinism.json | PASS; evaluation only, not all training |
| Recorded software regression | 211 tests passed | reports/reliability-v3.json | PASS at recorded source commit |
| Synthetic-key production build | 19 files scanned, no canary leaks | reports/security/client-bundle.json | PASS at recorded source commit |
| Product performance and accessibility | Both scores null | reports/product/before/lighthouse-desktop-1.json | BLOCKED, invalid observation |
| All-document numeric certification | Not established | scripts/learning/audit-claims.py | FAIL, residual classifier templates |
| Strict TypeScript and coverage thresholds | Not implemented in this work | tsconfig.json; package.json | PENDING |
| README/demo/interview/analytics task | Not completed | Requested task sequence | PENDING |
| Follow-up study and PPO | Not run | Conditional quality gate | BLOCKED |

Recorded regression source: `a0d79df93fc49f54fe1a66a993537d823ff4f15f`.
Retained Lighthouse SHA-256:
`269d9503aded416d99d28e09f7c90a43738a19a5d0b3a57e325030d7888a8e7f`.
The existing complete numeric inventory is an inventory, not an independently
verified all-document certificate. Independent study claim rows are in
`reports/integrity/claim-to-source.csv`; physics and security have separate
verifiers. No final report claiming every requested number PASS is warranted.

## Existing final study, unchanged

| Scenario | Baseline reward | Policy reward | Policy minus baseline reward, 95% CI | Baseline altitude error, m | Policy altitude error, m | Check |
|---|---:|---:|---|---:|---:|---|
| Calm | -27.05 | -23.41 | 3.64 [2.12, 5.07] | 0.0257 | 0.0218 | PASS, study verifier |
| Mild synthetic wind | -29.42 | -25.19 | 4.23 [2.83, 5.54] | 0.0280 | 0.0235 | PASS, study verifier |

Source: `reports/study/final.json`; independent recomputation:
`reports/integrity/independent-verifier.json`. There are
3 independent training runs, sharing
200 held-out episode seeds per scenario.
Crossed bootstrap respects those units; pooled controller flights are not
independent training runs. These descriptive 95% intervals are distinct from
the multiplicity-adjusted gate intervals in the artifact. The gate passed in
simulation; that does not imply deployment, physical validation or robustness.
The mild-wind baseline succeeds on every held-out episode. The selected
candidate bundles training budget and learning-rate schedule.

## Supported resume draft

Built and audited a simulation-only tabular Q-learning residual-controller study
with 3 training seeds; the selected candidate reduced
mean altitude error from 0.0257 to
0.0218 m in calm and from
0.0280 to
0.0235 m in mild synthetic wind on held-out
episodes. The live application retains the baseline controller; physical-flight
validation and wind-robustness gains are not claimed.

## Reproduction and next steps

```sh
node scripts/learning/verify-study-independent.mjs
python scripts/learning/check-final-determinism.py --reuse-dependencies
python scripts/physics/verify-flight.py
python scripts/physics/render-report.py --check
python scripts/security/check-client-bundle.py --check
python scripts/security/render-report.py --check
npm run lint
npm run type-check:server
npm test
npm run build
python scripts/product/render-stop-report.py --check
```

Do not rerun the final-stage command in the current working tree; its consumed
bank marker must remain intact. The replay helper uses frozen historical source
in separate clean worktrees and performs no selection or tuning.

Before product measurements resume, explicitly amend and commit the protocol
to retain this invalid attempt and host preview/browser in one command network.
First finish replacing audit classifier MATCH templates with actual extraction
and comparison. Tasks following the blocked quality checks remain outstanding.
