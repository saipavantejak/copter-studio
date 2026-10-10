# Pre-registration: residual Q-learning improvement study

Starting commit: ef9b7ad. Written and committed before study execution. Simulation only; no measured-flight validation. Negative results are acceptable. No publication is authorized by this request; commits remain local.

## Ordered execution and stopping

1. Commit this plan before experiments. Read external primary calibration sources without running controllers.
2. In a separate commit implement a study-only horizontal wind-force model: vector drag F = 0.5 rho Cd A |v_air-v_vehicle| (v_air-v_vehicle). Use sea-level rho=1.225 kg/m³, Crazyflie 2.1 bounding-box frontal area 0.092×0.029=0.002668 m², and Cd=1.28 as an explicit flat-plate proxy, not a measured aircraft drag fit. Verify geometry against Bitcraze specifications and coefficient/equation against NASA before committing. If sources do not support those inputs, stop before running any controller; do not silently replace values.
3. Freeze a mild synthetic sinusoidal scenario: per-axis components [2 sin(phi_x)+1 sin(2.3 phi_x), 2 sin(phi_y)+1 sin(1.7 phi_y)] m/s, random seed phases, angular frequencies 0.5/0.7 rad/s, existing logarithmic altitude ramp log(1+max(z,0))/log(31), capped at 1. Calm has no ambient wind but the same relative-air drag. No vertical wind or changed propulsion/controller dynamics. Implement via an explicit opt-in study configuration; legacy physics stays available.
4. Commit all study code, tests and protocol before baseline qualification, training or validation. Assess only baseline on qualification seeds 510001–510100. Wind qualifies if success fraction >=0.20, engine-failure fraction <=0.20, and every result is finite. A 100% success rate is allowed: reward/altitude error can discriminate policies even if success rates saturate. Do not modify wind after this check. If it fails, report that wind remains nondiscriminating and drop it; the unchanged two-scenario gate cannot be claimed passed. Still record six candidate calm validation results and select a diagnostic candidate for the single calm final test. Overall conclusion B in that case.
5. Run six candidates exactly as specified below, with the same three training streams per candidate. No combinations, additions or follow-up tuning. Record the unchanged reference Q-learning configuration as a descriptive control, excluded from candidate selection and six-candidate multiplicity correction.
6. Select once using validation only: eligible candidates satisfy the original candidate gate on validation in each of the three training runs, and their Bonferroni-adjusted reward-difference interval lower bound is >=0 in both scenarios with >0 in at least one. Among eligible candidates maximize min(mean reward difference over scenarios); tie: listed order. If none eligible, select the candidate with largest min(mean reward difference) for a diagnostic final test; tie: listed order. Never choose a training-seed winner; all three trained policies accompany the selected candidate.
7. Freeze selection in a separate committed file/artifact before final evaluation. Evaluate the selected candidate exactly once on final banks; no fitting, selection or parameter editing afterward. If it fails, stop. Do not inspect final seeds in smoke/unit tests. Subsequent reproduction of the identical fixed test is a replay, not a new study or permission to tune.

## Six one-factor candidates and hypotheses

Common settings: Crazyflie 2.1 reference config; unchanged original reward and success criteria; 600 alternating calm/wind training episodes, alpha=0.1, gamma=0.97 per decision, epsilon linearly 0.3→0.03, 1,000 physics steps per episode, hold=8, actions [0,-0.04,-0.02,0.02,0.04], original 9 vertical-speed bins and shared Q-table. Q values start at zero; ties favor action zero. The training reference and every candidate use the frozen calibrated study physics. Each candidate changes ONLY its listed factor.

