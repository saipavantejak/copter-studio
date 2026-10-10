# Frozen study wind calibration / physical parameterization

Plan commit: bf89608. Implemented before policy work or any controller evaluation. This is the one required physics correction; all study candidates and baseline use this identical opt-in model thereafter. The interactive/default and historical engine paths are unchanged when studyWindModel is undefined.

Sources accessed 2026-10-10:
- [Bitcraze Crazyflie 2.1 datasheet source](https://github.com/bitcraze/hardware/blob/master/src/products/crazyflie-2_1/datasheet/index.md), mechanical specifications: manufacturer envelope 92×92×29 mm, mass 29 g. The horizontal frontal rectangle is modeled as 0.092×0.029=0.002668 m². This bounding-envelope proxy includes empty space and is not a measured projected solid area.
- [NASA Glenn drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/): D=0.5 rho Cd V² A, with consistent reference area. Use air-minus-vehicle horizontal relative velocity so force opposes motion relative to air.
- [NASA Glenn effects of shape on drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/effects-of-shape-on-drag/): flat-plate Cd=1.28 referenced to projected frontal area. We apply this as a conservative bluff-body proxy; no source says the actual Crazyflie Cd is 1.28. Matching Reynolds number, rotor-flow interactions, attitude-dependent area and measured-force validation remain missing. It is not a guaranteed upper bound on real aerodynamic force.
- Air density 1.225 kg/m³ is the repository sea-level nominal constant, not a fitted value.

Registered vector force in N: 0.5×1.225×1.28×0.002668×|u|×u, u=(ambient wind−horizontal vehicle velocity) in m/s. Units and force direction are tested. No arbitrary force cap, mass-scaled wind force or post-hoc severity tuning is used.

The mild ambient gust components are fixed at (2 sin(phi)+sin(k phi))×log(1+z)/log(31), capped ramp 1, with k=2.3 for x and 1.7 for y, phase rates 0.5/0.7 rad/s. At 1 m altitude each ambient component is bounded by 0.605548 m/s; the stationary horizontal force-vector magnitude is bounded by approximately 0.001534 N (both component bounds used simultaneously). This is a predeclared low-altitude mild-wind test, not severe weather or measured gust data. Calm has ambient wind zero but the same relative-air drag.

Success is unchanged: no engine failure, all 1,000 steps executed, at least 119 of final 125 steps meet the existing DEFAULT_MISSION limits. Qualification is baseline-only on 510001–510100; accepted if >=20% successes, <=20% engine failures, all finite. If it fails, do not change parameters: drop the wind benchmark and do not claim a two-scenario gate pass. Qualification has not yet run at this commit.
