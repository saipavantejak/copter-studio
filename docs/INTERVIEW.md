# Interview guide

## RK4 as implemented

`src/physics/core.ts:rk4Step` integrates the rigid-body state using stage slopes:

```text
k1 = f(y)
k2 = f(y + dt*k1/2)
k3 = f(y + dt*k2/2)
k4 = f(y + dt*k3)
y_next = y + dt*(k1 + 2*k2 + 2*k3 + k4)/6
```

Taylor expansion of these stages matches the smooth differential equation's
series through the fourth-order term. The local truncation remainder is of
fifth order; fixed-step global error is fourth order under smoothness and
stability assumptions. The analytic and timestep convergence tests check this
held-force subsystem, not convergence order of the entire coupled engine.

State contains position, world velocity, quaternion and body angular velocity.
Stage derivatives recompute orientation and rotational coupling, but input
forces and wind remain frozen throughout the step. The caller normalizes the
quaternion afterward; motor response, contact and force updates are outside
this integrator. A discontinuous contact or a frozen actuator force does not
inherit textbook full-system RK4 accuracy.

## Blade-element approximation

`betThrust` maps collective into pitch angle, calculates radius R and disk
area A, then uses the simplified coefficient and thrust expressions:

```text
CT = max(0, Nb * chord * liftSlope * theta * R / (4*A))
T = CT * airDensity * A * (omega*R)^2
```

Constants currently specify 2 blades, lift slope
5.7 per radian and chord 0.025 m.
This is a simplified blade-element-inspired approximation, not a radial
integration with resolved airfoils, dynamic inflow or validated stall behavior.
The engine also applies motor dynamics, available-thrust constraints and
calibration paths; the formula alone does not certify aircraft accuracy.
The diagnostic flight errors and missing dynamics are reported openly.

## Q-learning update and numeric example

The script holds the selected residual during a decision block, sums the
original per-step reward, and updates the visited state/action pair:

```text
Q <- Q + alpha * (blockReward + gamma * max(Q(next)) - Q)
```

Terminal transitions omit the bootstrap term. The state bins altitude error
and vertical speed; a residual adjusts the existing collective controller.
For the selected candidate, alpha decays with visits; evaluation is greedy and
must leave the tables unchanged. Gamma is applied per decision, not per physics
step, so changing the hold interval changes the temporal discount horizon.

Worked arithmetic (illustrative inputs, not an observed episode): Q=-10,
blockReward=-1.6, next maximum=-8, gamma=0.97, alpha=0.1.
Target is -9.36, TD error is 0.64, and updated Q is
-9.936. These values are recomputed by the document generator.
The selected schedule uses the visit count before incrementing; it is not the
constant-alpha schedule used in this arithmetic illustration.

## Project narrative

I built a browser drone simulator with shared physics primitives, reproducible
benchmarks and an AI assistant that proposes validated local actions. My first
residual Q-learning experiment lost to the engineering controller in calm
conditions, while the original wind benchmark failed every flight and could
not discriminate controllers. I kept the baseline and audited the experiment
rather than reporting a win.

I then preregistered a bounded study, corrected the wind scenario with a declared
physical proxy and selected a candidate using validation only. It passed the
unchanged held-out simulation gate, but the altitude difference is small and
the selected candidate bundles training budget and learning-rate decay. I added
independent raw-record verification, deterministic replay, explicit limitations
and server-side AI boundaries. External flight logs show poor longer-horizon
model agreement; I keep physicalValidation=false and the live baseline active.
I can explain the evidence, the negative results and what remains unvalidated.
