"""Render maintained overview/interview/resume directly from verified inputs."""
import json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
load=lambda p:json.loads((root/p).read_text())
p=load('reports/study/final.json');r=load('reports/reliability-v3.json')
core=(root/'src/physics/core.ts').read_text(); experiment=(root/'scripts/learning/study/experiment.ts').read_text()
assert 'dt / 6' in core and '2*k2[i] + 2*k3[i]' in core
assert 'q[state][a]+=alpha*(reward+(terminal?0:STUDY.gammaPerDecision*Math.max(...q[next]))-q[state][a])' in experiment
constants=(root/'src/physics/constants.ts').read_text()
constant=lambda name:float(re.search(r'export const '+name+r'\s*=\s*([-\d.]+)',constants)[1])
rows=[]
for x in p['results']:
 b,a=x['baseline'],x['policy'];d=x['comparisons']['reward'];e=x['comparisons']['meanAltitudeErrorM']
 ci=lambda v:'['+', '.join(f'{t:.4f}' for t in v)+']'
 rows.append(f"| {'Mild synthetic wind' if x['wind'] else 'Calm'} | {b['meanReward']:.2f} / {a['meanReward']:.2f} | {d['estimate']:.4f} {ci(d['ci95'])} | {ci(d['adjustedCI'])} | {b['meanAltitudeErrorM']:.4f} / {a['meanAltitudeErrorM']:.4f} | {e['estimate']:.4f} {ci(e['ci95'])} |")
