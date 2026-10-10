# Measured-data learning release 1

This release runs supervised, unsupervised and reinforcement learning with explicit evidence boundaries. It does not establish a validated digital twin, guarantee accuracy, or fine-tune Aether's language-model weights.

## Reproduce

From repository root (Python 3.11+ and Node 22.13+ or 24+):

```sh
python -m pip install -r scripts/learning/requirements.txt
npm ci
npm run train:measured
node --import tsx scripts/learning/train-residual-legacy.ts
node --import tsx scripts/learning/study/run-study.ts --stage=qualify
node --import tsx scripts/learning/study/run-study.ts --stage=validation
node --import tsx scripts/learning/study/run-study.ts --stage=select
# Commit the generated selection before final; run in a fresh reproduction worktree.
node --import tsx scripts/learning/study/run-study.ts --stage=final
node --import tsx scripts/learning/verify-artifacts.ts
npm run train:energy
npm test
npm run lint
npm run build
```

The measured source subset is in `data/training/reference-measurements.json`. Its SHA-256 is recorded in `src/learning/measured-models.json`. Source URLs, attribution, session identities and units are retained. Bench and RL training need no network or API key once dependencies are installed. Energy training requires network access on its first run to download the checksum-pinned source CSV; later runs can use its verified cache. The Python requirements pin the versions used. Numerical roundoff may differ across platforms.

## What trained

- **Supervised:** quadratic regressions from 60 measured rows; 20 predeclared interior rows held out. The Bitcraze model uses nonnegative coefficients for total thrust and electrical input power vs PWM. Four UIUC propeller models fit dimensionless Ct and Cp vs RPM. Each model is restricted to its exact source setup and measured range. These are small engineering regressions, not a general drone foundation model.
- **Unsupervised:** three K-means clusters fitted to 48 training operating points using standardized diameter, pitch/diameter and RPM. Centers and scaling are exported. Distance beyond the largest training distance flags poor support; it is not a confidence probability. No held-out labels are used.
- **Reinforcement learning:** six predeclared one-factor candidates use three training streams each under a frozen physically scaled wind proxy. Candidate selection uses new validation seeds only; the selected candidate is evaluated once on a separate fresh final bank. All validation candidates and negatives are retained. The final artifact and generated results below are authoritative.

## Findings and promotion decision

Bitcraze held-out MAE: 0.000637 N total thrust (approximately 0.065 g-force) and 0.0755 W electrical input. This is **within-sweep interpolation** from one 2015 experiment. It cannot establish repeatability, uncertainty coverage, accuracy on modern variants or performance in flight. Full metrics and a mean-prediction baseline are exported for every target. The baseline is a simple statistical reference, not a comparison with the existing physics engine.

The original single-run result reproduced exactly and is retained in `reports/rl-legacy-reproduction.json`. Its calm baseline/policy errors were 0.0303 / 0.0371 m; both wind controllers failed. Those historical scores use the old uncalibrated wind model. The preregistered improvement study below uses a separately committed wind proxy and new seed banks; its final candidate passes the simulation gate but is not physically validated or installed in the active controller.

The Benchmark learning panel provides restricted bench predictions and the training evidence. Aether receives the same provenance and limitations in its context; its underlying language model is not retrained. The supervised models are intentionally not silently inserted into the flight engine: the Bitcraze data are whole-system measurements with covarying external supply voltage, whereas the engine's propulsion interface requires per-motor nominal-voltage curves. Dividing total power by four would incorrectly distribute electronics draw and conceal the voltage mismatch.

## Source limits

Bitcraze's 2015 dataset has 16 rows from a single Crazyflie 2.x sweep. Preserve the published 43.25% PWM entry; its spacing differs from the nominal sequence. Supply sag reflects cables and a power box, not battery internal resistance. No 100% PWM measurement exists. It is not a Crazyflie Brushless model.

UIUC's subset has 16 static measurements for each of four isolated propellers. Shaft power is not battery input power. These samples contain no whole-aircraft endurance or gust-response labels. Reference: Brandt, Deters, Ananda, Dantsker and Selig, UIUC Propeller Database, Vol. 1. Source numeric facts retain attribution; the repository's MIT license does not relicense third-party documents or archives.

