# Product measurement protocol

Commit before collecting baseline Lighthouse or local browser observations.
Use a production build served locally without configured cloud credentials;
the Gemini preview route deliberately returns service unavailable. No login,
real cloud requests, uploads, analytics collection or controller training.

Baseline is the committed product source before UI repairs. Record its commit
and build/source hashes. Measure three fresh Lighthouse navigations each for
desktop and the default mobile profile, performance and accessibility only.
Keep browser, Lighthouse versions, server, throttling mode and hardware constant
for after measurements. Report every run and medians; no discarding slow runs.
These are observational wall-clock measurements with inherent variability,
not deterministic policy experiments or real-user service-level guarantees.
Never assert a significant timing gain from these few observations.

Collect separate browser checks at desktop 1365×768 and mobile 390×844:
time to enabled welcome control, navigation load-event time, then initialize
the workspace and record document overflow, visible start control, console
errors and uncaught exceptions. Use a new browser context without login or
stored credentials. An unavailable optional AI route must be distinguished
from an uncaught UI error. Save desktop/mobile screenshots for evidence.

Failure checks: disable WebGL before page initialization; verify a clear
fallback and that unsupported simulation actions cannot silently run. Block
the optional AI route and verify local planning/UI remain usable. No claim of
successful rendering is allowed when the canvas is missing. Verify that the
welcome screen does not leave hidden workspace controls in the keyboard path.

Only fix observed defects. Candidate repairs, conditional on evidence:
defer heavyweight workspace/rendering imports until initialization; stack
navigation on narrow screens if overflow occurs; label controls if accessibility
audits flag missing names; prevent constructing a renderer when WebGL is
unavailable and offer headless benchmarking; show visible degraded network
status rather than implied cloud availability. Do not change physics, rewards,
success criteria, model parameters or active-controller selection.

After repairs, rerun the identical protocol once, with the same three
navigations per profile. Independently recompute reported medians and category
scores from the raw Lighthouse/browser records. Keep all outcomes, including
regressions, errors and unchanged metrics. Do not chase a score with repeated
after measurements. If a run is invalid because the tool/server fails, retain
the failure, explain it and stop before drawing a before/after conclusion.
