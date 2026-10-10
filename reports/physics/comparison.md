# Public flight diagnostic

**Negative accuracy finding:** the longer-horizon errors do not support a flight-accuracy claim. Physical validation remains false. No parameter was fitted or changed after these results.

## Scope

This compares the production rigid-body `rk4Step` and timestep quaternion normalization with logged Brushless flights. It bypasses the full PhysicsEngine actuator, aerodynamic, battery, contact, sensor and controller pipeline. It uses the dataset authors' force conversion and loaded-aircraft mass/inertia, rather than the brushed Q-learning reference configuration. These are externally supplied inputs, not independently validated physical parameters.

The public dataset is [IDSIA nanodrone-sysid-benchmark](https://github.com/idsia-robotics/nanodrone-sysid-benchmark), pinned at `2d921b57d166fe2debe08a5d39bd07297c5abc39`. The original repository lacked time-aligned flight logs; this diagnostic uses newly located external data. The upstream authors label the three Melon flights as test data. No fitting uses them here.

## All flights

| Input file | Rows | Windows per horizon | Horizon (s) | Position RMSE (m) | Velocity RMSE (m/s) | Attitude RMSE (rad) | Body-rate RMSE (rad/s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| data/test/melon_20251017_run1.csv | 6499 | 129 | 0.01 | 0.001335 | 0.008661 | 0.003207 | 0.516031 |
| data/test/melon_20251017_run1.csv | 6499 | 129 | 0.50 | 0.806411 | 4.166051 | 1.678415 | 23.642698 |
| data/test/melon_20251017_run2.csv | 6499 | 129 | 0.01 | 0.001654 | 0.010976 | 0.003422 | 0.528419 |
| data/test/melon_20251017_run2.csv | 6499 | 129 | 0.50 | 0.812877 | 4.235871 | 1.809587 | 24.183932 |
| data/test/melon_20251017_run3.csv | 6499 | 129 | 0.01 | 0.003704 | 0.035041 | 0.003765 | 0.523799 |
| data/test/melon_20251017_run3.csv | 6499 | 129 | 0.50 | 0.807448 | 4.236258 | 1.833120 | 24.454668 |

## Descriptive intervals across independent flight units

| Horizon (s) | Metric | Mean per-flight RMSE | 95% flight-bootstrap CI | Independent flights |
|---|---|---:|---|---:|
| 0.01 | positionM | 0.002231 | [0.001335, 0.003704] | 3 |
| 0.01 | velocityMps | 0.018226 | [0.008661, 0.035041] | 3 |
| 0.01 | attitudeRad | 0.003464 | [0.003207, 0.003765] | 3 |
| 0.01 | bodyRateRadps | 0.522750 | [0.516031, 0.528419] | 3 |
| 0.50 | positionM | 0.808912 | [0.806411, 0.812877] | 3 |
| 0.50 | velocityMps | 4.212727 | [4.166051, 4.236258] | 3 |
| 0.50 | attitudeRad | 1.773707 | [1.678415, 1.833120] | 3 |
| 0.50 | bodyRateRadps | 24.093766 | [23.642698, 24.454668] | 3 |

Each flight is an independent unit; overlapping clock history and within-flight windows are not independent flights. Only three flights limit bootstrap coverage. The source clock spacing and horizons were frozen before prediction. The one-step position error is dominated by a short propagation interval and does not establish long-horizon physical accuracy. No statistical-significance or controller-robustness claim is made.

Long-horizon disagreement may reflect model/parameter mismatch and unmodeled dynamics; this diagnostic does not identify their individual contributions. No measured data were used to improve the simulator. Motor lag, BET and command-to-thrust, production mixer, drag/gust response, battery cutoff/endurance, sensor timing/noise, contact, full flight control and the brushed residual policy remain unvalidated.

## Reproduction and verification

The [preregistration](preregistration.md) and scripts were committed before execution. [flight-comparison.json](flight-comparison.json) contains raw predicted/reference states, all input hashes and execution-source hashes; [independent-verifier.json](independent-verifier.json) recomputes their metrics without production imports; [determinism.json](determinism.json) records double clean-worktree replay.

```bash
git clone https://github.com/idsia-robotics/nanodrone-sysid-benchmark.git /tmp/copter-flight-data
git -C /tmp/copter-flight-data checkout 2d921b57d166fe2debe08a5d39bd07297c5abc39
git worktree add --detach /tmp/copter-physics-source e9e1874f42b8cf73f0889347d0eb77f5753eb0f2
cd /tmp/copter-physics-source
npm ci
node --import tsx scripts/physics/compare-flight.ts /tmp/copter-flight-data
python scripts/physics/verify-flight.py
```

For double replay from the registered execution source use `python scripts/physics/replay-compare.py /tmp/copter-flight-data`. The upstream dataset is fetched rather than vendored; its source does not provide an explicit dataset redistribution license. Availability of a public repository does not imply a redistribution grant.

Independent verification: 820 passing checks, 0 failures. Numerical checks certify recorded-data consistency, not physical-model adequacy.
