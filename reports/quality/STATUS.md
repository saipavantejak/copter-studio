# Continuation status

Local quality work completed within the requested scope; no deployment or push.
This is scoped evidence, not a claim that every historical document or physical
model is fully validated. Policy results are unchanged; physicalValidation=false
and promoted=false. No ablation or PPO training occurred.

| Check | Result | Evidence |
|---|---|---|
| Independent recomputation | 1361 PASS, 0 FAIL | reports/integrity/independent-verifier.json |
| Independent recomputation | 820 PASS, 0 FAIL | reports/physics/independent-verifier.json |
| Software tests | 223 passed | reports/reliability-v3.json |
| Strict types | Enabled in browser/root and server; checks pass | tsconfig.json; server/tsconfig.server.json |
| Coverage thresholds | Enabled; modest global floors and stronger rigid-body core floor | vite.config.ts |
| Final-stage determinism | Existing frozen replay proof retained; two identical clean-worktree replays | reports/integrity/final-determinism.json |
| Key exposure | No observed client or reachable text-history key exposure; not exhaustive proof | docs/SECURITY.md |
| Browser regressions | Local desktop, mobile and forced-unavailable WebGL pass | reports/product/browser-after.json |
| Hosted analytics | BLOCKED: not deployed; collection defaults off | docs/PRIVACY.md |
| Lighthouse | BLOCKED/skipped; no performance claim | Retained invalid raw report |
| Historical authored claim lines | UNVERIFIED where no extractor exists | reports/quality/number-to-source.csv |

## Maintainability before/after

Compiler strict mode was absent/disabled at the starting commit and is now enabled.
The first strict diagnostic is retained as strict-before.txt; it included newly
added analytics typing gaps during implementation, not just original defects.
Coverage was not enforced before. The before measurement is the first instrumented
run, not a measurement of the starting checkout. After/current are native test
outputs; their small differences do not establish improved test effectiveness.
Uncovered UI, bridge and worker code remains included and visible.

| Metric | First measured coverage | After maintainability | Current product coverage |
|---|---:|---:|---:|
| statements | 46.2% | 46.42% | 45.26% |
| branches | 46.75% | 46.82% | 46.1% |
| functions | 39.95% | 40.46% | 39.24% |
| lines | 50.08% | 50.17% | 48.88% |

The complete number/status/source table is number-to-source.csv. Study and
physics rows include independent raw-record recomputation; document rows cite
their checkable generators. UNVERIFIED historical prose is not silently upgraded
to PASS. Generated document checks, independent verifiers, inventory drift
checking, strict types, coverage tests, build and key canaries run in CI.

## Product evidence and environment

Preview and browser share one command network. The baseline's remote HDR crash,
mobile overflow and missing keyboard/WebGL boundaries are retained. Repairs do
not modify physics or controller decisions. Fonts and lighting now work without
remote asset downloads. Startup checks read configuration metadata, not a paid
AI ping. Configuration is explicitly not provider-health verification.

Browser results are local observations, not Lighthouse metrics or universal
accessibility certification. The forced-unavailable WebGL case shows a clear
fallback and disables interactive simulation; Benchmark navigation remains
usable. The demo deliverable is a script, not claimed recorded footage.

## Reproduce

```sh
npm ci
npm run lint
npm run type-check:server
npm run test:coverage
npm run build
node scripts/learning/verify-study-independent.mjs
python scripts/physics/verify-flight.py
python scripts/learning/check-inventory.py
python scripts/docs/render-project.py --check
python scripts/docs/render-privacy.py --check
python scripts/security/render-report.py --check
python scripts/quality/render-status.py --check
python scripts/security/check-client-bundle.py --check
# User machine, after installing the Playwright browser:
npx playwright-core install chromium
node scripts/product/check-browser.mjs after
node scripts/product/capture-demo.mjs
```

Do not retrain or rerun final-stage evaluation in this consumed checkout.
See docs/RESUME.md for the absolute-value supported resume statement and
reports/physics/comparison.md for the negative physical diagnostic, all flight
metrics, descriptive intervals and independent flight units.
