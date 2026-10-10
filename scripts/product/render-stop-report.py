"""Render scoped stop evidence from retained artifacts; never runs experiments."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
def read(path):
    return json.loads((root / path).read_text())

study = read('reports/study/final.json')
independent = read('reports/integrity/independent-verifier.json')
physics = read('reports/physics/independent-verifier.json')
replay = read('reports/integrity/final-determinism.json')
security = read('reports/security/client-bundle.json')
reliability = read('reports/reliability-v3.json')
failure_path = 'reports/product/before/lighthouse-desktop-1.json'
failure = read(failure_path)
assert failure['runtimeError']['code'] == 'FAILED_DOCUMENT_REQUEST'
assert all(failure['categories'][k]['score'] is None for k in ['performance', 'accessibility'])
assert independent['failed'] == physics['failed'] == 0
assert study['promoted'] is False and study['physicalValidation'] is False
rows = []
for result in study['results']:
    b, p, difference = result['baseline'], result['policy'], result['comparisons']['reward']
    label = 'Mild synthetic wind' if result['wind'] else 'Calm'
    lo, hi = difference['ci95']
    rows.append(f"| {label} | {b['meanReward']:.2f} | {p['meanReward']:.2f} | {difference['estimate']:.2f} [{lo:.2f}, {hi:.2f}] | {b['meanAltitudeErrorM']:.4f} | {p['meanAltitudeErrorM']:.4f} | PASS, study verifier |")
calm, wind = study['results']
text = f'''# Quality work stop report

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
`{failure['runtimeError']['code']}` / `net::ERR_CONNECTION_REFUSED`.
Separately launched preview and browser commands could not share their loopback
network in this environment. Performance and accessibility scores are null;
no valid baseline, mobile results or before/after comparison exists. The raw
failure is retained, not overwritten. Product source was not repaired against
an invalid observation. The measurement protocol explicitly requires stopping
on an invalid tool/server run before drawing a conclusion.

## Evidence status

| Evidence | Artifact-derived value | Source | Status |
|---|---|---|---|
| Independent study checks | {independent['passed']} passed; {independent['failed']} failed | reports/integrity/independent-verifier.json | PASS within stated scope |
| Independent trajectory checks | {physics['passed']} passed; {physics['failed']} failed | reports/physics/independent-verifier.json | PASS recomputation; accuracy not validated |
| Frozen final evaluation replay | {replay['replayCount']} clean-worktree runs, identical output | reports/integrity/final-determinism.json | {replay['status']}; evaluation only, not all training |
| Recorded software regression | {reliability['unitTestsPassed']} tests passed | reports/reliability-v3.json | PASS at recorded source commit |
| Synthetic-key production build | {security['filesScanned']} files scanned, no canary leaks | reports/security/client-bundle.json | {security['status']} at recorded source commit |
| Product performance and accessibility | Both scores null | {failure_path} | BLOCKED, invalid observation |
| All-document numeric certification | Not established | scripts/learning/audit-claims.py | FAIL, residual classifier templates |
| Strict TypeScript and coverage thresholds | Not implemented in this work | tsconfig.json; package.json | PENDING |
| README/demo/interview/analytics task | Not completed | Requested task sequence | PENDING |
| Follow-up study and PPO | Not run | Conditional quality gate | BLOCKED |

Recorded regression source: `{reliability['provenance']['sourceCommit']}`.
Retained Lighthouse SHA-256:
`{hashlib.sha256((root / failure_path).read_bytes()).hexdigest()}`.
The existing complete numeric inventory is an inventory, not an independently
verified all-document certificate. Independent study claim rows are in
`reports/integrity/claim-to-source.csv`; physics and security have separate
verifiers. No final report claiming every requested number PASS is warranted.

## Existing final study, unchanged

| Scenario | Baseline reward | Policy reward | Policy minus baseline reward, 95% CI | Baseline altitude error, m | Policy altitude error, m | Check |
|---|---:|---:|---|---:|---:|---|
{chr(10).join(rows)}

Source: `reports/study/final.json`; independent recomputation:
`reports/integrity/independent-verifier.json`. There are
{study['trainingSeedCount']} independent training runs, sharing
{calm['baseline']['episodes']} held-out episode seeds per scenario.
Crossed bootstrap respects those units; pooled controller flights are not
independent training runs. These descriptive 95% intervals are distinct from
the multiplicity-adjusted gate intervals in the artifact. The gate passed in
simulation; that does not imply deployment, physical validation or robustness.
The mild-wind baseline succeeds on every held-out episode. The selected
candidate bundles training budget and learning-rate schedule.

## Supported resume draft

Built and audited a simulation-only tabular Q-learning residual-controller study
with {study['trainingSeedCount']} training seeds; the selected candidate reduced
mean altitude error from {calm['baseline']['meanAltitudeErrorM']:.4f} to
{calm['policy']['meanAltitudeErrorM']:.4f} m in calm and from
{wind['baseline']['meanAltitudeErrorM']:.4f} to
{wind['policy']['meanAltitudeErrorM']:.4f} m in mild synthetic wind on held-out
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
'''
target = root / 'reports/product/STOP-QUALITY.md'
if '--check' in sys.argv:
    if not target.exists() or target.read_text() != text:
        raise SystemExit('Stop report drifted from retained artifacts')
    print('Stop report artifact check: PASS')
else:
    target.write_text(text)
    print(target.relative_to(root))