| ID | Exact change | Hypothesis |
|---|---|---|
| a | Replace altitude-error cuts [-.5,-.25,-.1,-.03,.03,.1,.25,.5] with [-.5,-.25,-.1,-.05,-.02,-.01,-.005,.005,.01,.02,.05,.1,.25,.5]; vertical-speed bins unchanged (15×9 states) | Better resolution near hover avoids aliased opposing corrections |
| b | Keep original bins; add three tilt bins for max(abs(roll),abs(pitch)), cuts [0.05,0.15] rad (81×3 states) | Attitude observes some missing vertical-thrust effects |
| c | Keep original bins/hold; actions [0,-.01,-.005,.005,.01] | Smaller corrections preserve baseline precision |
| d | Keep original bins/actions; hold=2 physics steps; gamma remains .97 per decision | Faster residual updates reduce stale corrections; this changes the temporal decision horizon too, which must be reported |
| e | Original bins/actions/hold; separate calm and wind Q/visit tables | Avoid incompatible regime updates |
| f | Original bins/actions/hold/shared table; 3,000 training episodes; alpha=0.1/(1+stateActionVisits/100), using visits before each update; epsilon linearly .3→.03 over all episodes | More coverage with diminishing updates improves stability; bundled episode-budget/alpha factor as requested |

No reward changes are permitted. The reward is the ORIGINAL sum of negative absolute altitude error, 0.05×absolute vertical speed and 0.1×absolute residual command each physics step; engine failure adds -(100+1000-executedSteps). Completed tracking misses receive no new penalty.

## Seeds, metrics, confidence and gate

Training exploration seeds: 424001, 424002, 424003. Training IC banks start 710001, 720001, 730001 respectively; each candidate uses first 600 or 3,000 seeds as specified. No consumed evaluation banks are used. Training mixes calm and calibrated wind on alternate episodes even if qualification later drops wind; this is fixed to retain the common training design.

Validation calm 500001–500100; wind 501001–501100. Qualification 510001–510100 is baseline-only and not used for fitting or selection beyond the predeclared benchmark eligibility check. Final calm 600001–600200; wind 601001–601200. Final banks are untouched until final stage. All policies share IC seeds for paired comparisons. Each stage uses a frozen Q-table, epsilon zero, no updates. Baseline trajectories are unique observations; repeats across training runs are not independent trials.

Primary metric: original mean reward difference, policy minus engineering baseline, separately in each scenario. Also report original conditional altitude error, successes, engine failures, non-successes, mean executed steps and outcome reasons, per run and pooled across policies.

Crossed percentile bootstrap: 50,000 replicates; independently resample three training-run indices and the shared episode-seed indices, preserving baseline-policy pairing. RNG bootstrap seeds are 900001 + 100×candidateIndex + 10×scenarioIndex + metricIndex, with candidateIndex=0..5 and metricIndex reward=0, altitude=1, success=2, engineFailure=3. Report ordinary two-sided 95% intervals AND Bonferroni simultaneous validation intervals at 1-0.05/(6×2)=99.5833333333% for the twelve primary candidate/scenario reward comparisons. For the single selected final candidate report ordinary 95% intervals plus two-scenario Bonferroni 97.5% reward intervals. Other metric CIs are descriptive, not multiplicity-corrected superiority claims. Bootstrap intervals with only three training seeds have limited coverage guarantees; degenerate binary intervals do not establish equality.

Unchanged gate per candidate run: no worse success count, engine-failure count or mean reward in BOTH scenarios; strict mean reward improvement in at least one. Require all three selected policies to pass; do not choose a favorable seed. A legitimate conclusion A additionally requires the final two-scenario adjusted reward lower bounds >=0 in both scenarios and >0 in one; otherwise B. This adds evidence requirements, never loosens the original gate. Any physical promotion remains false because physicalValidation=false, even if a simulation gate passes.

## Provenance and reporting

Regenerate residual-policy.json only with the committed study training script after frozen selection. Include plan SHA-256, calibration and training-code commits, exact commands, all source hashes, training/evaluation seeds, policies and raw outcomes. Preserve audit-era artifacts as archives; never hand-edit result JSON. README and study audit must retain all six validation outcomes including negatives, final outcome, limitations and reproduction commands. If no original-gate pass on final data, promoted=false, conclusion B, stop with no further test iteration.
