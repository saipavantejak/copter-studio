# Reliability upgrade: implementation and release gates

## Third pass: integration and cloud history

- Aether routes quad/hex and plural episode commands through the validated parser.
  Recorded benchmark audits are deterministic, use actual SPT variation, preserve
  unavailable SEC as null/N/A and interpret both confidence interval endpoints.
- Simulation/Aether stay mounted across tab changes. Parsing updates its own message
  instead of replacing the latest asynchronous response. The episode selector reflects
  executed state; seed zero remains zero. Unsupported weight-based training advice is removed.
- Controller, live view and benchmark share legacy mission interpretation. Live missions
  stop at their configured duration (16 seconds by default). Hover success requires final
  horizontal position within 0.25 m and horizontal speed within 0.5 m/s, in addition to
  altitude tolerance. Velocity missions require cross-track position/speed and forward
  speed tracking. Randomized true aircraft parameters are withheld from the controller.
- Optional Supabase Auth and PostgreSQL history support explicit saves, retrieval and
  downloads. Owner-only RLS migration is included. Connection setup and verification are
  documented in DATABASE_SETUP.md; code deployment alone does not provision a database.
- Local checks: 109 tests passed; 1,050 catalog flights and 50 sixty-second hovers
  succeeded. The 100 negative controls and 100 fault flights failed as expected/reported.
  Exact headless outputs are in reports/reliability-v3.json. Cloud authentication and
  database isolation require testing against the connected project before use.

This change is a software reliability upgrade, NOT a claim of a 10/10 simulator,
independent aircraft validation, or authorization to fly a physical aircraft.
Production releases are tracked through the repository pull requests and deployment checks.

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
the conversational backend; recorded benchmark audits use deterministic statistics. This reduces open-ended command coverage to avoid
allowing an LLM to invent executable values. It is not a general natural-language
mission planner. Review the complete interpreted configuration before approval.
Arbitrary unsupported phrasing still needs a stricter grammar/coverage review.
Payload mass versus total mass must be set separately in the advanced editor.
The legacy cloud hydration helper is retained for compatibility/tests, not execution.

## Verified locally

- Baseline: 46 of 47 existing tests passed; one UI assertion referenced stale branding.
- Initial upgrade: 64 tests passed, including 17 reliability tests. The original
  350-episode catalog subsequently passed in GitHub Actions and locally using the
  standard Node tsx import hook (the tsx CLI's IPC listener was unavailable).
- Second pass: 100 tests passed, including adversarial commands, provenance,
  confidence intervals and world-frame velocity tracking from +/-90 degree headings.
- Expanded catalog: seven fixtures x three seeds x 50 episodes = 1,050 episodes.
  All completed 16-second hover with zero crashes and mean altitude error below 0.1 m.
- Additional 250 episodes: 50 sixty-second hover missions succeeded; 50 insufficient-
  thrust and 50 battery-depletion controls failed as intended. Fifty single-motor-out
  flights and fifty all-fault flights failed; these are NOT flight-recovery passes.
- Raw results and exact fixture inputs are in reports/reliability-v2.json. This is a
  headless software regression record, not a manufacturer endurance comparison.
- These are source-level/headless and mocked component checks, not visual browser QA.

## Second-pass changes and limits

- UI/Aether reference profiles cite Bitcraze's stock brushed and 2023 brushless
  maximum-thrust references. Profile constants match those inputs by construction;
  this does not validate a thrust-versus-throttle curve or predict physical flight time.
  Brushless reference uses 55 mm props and an approximate 50 mm arm length. Later
  production variants must not be silently treated as this 2023 reference configuration.
- Generic propulsion remains uncalibrated. No universal coefficient was adjusted just
  to make the two nano test cases pass. Hardware edits invalidate retained rotor data.
- Unsupported recognized aircraft names, conflicting mass/voltage/speed/count inputs,
  fractional counts/seeds, unsupported units and ambiguous wind speeds now block execution.
  Leading-decimal/scientific notation, fault synonyms, sensor/randomization negation and
  run-N-times are handled. This is still a bounded grammar, not unrestricted language.
- Direct benchmarks validate seeds, initial-condition ranges and fault booleans. Positive
  thrust with zero power, zero-authority curves and conflicting curve maxima are rejected.
- Benchmark records include executed mission, hardware, faults, sensors, propulsion evidence,
  simulator version and request settings. Aether separates these from current editor state.
  RL weights are not embedded; reproducing an RL run still requires the original policy.
- Wilson 95% intervals express sampling uncertainty conditional on the simulated settings.
  They do not cover model error, seed overlap across batches or real-aircraft reliability.
- Exact quaternion initialization and heading-aware velocity demands fix frame inconsistency.
  Aggressive maneuvers, all geometries and the full heading envelope remain unvalidated.
- Failure-to-takeoff has a five-second deadline in benchmark execution. Live UI mission
  deadlines and general sustained-tracking-error deadlines still require further work.

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
6. Add sustained-error deadlines, mission-relative position errors,
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
    npm run ci:adversarial

Server checking uses noEmit + Bundler resolution because the supported server scripts
run through tsx; this configuration does not promise executable emitted NodeNext JS.

## Compatibility

Controller/physics trajectories intentionally change. Saved policies may be invalid
under the new dynamics and must be reevaluated. Model load failures in the worker now
fail the benchmark instead of silently substituting a heuristic controller. The legacy
numeric-only heuristic API still uses demo hardware defaults; pass PhysicsConfig for
configuration-aware behavior. Live simulation and the shared benchmark do so.
