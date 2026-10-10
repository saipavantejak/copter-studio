# Evaluation errata

## Remaining classifier templates in the numeric inventory

Final source review found that `audit-claims.py:doc_expected` still assigns
MATCH to several non-generated README rows from literal classifier text,
including historical training-budget and benchmark-default descriptions.
The resume repair is independently checked, but it does not satisfy the
broader requirement that every inventory row be artifact-derived. The cause
is the original classifier's assertion-based design. No new wrong
experimental metric was demonstrated; the affected claim is the assurance
attached to those inventory rows. Repair is outstanding. The work stopped
instead of declaring all-document numeric verification complete. See
`reports/product/STOP-QUALITY.md` for the scoped evidence and pending tasks.

## Invalid product measurement: preview network isolation

The first registered Lighthouse desktop run at product-source commit
`72e1c1f` could not reach the separately launched local preview server.
Its retained report has FAILED_DOCUMENT_REQUEST / ERR_CONNECTION_REFUSED
and null performance/accessibility scores. Commands run in isolated network
contexts here; a preview launched in another command is not sufficient.
The measurement setup needs a shared server/browser command context and
a committed protocol amendment before resuming. No valid baseline or
before/after metrics were produced, no run was discarded, and no product
repair was selected from this invalid observation. Existing RL, physics and
security numbers are unaffected. The registered stop rule was followed.

## Inconsistent local Gemini proxy protections

The security audit found that the Vite and Gym proxy implementations did not
share the hosted endpoint's model/message validation. Both accepted arbitrary
provider payloads and collected unbounded bodies; the Gym proxy lacked rate
limiting, and both forwarded provider errors. Keys were server-side under the
documented configuration; no actual leaked key was observed. A shared gateway
now validates and bounds bodies, restricts the model, excludes provider tools,
uses a bounded instance-local limiter and upstream timeout, rejects cross-origin
browser requests, and returns generic failure messages. The key is sent only in
the upstream header, never in the URL. Public client environment variables are
allowlisted to prevent accidentally VITE-prefixed provider keys entering the
bundle. A real-build synthetic-key regression check runs in CI. Distributed
paid-service quotas and infrastructure log retention remain deployment concerns.
No flight, reward, confidence interval or existing experimental result is affected.

## Determinism-check preflight dependency path

The first invocation of the new replay helper stopped before executing a
controller: a `node_modules` symlink was not covered by git's directory ignore
rule, so the clean-worktree check rejected it. The helper now creates an ignored
`node_modules` directory and links its entries. It still rejects any dirty
worktree before execution. No study seed was read, no result was produced and
no previously reported number was affected by this helper-only correction.

The corrected helper completed both frozen final-stage replays at the original
selection/source commit. All output bytes, including provenance, agree between
the two worktrees and with the four committed artifacts. Evidence is in
`reports/integrity/final-determinism.json`. No new candidate was selected,
no model was trained, and no unconsumed seed bank was accessed. A separate
negative-control check deliberately altered a resume percentage only in a
temporary worktree and confirmed that the independent verifier rejects it.

## Hiring-manager integrity audit: discovered blocker, now repaired

Observed against branch `audit/ml-evaluation-integrity` at `69e469b`.

**Cause.** `scripts/learning/audit-claims.py` retained an audit-era resume
template after the successful simulation study. It writes “all gates false”
and “No improvement or physical validation claimed”, yet labels the row
`MATCH`. The actual resume statement claims a simulation improvement, and
`reports/study/final.json` records `passesSimulationGate=true`.
`promoted=false` and `physicalValidation=false` remain correct and distinct
from passing the simulation gate.

**Affected output.** The resume row in
`reports/numeric-claims-final.csv.gz`, plus its uncompressed generated copy.
Its gate reconciliation and explanatory note are false. This discovery does
not change any episode record, reward, altitude error, confidence interval,
success count or learned policy. Independently recomputed existing validation
and final-study metrics agree with their artifacts within numerical tolerance.

**Detection and status.** Added a separately implemented verifier,
`scripts/learning/verify-study-independent.mjs`, which imports no main
statistics or simulator modules. Its output is committed in
`reports/integrity/independent-verifier.json`; it intentionally exits nonzero
while the contradictory inventory remains. The old inventory is preserved as
evidence. No result JSON was edited. The audit generator correction and
regeneration have **not** been performed: the user's explicit stop-on-failure
rule stopped this task at the discrepancy. A future correction must regenerate
the inventory, retain this erratum, and rerun the independent check.

**Repair and regeneration.** Following explicit authorization to continue,
commit `6ee28ab` repaired the generator and regenerated
`reports/numeric-claims-final.csv.gz`. The resume row now contains the actual
resume paragraph and structured facts derived from `reports/study/final.json`:
training budget, training-seed count, altitude reductions, simulation gate,
physical-validation flag and promotion flag. These flags are no longer
conflated. Generic raw artifact leaves are labelled `RECORDED VALUE` or
`RECORDED INPUT`, rather than falsely presenting copied values as independent
`MATCH` checks. Historical evidence remains available at `7335e7e`.

The independent verifier now parses the CSV and the actual resume paragraph,
checks their numbers and flags against the final artifact, and checks generated
README, study and audit text for drift. It exits zero after the repair. CI runs
this verifier before software build checks. The previous stop report is a
historical record, not the current audit status. No experimental result JSON
was edited or regenerated during this repair.

**Additional verification gap.** The former verifier imports the production
statistics implementation. The former inventory copies numeric leaves into
its recomputed-value column and labels them `MATCH`; that inventory alone is
not proof of independent recomputation. The new verifier checks the existing
study's aggregates, outcome counts, Wilson intervals, crossed bootstrap
intervals, per-training-run gates and stated altitude reductions. It does not
certify every other repository claim or bit-for-bit simulator replay.

## Physical trajectory evidence unavailable

`data/training` contains `reference-measurements.json` and
`energy-flight-summaries.json`. The former contains static propulsion bench
measurements; the latter contains processed flight energy aggregates.
Neither is a time-aligned Bitcraze flight trajectory. Therefore the requested
trajectory-error comparison cannot be computed from these files. No physical
trajectory accuracy is claimed; `physicalValidation=false` is retained.

**Subsequent external diagnostic.** Public time-aligned Brushless trajectories
were located outside the repository. Their comparison was separately
preregistered before prediction and is documented in
`reports/physics/comparison.md`. This does not make the original in-repository
bench/energy files into flight logs. The diagnostic shows poor longer-horizon
agreement and retains physicalValidation=false. It changes no original physics,
Q-learning result or policy. The software test count increased after adding
invariant tests; reliability reports and generated study docs were regenerated
with their committed scripts rather than edited manually.
