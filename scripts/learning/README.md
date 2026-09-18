# Measured-data learning release 1

This release runs supervised, unsupervised and reinforcement learning with explicit evidence boundaries. It does not establish a validated digital twin, guarantee accuracy, or fine-tune Aether's language-model weights.

## Reproduce

From repository root (Python 3.11+ and Node 22):

```sh
python -m pip install -r scripts/learning/requirements.txt
npm ci
npm run train:measured
npm run train:residual
npm run train:energy
npm test
npm run lint
npm run build
```

The measured source subset is in `data/training/reference-measurements.json`. Its SHA-256 is recorded in `src/learning/measured-models.json`. Source URLs, attribution, session identities and units are retained. No network access or API key is needed to reproduce training. The Python requirements pin the versions used. Numerical roundoff may differ across platforms.

## What trained

- **Supervised:** quadratic regressions from 60 measured rows; 20 predeclared interior rows held out. The Bitcraze model uses nonnegative coefficients for total thrust and electrical input power vs PWM. Four UIUC propeller models fit dimensionless Ct and Cp vs RPM. Each model is restricted to its exact source setup and measured range. These are small engineering regressions, not a general drone foundation model.
- **Unsupervised:** three K-means clusters fitted to 48 training operating points using standardized diameter, pitch/diameter and RPM. Centers and scaling are exported. Distance beyond the largest training distance flags poor support; it is not a confidence probability. No held-out labels are used.
- **Reinforcement learning:** 600 episodes of tabular Q-learning in the actual Copter PhysicsEngine, training a bounded collective residual around VehicleController for one Crazyflie reference configuration. 100 separate seeds are evaluated with the frozen policy and the baseline (200 evaluation flights), half calm and half synthetic sinusoidal wind. Policy, visits, settings and every evaluation outcome are downloadable in `public/learning/residual-policy.json`.

## Findings and promotion decision

Bitcraze held-out MAE: 0.000637 N total thrust (approximately 0.065 g-force) and 0.0755 W electrical input. This is **within-sweep interpolation** from one 2015 experiment. It cannot establish repeatability, uncertainty coverage, accuracy on modern variants or performance in flight. Full metrics and a mean-prediction baseline are exported for every target. The baseline is a simple statistical reference, not a comparison with the existing physics engine.

Calm simulation: baseline and learned policy each completed 50/50 missions. Mean altitude error increased from 0.0303 m to 0.0371 m with the learned policy. Synthetic wind: both failed 50/50 missions. A slightly lower pre-failure error does not count as an improvement. The candidate fails promotion. Existing controller and simulator physics remain active. The evaluation is a single run, not statistical proof of policy superiority.

The Benchmark learning panel provides restricted bench predictions and the training evidence. Aether receives the same provenance and limitations in its context; its underlying language model is not retrained. The supervised models are intentionally not silently inserted into the flight engine: the Bitcraze data are whole-system measurements with covarying external supply voltage, whereas the engine's propulsion interface requires per-motor nominal-voltage curves. Dividing total power by four would incorrectly distribute electronics draw and conceal the voltage mismatch.

## Source limits

Bitcraze's 2015 dataset has 16 rows from a single Crazyflie 2.x sweep. Preserve the published 43.25% PWM entry; its spacing differs from the nominal sequence. Supply sag reflects cables and a power box, not battery internal resistance. No 100% PWM measurement exists. It is not a Crazyflie Brushless model.

UIUC's subset has 16 static measurements for each of four isolated propellers. Shaft power is not battery input power. These samples contain no whole-aircraft endurance or gust-response labels. Reference: Brandt, Deters, Ananda, Dantsker and Selig, UIUC Propeller Database, Vol. 1, retrieved 2026-09-17. Source numeric facts retain attribution; the repository's MIT license does not relicense third-party documents or archives.

The Carnegie Mellon [Matrice 100 energy dataset](https://theairlab.org/energy-dataset/) describes 195 parameter-varying flights and 14 hover/ancillary recordings. The Figshare API returned HTTP 403, but an **author-hosted processed cruise subset** was accessible in [Rodrigues's repository](https://github.com/thiago-a-rod/energy_consumption/tree/3058a25a7092633e05a3fe169c6ae3b967636b9d/MLModel/data). `train_energy.py` downloads that immutable CSV and verifies its SHA-256. Raw CSV is not committed. It contains 95,900 processed rows from 187 flights. The source's `y` column is treated as the authors' power target (W), not independently reconstructed from raw current/voltage.

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
