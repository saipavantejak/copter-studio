# Aircraft calibration workflow

The first target is the stock brushed Crazyflie 2.1, with an explicitly identified motor, propeller, battery and hardware revision. This release builds ingestion, validation and application of measured static propulsion; it does **not** claim that an aircraft has completed physical validation.

## Available now

Open **Benchmark → Aircraft calibration workbench**. Download a template, enter measurements, import or paste JSON, and review the comparison before applying it. Imports are processed locally. The application does not fetch the provided source URL, execute file contents, automatically start flights or silently upload files. A reviewed configuration can subsequently be saved using the existing authenticated cloud history.

Ask Aether **Show calibration status** for a deterministic report of the active configuration's evidence. Training status and calibration status are different: a research model can be trained without being suitable for the active aircraft.

## Propulsion packet

- `aircraftId` and `hardwareRevision`: exact motor, propeller, frame and battery variant.
- `sourceUrl`: HTTPS measurement report or source; its contents are not automatically verified.
- `config`: drone type, total mass (kg), propeller diameter (inches), voltage (V), arm length (m), capacity (mAh).
- `powerScope`: must be `per-motor-electrical`. Shaft power and whole-aircraft power require additional measurements before conversion.
- `electronicsPowerW`: separately measured whole-aircraft electronics power; the engine counts it once, separately from per-motor draw.
- `fitting` / `validation`: command (-1 to +1), per-motor thrust (N), electrical power (W), measured supply voltage (V), session identity.

The fitting curve averages repeated command values and uses piecewise linear interpolation. It needs measured endpoints at -1 and +1; endpoints are never invented by extrapolation. Thrust must be nondecreasing. Voltage must be within 1% of the configuration voltage. This is a provisional nominal-voltage acceptance tolerance, not a validated voltage-response model.

Validation session IDs must be disjoint from fitting IDs and cover low, middle and high commands. Normalized MAE = mean absolute prediction error / mean measured value. Proposed acceptance targets are ≤5% thrust and ≤10% electrical power. These are engineering targets, not standards or confidence intervals. A failed fit cannot be applied through the review workflow. Session independence and provenance remain user-declared; names alone do not authenticate physical experiments.

Applying a passing review replaces the aircraft configuration with the reviewed configuration and installs the curve plus electronics draw. Configuration identity, curve and electronics are bound to the evidence record. Relevant editor changes invalidate that record; direct inconsistent configuration changes fail validation. No claim is made to validate motor transients, yaw torque, inertia, drag or dynamic voltage behavior.

## Why existing research data cannot be promoted

The 2015 Bitcraze data are whole-aircraft measurements at varying external supply voltage, ending below full PWM. Dividing power by four would distribute electronics power incorrectly; treating supply sag as battery discharge would also be wrong. This workflow therefore deliberately rejects that dataset as a nominal-voltage per-motor flight calibration. It remains available in the research learning panel.

## Battery and gust comparisons

The other two templates compare user-provided measured and simulated results for the same configuration, battery revision and protocol. Record explicit temperature, payload, duration, energy, termination, source/session and simulation commit/seed.

Battery endurance requires both trials to end at the protocol's battery cutoff. A 16-second hover or crash cannot pass as an endurance test. The current engine's nominal-energy battery model has **not** thereby gained a measured voltage/cutoff model.

Gust recovery requires matching ambient-world wind trace identities, gust window and peak speed, with measured recovery times. Onboard airflow cannot silently substitute for ambient wind. Define the recovery criterion, wind sensor location, sampling interval and maneuver in the protocol. The current engine does **not** replay uploaded wind traces; this comparison tool must receive outputs from an explicitly matched test setup. Different traces or protocols are marked non-comparable, with no misleading percentage error.

Targets are energy error ≤10%, cutoff endurance error ≤10%, recovery-time error ≤0.5 s. These provisional targets need scientific review before engineering use. A passing uploaded comparison is not an independently verified full-aircraft certification.

## Remaining physical inputs

Templates intentionally use null measurements. No synthetic training fixture is offered as measured evidence. To finish the first aircraft's validation, obtain independent repeated test sessions for its exact propulsion, battery discharge/cutoff, inertia and drag, calm hover, and controlled gust response. Retain untouched trials across collection days and battery specimens. Physical testing or suitable independent datasets are required; more epochs cannot create these missing observations.

Software tests use clearly marked synthetic fixtures only to check import rejection, held-out comparison math, electronics accounting, energy consumption and invalidation. They do not count as aircraft validation.