The Carnegie Mellon [Matrice 100 energy dataset](https://theairlab.org/energy-dataset/) provides context for the **author-hosted processed cruise subset** used from [Rodrigues's repository](https://github.com/thiago-a-rod/energy_consumption/tree/3058a25a7092633e05a3fe169c6ae3b967636b9d/MLModel/data). `train_energy.py` downloads that immutable CSV and verifies its SHA-256. Raw CSV is not committed. It contains 95,900 processed rows from 187 flights. The source's `y` column is treated as the authors' power target (W), not independently reconstructed from raw current/voltage.

The script derives time-weighted mean power, integrated cruise energy, observed segment duration and six operational features per flight, using actual timestamps. Its exported summaries include the largest sampling gap; numerical integration assumes linear behavior between adjacent samples. Onboard airflow is not ambient wind, and airflow variation is not a standardized gust-duration measurement. A short cruise segment is not battery-depletion endurance.

## Neural forward/backward experiment

`train_energy.py` implements a 6 → 12 tanh → 1 neural network with explicit forward propagation, analytic backpropagation, Adam weight/bias updates, L2 regularization and validation early stopping. A central finite-difference gradient check verifies the derivatives (maximum absolute discrepancy approximately 3.66e-11). Training, validation, calibration and testing use disjoint flight IDs: 102 / 28 / 28 / 29. Normalization and operating-regime K-means are fitted only on the training flights. Flights can share collection dates and aircraft; this is not independent-airframe or date-held-out validation. Source preprocessing was performed by the authors before this split.

Training ran 605 epochs and restored the best validation checkpoint at epoch 355. Test MAE decreased from the initial random network's 51.77 W to 13.06 W. A ridge regression trained on the same training flights scored 10.90 W and therefore remains the preferred experimental estimator. A 90% nominal interval calibrated on separate flights covered 25/29 test flights (86.2%), with radius 29.10 W. Do not advertise this as guaranteed 90% coverage. Test scores are never used for gradient updates or stopping. No repeated tuning against those 29 test flights is performed.

The exported model includes weights, biases, scaler parameters, training history, test errors by payload, per-flight residuals, initial-model comparison, baseline coefficients and uncertainty diagnostics. TypeScript inference is checked against the Python predictions. It rejects unknown aircraft setups, invalid inputs, range extrapolation and points outside learned support. It is a research estimator conditional on measured cruise summaries, not a prospective endurance forecast.

The evidence shows that additional neural complexity did not improve on ridge regression for this dataset. This does not prove a single cause of residual errors. Possible missing explanations include battery state, temperature, unmodeled maneuvers, airflow reference-frame effects and averaging. Testing these hypotheses requires the relevant measured variables. Similarly, the RL policy observes only altitude error and vertical speed and changes only collective output; it cannot learn a full wind-rejection controller from that restricted action/state representation.

No claim is made to cover every drone or every gust condition. Aether's factual training-status response uses the exported artifacts directly; its language-model weights remain unchanged.

## Requirements before broader claims

Collect independent test sessions across airframes, motors/props, batteries, payloads and wind conditions. Keep repeated samples from one flight/session together; split by session/date and eventually by airframe before fitting scalers, models or hyperparameters. Use measured wind profiles, a defined gust window, air density, state of charge, voltage/current and clear test termination reasons. Preserve missing values as unknown, never zero. Do not relabel maximum advertised wind resistance as tested endurance.

A future energy dataset should record test/session ID, source and usage terms, hardware revision, payload, commanded speed/altitude, wind reference frame and sampling rate, gust-window definition, temperature, pressure, measured duration, energy and termination reason. Battery-to-cutoff tests must be distinguished from completed short missions. Require held-out error by regime, calibrated uncertainty coverage, failure-rate comparisons, independent physical validation and a documented supported envelope before default promotion.

<!-- BEGIN GENERATED ML EVALUATION -->
## Pre-registered ML improvement study

**Conclusion A.** A: the selected candidate passes the unchanged simulation gate on fresh data, with the predeclared final evidence requirement also satisfied. Physical promotion remains false.

Registration was committed before experiments: `bf89608`. The physically scaled wind correction was committed separately as `57fe174`, using manufacturer dimensions, a declared flat-plate drag proxy and relative airspeed. It is not measured aerodynamic calibration. Baseline qualification was 100/100 missions with 0 engine failures, so the registered mild-wind scenario was retained without further modification.

Six one-factor candidates were evaluated, each with three training seeds. Validation used 500001–500100 (calm) and 501001–501100 (wind), with Bonferroni correction across twelve primary candidate/scenario comparisons. No consumed legacy/audit banks were used for tuning. Candidate **f (3000 episodes and visit-decaying alpha)** was selected by the committed validation-only rule. The final test used 600001–600200 / 601001–601200 exactly once, with no subsequent tuning.

| Scenario | Baseline reward | Policy reward | Reward Δ | 95% crossed CI | Two-scenario 97.5% CI | Baseline / policy altitude error (m) | Baseline / policy successes | Engine failures |
|---|---|---|---|---|---|---|---|---|
| Calm | -27.050001 | -23.414768 | 3.635233 | [2.115323, 5.068377] | [1.941497, 5.235808] | 0.025703 / 0.021802 | 200/200 / 600/600 | 0/200 / 0/600 |
| Wind | -29.419173 | -25.185662 | 4.233511 | [2.826502, 5.540468] | [2.631572, 5.687716] | 0.028017 / 0.023495 | 200/200 / 600/600 | 0/200 / 0/600 |

Policy figures pool three trained policies sharing 200 episode seeds per scenario; repeated baseline observations are not treated as independent. The ordinary 95% and two-scenario-adjusted reward intervals use a crossed bootstrap over training seeds and episode seeds. Only three training seeds limit the accuracy of interval coverage.

Simulation only; `physicalValidation=false`, `passesSimulationGate=true`, `promoted=false`. The success criteria, original reward and per-run promotion gate are unchanged. Physics was frozen after the required calibration commit. A shorter-hold candidate retains the same decision-level gamma, so its temporal discount horizon also changes. No severe-wind, flight robustness or endurance claim is supported.

All six validation results, per-run final outcomes, calibration sources, registered selection and reproduction commands are in [the study audit](../../reports/study/improvement-study.md). The audit-era results are preserved separately. The final artifact is [residual-policy.json](../../public/learning/residual-policy.json).

<!-- END GENERATED ML EVALUATION -->