c,w=p['results'];n=c['baseline']['episodes']
old=(root/'README.md').read_text();begin='<!-- BEGIN GENERATED ML EVALUATION -->';end='<!-- END GENERATED ML EVALUATION -->'
block=old[old.index(begin):old.index(end)+len(end)]
readme=f'''# Copter Studios

Browser-based drone simulation, reproducible controller evaluation and a bounded
AI planning assistant. [Live demo](https://copterstudios.com) ·
[Report feedback](https://github.com/saipavantejak/copter-studio/issues/new)

## Results at a glance

**{r['unitTestsPassed']} software tests pass** in the recorded reliability run
(`reports/reliability-v3.json`); CI reruns tests, type checks, build and independent
claim verification. The live site runs the baseline controller. Changes on this
branch are local and have not been deployed.

The preregistered study evaluated {len(load('reports/study/validation.json')['candidates'])}
candidates with {p['trainingSeedCount']} independent training seeds each. Selection
used validation only. The selected candidate used {p['trainingEpisodes']} training
episodes per seed; the final test used {n} shared episode seeds per scenario.
Baseline has {n} unique flights per scenario; policy aggregates pool
{c['policy']['episodes']} flights from {p['trainingSeedCount']} training runs, not
that many independent training units. Every controller completed all held-out
missions; this mild wind benchmark demonstrates no wind-robustness gain.

| Scenario | Reward baseline / policy | Reward difference, 95% crossed CI | Multiplicity-adjusted reward CI | Altitude error baseline / policy (m) | Altitude-error difference (m), 95% crossed CI |
|---|---|---|---|---|---|
{chr(10).join(rows)}

Differences are policy minus baseline. Reward intervals adjusted to
{100*c['comparisons']['reward']['adjustedConfidence']:.1f}% account for both final
scenarios. Error intervals are descriptive, not additional corrected hypothesis
tests. Crossed bootstrap resamples training seeds and paired episode seeds.
Absolute means and comparison intervals come from `reports/study/final.json`;
`verify-study-independent.mjs` recomputes them from raw records. See
[all candidate results](reports/study/improvement-study.md) and
[claim checks](reports/integrity/claim-to-source.csv).

### Limitations

- Simulation only: physicalValidation=false and promoted=false. A simulation gate pass did not install the learned policy.
- The measured altitude effect is small; candidate f bundles episode budget and learning-rate schedule. Their contributions have not been separated.
- Few independent training runs limit interval coverage; no universal performance guarantee is supported.
- Mild synthetic wind uses a geometry-based drag proxy; it is not measured gust calibration and the baseline success rate is saturated.
- In-repository training data contain static bench measurements and energy summaries, not time-aligned flight logs.
- External Brushless flight logs yielded poor longer-horizon agreement. [The diagnostic](reports/physics/comparison.md) bypasses actuator, aerodynamic, battery, sensor and controller dynamics and does not validate the brushed study configuration.
- Historical inventory rows marked UNVERIFIED are not numeric certifications. No follow-up ablation or matched PPO comparison was performed in this round.
- Lighthouse measurement was invalid in this environment. No performance score or before/after timing improvement is claimed.

## Architecture

```mermaid
flowchart TD
  UI[React workspace] --> Engine[PhysicsEngine and mixer]
  UI --> Worker[Headless benchmark worker]
  Worker --> Engine
  UI --> Gateway[Validated server AI gateway]
  Scripts[Registered study scripts] --> Engine
```

The physics primitives are shared by browser, worker and Node evaluation.
Aether proposes a bounded plan; local validation and user approval precede
execution. Gemini credentials stay server-side. Optional cloud failures do not
change the study result or authorize hardware actions.
[Analytics and privacy](docs/PRIVACY.md) ·
[Security and key exposure evidence](docs/SECURITY.md) ·
[Interview guide](docs/INTERVIEW.md) · [Errata](docs/ERRATA.md).

## Run and verify

```sh
npm ci
npm run dev
npm test
npm run lint
npm run type-check:server
npm run build
node scripts/learning/verify-study-independent.mjs
python scripts/learning/check-inventory.py
python scripts/docs/render-project.py --check
```

The final seed bank is consumed. Do not rerun training/selection/final commands
in this checkout. The deterministic replay helper uses frozen historical source
in clean worktrees and does not tune or select a controller.

## Demo capture

A capture generator is provided instead of an invented screenshot or recording:

```sh
npm run build
npx playwright install chromium
node scripts/product/capture-demo.mjs
```

It hosts the production build and browser together, records actual scripted
interaction and writes `reports/product/demo.webm`. Cloud AI is unavailable in
this isolated preview; no login, real API key or training is needed. A capture
has not been generated in this environment. A recording error must be reported,
not replaced with fabricated footage.

## Study detail

{block}
'''
q=-10;reward=-1.6;nextq=-8;gamma=p['gamma'];alpha=p['alpha'];target=reward+gamma*nextq;updated=q+alpha*(target-q)
interview=f'''# Interview guide

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

Constants currently specify {constant('BET_NB'):g} blades, lift slope
{constant('BET_LIFT'):g} per radian and chord {constant('BET_CHORD'):g} m.
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

Worked arithmetic (illustrative inputs, not an observed episode): Q={q:g},
blockReward={reward:g}, next maximum={nextq:g}, gamma={gamma:g}, alpha={alpha:g}.
Target is {target:.2f}, TD error is {target-q:.2f}, and updated Q is
{updated:.3f}. These values are recomputed by the document generator.
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
'''
resume=f"Built and audited a simulation-only Q-learning controller study with {p['trainingSeedCount']} training seeds; the selected candidate reduced held-out mean altitude error from {c['baseline']['meanAltitudeErrorM']:.4f} to {c['policy']['meanAltitudeErrorM']:.4f} m in calm and from {w['baseline']['meanAltitudeErrorM']:.4f} to {w['policy']['meanAltitudeErrorM']:.4f} m in mild synthetic wind. The live application retains the baseline controller; physical-flight validation and wind-robustness gains are not claimed.\n"
for path,text in [('README.md',readme),('docs/INTERVIEW.md',interview),('docs/RESUME.md',resume)]:
 file=root/path
 if '--check' in sys.argv:
  if not file.exists() or file.read_text()!=text:raise SystemExit('Generated document drift: '+path)
 else:file.write_text(text)
print('Project document claims: PASS')
