# Reliability upgrade: implementation and release gates

This change is a software reliability upgrade, NOT a claim of a 10/10 simulator,
independent aircraft validation, or authorization to fly a physical aircraft.
The live production deployment has not been changed by this work.

## Implemented

- Battery discharge uses calculated electrical power on every step, independently
  of the sag toggle; nominal-energy accounting is bounded by available charge.
- Rotor forces and mixer moments use the same lagged rotor thrusts.
- Shared propulsion forward/inverse mapping; optional nominal-voltage measured
  command/thrustN/powerW curves and explicit maximum static thrust per motor.
- Configuration-aware hover/velocity controller, inertia-scaled torque demands,
  motor allocation and saturation handling, corrected lateral attitude sign.
- Inertia fallback is an explicit ring/central-mass approximation, without the
  extra prop-diameter-squared scaling. Measured principal moments remain supported.
- Correct rad/s indexing of the legacy propeller coefficient table.
- Battery depletion, numerical invalidity and pre-reset ground impact are latched.
- Main-thread and worker benchmarks share EpisodeRunner, per-episode controller
  reset, RNG ordering, cancellable loops and a bounded history buffer.
- Explicit mission success separate from crash/survival; final two-second altitude
  tolerance 0.1 m and velocity tolerance 0.5 m/s. These are software criteria,
  not universal flight-safety requirements. Mean altitude error includes transients.
- User-configurable benchmark duration 1–3600 simulated seconds at fixed dt=0.016 s.
- Explicit payload-specific SEC applicability; conditional efficiency sample count,
  success rate and total energy across all attempts are reported together.
- Advanced JSON configuration editor for battery capacity, payload, inertia and
  propulsion curves; full configuration is preserved during Aether edits.
- Aether supports explicit hover altitude, forward velocity and duration, exact
  nano values, grams, arm mm/cm/m, negation and all-fault flags. Approval displays
  precise mass and the executable mission. Unsupported known mission features block.
- Aether audits distinguish legacy SPT from time, do not automatically prescribe RL,
  and no longer call a merely loaded model validated. HTTP errors do not mean online.
- Domain randomization preserves advanced fields. Benchmark fault presets now
  actually set the advertised faults. UI software limits include 33-inch props.
- Regression tests and a CI workflow cover the software contract.

## Intentional Aether tradeoff

Execution parsing now uses the deterministic supported grammar; Gemini remains
the conversational/audit backend. This reduces open-ended command coverage to avoid
allowing an LLM to invent executable values. It is not a general natural-language
mission planner. Review the complete interpreted configuration before approval.
Arbitrary unsupported phrasing still needs a stricter grammar/coverage review.
Payload mass versus total mass must be set separately in the advanced editor.
The legacy cloud hydration helper is retained for compatibility/tests, not execution.

## Verified locally

- Baseline: 46 of 47 existing tests passed; one UI assertion referenced stale branding.
- New regression suite: 17 tests passed (input, energy, actuators, missions, repeatability,
  failed takeoff, domain settings, inertia scaling, 60-second run and cancellation).
- Full suite: 64 tests passed. App/server type checks and production build passed.
- The standalone seven-fixture / 350-episode catalog CLI could not run locally:
  the environment denied its Unix IPC socket (EPERM). No catalog pass is claimed.
  The added CI job runs this script in the standard GitHub runner environment.
- These are source-level/headless and mocked component checks, not visual browser QA.

## Still required before production confidence / physical validation

1. Import traceable motor/propeller datasets and hold out independent flight data.
   Supplied maximum thrust is an input, not a validation result. The prior nine-aircraft
   table is not revalidated by this change; exact prior fixture inputs are not all in
   the repository. Do not claim manufacturer endurance matches from short hover runs.
2. Replace the bicopter swashplate approximation with actual rotor tilt geometry,
   servo dynamics and measured actuator authority. It is NOT a validated V-Coptr twin.
3. Implement measured motor torque/RPM/current, ESC limits, battery internal resistance,
   voltage/current coupling, thermal behavior, reserves and load-specific efficiency.
   Present battery model is nominal-energy bookkeeping with a simplified sag modifier.
4. Validate wind, drag, ground effect and contact dynamics. Legacy high-fidelity tables
   have no traceable raw fit dataset here; their label does not establish fidelity.
5. Validate timestep convergence, aggressive maneuvers, yaw allocation, nonzero-heading
   velocity tracking, all vehicle geometries and fault-recovery envelopes.
6. Add sustained-error/failure-to-takeoff deadlines, mission-relative position errors,
   geofences and full mission outcome handling in the live UI. Live duration currently
   pauses at the horizon; it does not execute an automatic landing.
7. Replace legacy SPT, structural-stress, cargo and half-range heuristics; add uncertainty
   and confidence intervals. Leaderboard ranking now requires explicit successful status
   and applicable SEC; live sessions currently only save failures, so those are not ranked.
   Updated main views show N/A, but not every historic export is migrated.
8. Validate RL observation normalization, action semantics, training/export parity and
   the generated Colab notebooks end-to-end. Dimensions alone are insufficient.
9. Review API security/rate limiting and complete real browser/mobile/accessibility QA.
   Large TF.js/Three.js chunks still trigger build warnings.
10. Retest the complete physical reference suite and review the draft PR before merging.

## Commands

    npm ci
    npm run lint
    npm run type-check:server
    npm test
    npm run build
    npm run ci:reliability

Server checking uses noEmit + Bundler resolution because the supported server scripts
run through tsx; this configuration does not promise executable emitted NodeNext JS.

## Compatibility

Controller/physics trajectories intentionally change. Saved policies may be invalid
under the new dynamics and must be reevaluated. Model load failures in the worker now
fail the benchmark instead of silently substituting a heuristic controller. The legacy
numeric-only heuristic API still uses demo hardware defaults; pass PhysicsConfig for
configuration-aware behavior. Live simulation and the shared benchmark do so.
