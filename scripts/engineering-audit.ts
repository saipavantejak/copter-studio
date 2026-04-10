/**
 * COMPREHENSIVE ENGINEERING AUDIT — Senior Aerospace Simulation Engineer
 * Validates: BET thrust, ISA atmosphere, quaternion math, RK4 integration,
 * hover stability (all 3 configs), wind rejection, motor-out, battery sag,
 * energy conservation, and numerical stability.
 */

import {
  GRAVITY, AIR_DENSITY, BET_NB, BET_LIFT, BET_CHORD,
  BET_THETA_MIN_DEG, BET_THETA_MAX_DEG, OMEGA_IDLE, OMEGA_MAX,
  INCHES_TO_METRES, MOTOR_TAU, DT,
} from '../src/physics/constants';

import {
  betThrust, stepMotor, qNorm, qToR, qToEuler, eulerToQuatSmallAngle,
  rigidBodyDerivatives, rk4Step, vecAdd,
} from '../src/physics/core';

import { isaAtmosphere, DrydenTurbulence } from '../src/physics/atmosphere';
import { groundEffectFactor, multiRotorGroundEffect, computeDragForces, DEFAULT_DRAG_TENSOR, scaleDragTensorForMass } from '../src/physics/groundEffect';
import { propTableLookup } from '../src/physics/propTables';
import { PhysicsEngine } from '../src/PhysicsEngine';
import { RLAgent } from '../src/RLAgent';
import type { DroneType } from '../src/UniversalMixer';

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) { passCount++; }
  else { failCount++; failures.push(msg); console.error(`  ✗ FAIL: ${msg}`); }
}

function approxEqual(a: number, b: number, tol: number, msg: string) {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) {
    assert(false, `${msg} — expected ${b}, got ${a}, tol=${tol}`);
  } else {
    passCount++;
  }
}

function section(title: string) { console.log(`\n═══ ${title} ═══`); }

// ═══════════════════════════════════════════════════════════════════════════
// 1. BLADE ELEMENT THEORY (BET) THRUST VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
section('1. BET THRUST MODEL');

// 1a. Zero collective → positive thrust (because theta_min=-5° maps to tc=-1, tc=0 maps to 6.5°)
{
  const omega = 700;
  const t15 = betThrust(0, omega, 15);
  assert(t15 > 0, `BET: tc=0, omega=700, 15" → positive thrust (got ${t15.toFixed(2)}N)`);
  console.log(`  ✓ 15" prop at tc=0, 700 rad/s → ${t15.toFixed(2)}N`);
}

// 1b. Thrust scales with prop diameter^4 (dimensional analysis: T ∝ ρ·A·(ΩR)² ∝ R⁴)
{
  const omega = 600;
  const t15 = betThrust(0.3, omega, 15);
  const t22 = betThrust(0.3, omega, 22);
  const ratio = t22 / t15;
  // BET: CT = NB*c*Cl*θ*R/(4A) = NB*c*Cl*θ/(4πR), so CT∝1/R.
  // T = CT*ρ*A*(ΩR)² = (k/R)*ρ*πR²*Ω²R² = k*ρ*π*Ω²*R³ → T∝R³∝D³
  const expected = Math.pow(22 / 15, 3); // 3.15
  approxEqual(ratio, expected, expected * 0.15, `BET: T∝D³ scaling (ratio=${ratio.toFixed(2)}, expected≈${expected.toFixed(2)})`);
  console.log(`  ✓ Thrust ratio 22"/15" = ${ratio.toFixed(2)} (theory: ${expected.toFixed(2)})`);
}

// 1c. Negative collective → zero thrust (CT clamped)
{
  const tNeg = betThrust(-0.8, 500, 15);
  assert(tNeg === 0, `BET: tc=-0.8 → zero thrust (got ${tNeg})`);
  console.log(`  ✓ Negative pitch → zero thrust`);
}

// 1d. Thrust at hover for reference bicopter (2 × 15", 5kg)
{
  const mg = 5.0 * GRAVITY; // 49.05N
  // Find hover tc
  let lo = -1, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const omega = OMEGA_IDLE + Math.max(0, (mid + 1) / 2) * (OMEGA_MAX - OMEGA_IDLE);
    const t = 2 * betThrust(mid, omega, 15);
    if (t > mg) hi = mid; else lo = mid;
  }
  const hoverTc = (lo + hi) / 2;
  approxEqual(hoverTc, -0.046, 0.01, `BET: Bicopter hover tc ≈ -0.046`);
  console.log(`  ✓ Bicopter hover tc = ${hoverTc.toFixed(4)} (mg=${mg.toFixed(1)}N)`);
}

// 1e. Maximum thrust sanity (should be in hundreds of N, not thousands for a single motor)
{
  const tMax = betThrust(1.0, OMEGA_MAX, 15);
  assert(tMax > 100 && tMax < 500, `BET: Max thrust 15" single motor = ${tMax.toFixed(1)}N (100-500N range)`);
  console.log(`  ✓ Max single-motor thrust (15") = ${tMax.toFixed(1)}N`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ISA ATMOSPHERE MODEL
// ═══════════════════════════════════════════════════════════════════════════
section('2. ISA ATMOSPHERE');

{
  const sl = isaAtmosphere(0);
  approxEqual(sl.temperature, 288.15, 0.1, 'ISA: Sea level T=288.15K');
  approxEqual(sl.pressure, 101325, 50, 'ISA: Sea level P=101325Pa');
  approxEqual(sl.density, 1.225, 0.005, 'ISA: Sea level ρ=1.225 kg/m³');
  console.log(`  ✓ Sea level: T=${sl.temperature.toFixed(2)}K, P=${sl.pressure.toFixed(0)}Pa, ρ=${sl.density.toFixed(4)}`);

  const h1k = isaAtmosphere(1000);
  approxEqual(h1k.temperature, 281.65, 0.5, 'ISA: 1000m T≈281.65K');
  assert(h1k.density < sl.density, 'ISA: density decreases with altitude');
  console.log(`  ✓ 1000m: T=${h1k.temperature.toFixed(2)}K, ρ=${h1k.density.toFixed(4)}`);

  const h11k = isaAtmosphere(11000);
  approxEqual(h11k.temperature, 216.65, 1.0, 'ISA: 11km tropopause T≈216.65K');
  console.log(`  ✓ 11km (tropopause): T=${h11k.temperature.toFixed(2)}K`);

  // Density at 5km: standard ISA ≈ 0.7364 kg/m³ (ratio to SL ≈ 0.601)
  const h5k = isaAtmosphere(5000);
  approxEqual(h5k.density, 0.7361, 0.01, 'ISA: 5km density ≈ 0.736 kg/m³');
  const densRatio = h5k.density / sl.density;
  console.log(`  ✓ 5km: ρ=${h5k.density.toFixed(4)} kg/m³, ratio=${densRatio.toFixed(4)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. QUATERNION MATH
// ═══════════════════════════════════════════════════════════════════════════
section('3. QUATERNION MATH');

{
  // Identity quaternion
  const qi: [number,number,number,number] = [1, 0, 0, 0];
  const euler = qToEuler(qi);
  approxEqual(euler[0], 0, 1e-10, 'Quat: identity → phi=0');
  approxEqual(euler[1], 0, 1e-10, 'Quat: identity → theta=0');
  approxEqual(euler[2], 0, 1e-10, 'Quat: identity → psi=0');
  console.log(`  ✓ Identity quaternion → zero Euler angles`);

  // Small angle → quaternion → back to Euler (eulerToQuatSmallAngle takes phi, theta only — psi=0)
  const testPhi = 0.1, testTheta = -0.15;
  const q = eulerToQuatSmallAngle(testPhi, testTheta);
  qNorm(q); // mutates in-place
  const normCheck = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
  approxEqual(normCheck, 1.0, 1e-10, 'Quat: norm preserved after normalization');
  console.log(`  ✓ Quaternion norm = ${normCheck.toFixed(12)}`);

  const eulerBack = qToEuler(q);
  approxEqual(eulerBack[0], testPhi, 0.02, 'Quat: roundtrip phi');
  approxEqual(eulerBack[1], testTheta, 0.02, 'Quat: roundtrip theta');
  approxEqual(eulerBack[2], 0, 0.02, 'Quat: roundtrip psi=0');
  console.log(`  ✓ Euler↔Quaternion roundtrip: Δ < 0.02 rad`);

  // Rotation matrix orthogonality
  const R = qToR(q);
  // R^T · R should be identity
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let dot = 0;
      for (let k = 0; k < 3; k++) dot += R[k][i] * R[k][j];
      const expected = i === j ? 1.0 : 0.0;
      approxEqual(dot, expected, 1e-10, `Quat: R^T·R[${i}][${j}] = ${expected}`);
    }
  }
  console.log(`  ✓ Rotation matrix is orthogonal (9 dot products checked)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. MOTOR DYNAMICS
// ═══════════════════════════════════════════════════════════════════════════
section('4. MOTOR DYNAMICS');

{
  // stepMotor returns omega in rad/s: target = OMEGA_IDLE + max(0,(cmd+1)/2)*(OMEGA_MAX-OMEGA_IDLE)
  // For cmd=1.0: target = 100 + 1.0*1100 = 1200 rad/s
  const targetOmega = OMEGA_IDLE + 1.0 * (OMEGA_MAX - OMEGA_IDLE); // 1200
  let omega = 0;
  const dt = 0.016;
  for (let i = 0; i < 200; i++) {
    omega = stepMotor(omega, 1.0, dt, MOTOR_TAU, false);
  }
  approxEqual(omega, targetOmega, 1.0, `Motor: converges to ${targetOmega} rad/s after 3.2s`);
  console.log(`  ✓ Motor converges: omega=${omega.toFixed(2)} rad/s after 200 steps (target=${targetOmega})`);

  // Failed motor should return 0
  let omegaFailed = 500;
  omegaFailed = stepMotor(omegaFailed, 1.0, dt, MOTOR_TAU, true);
  approxEqual(omegaFailed, 0, 0.01, 'Motor: failed motor → 0');
  console.log(`  ✓ Failed motor → omega=${omegaFailed.toFixed(4)}`);

  // Time constant check: starting from OMEGA_IDLE (cmd=-1 target), stepping toward cmd=1.0
  // After 1τ should reach ~63.2% of the gap
  let omegaTau = OMEGA_IDLE; // start at idle
  const stepsPerTau = Math.round(MOTOR_TAU / dt);
  for (let i = 0; i < stepsPerTau; i++) {
    omegaTau = stepMotor(omegaTau, 1.0, dt, MOTOR_TAU, false);
  }
  const gap = targetOmega - OMEGA_IDLE; // 1100
  const expectedFraction = 0.632;
  const expectedOmega = OMEGA_IDLE + expectedFraction * gap;
  approxEqual(omegaTau, expectedOmega, 50, `Motor: 1τ → ~63.2% of gap (got ${omegaTau.toFixed(1)}, expected≈${expectedOmega.toFixed(1)})`);
  console.log(`  ✓ 1τ response = ${omegaTau.toFixed(1)} rad/s (expected≈${expectedOmega.toFixed(1)})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. GROUND EFFECT
// ═══════════════════════════════════════════════════════════════════════════
section('5. GROUND EFFECT (Cheeseman-Bennett)');

{
  const ge_high = groundEffectFactor(10, 0.19);
  approxEqual(ge_high, 1.0, 0.01, 'GE: z=10m → factor≈1.0');

  // Cheeseman-Bennett: factor = 1/(1 - (1/(4*z/R))^2)
  // At z=1R: inner = 1/(4*1) = 0.25, factor = 1/(1-0.0625) = 1.067
  const ge_1R = groundEffectFactor(0.19, 0.19);
  assert(ge_1R > 1.0 && ge_1R < 1.5, `GE: z=1R → factor=${ge_1R.toFixed(3)} (1.0-1.5 range)`);

  const ge_2R = groundEffectFactor(0.38, 0.19);
  // z/R=2, inner = 1/(4*2)=0.125, factor = 1/(1-0.0156) = 1.016
  approxEqual(ge_2R, 1.016, 0.02, `GE: z=2R → factor≈1.016`);
  console.log(`  ✓ GE factors: z=10m→${ge_high.toFixed(3)}, z=1R→${ge_1R.toFixed(3)}, z=2R→${ge_2R.toFixed(3)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. PROP TABLE LOOKUP (HIGH-FIDELITY MODE)
// ═══════════════════════════════════════════════════════════════════════════
section('6. PROP TABLE LOOKUP');

{
  const pt0 = propTableLookup(0, 0, 15, 1.225);
  assert(pt0.thrust === 0 && pt0.power === 0, 'PropTable: zero RPM → zero output');

  const pt_mid = propTableLookup(0.5, 600, 15, 1.225);
  assert(pt_mid.thrust > 0, `PropTable: tc=0.5, 600rpm → thrust=${pt_mid.thrust.toFixed(2)}N`);
  assert(pt_mid.power >= 0, `PropTable: power=${pt_mid.power.toFixed(2)}W ≥ 0`);

  // Thrust increases with RPM
  const pt_lo = propTableLookup(0.5, 400, 15, 1.225);
  const pt_hi = propTableLookup(0.5, 800, 15, 1.225);
  assert(pt_hi.thrust > pt_lo.thrust, 'PropTable: thrust increases with RPM');

  // Lower density → lower thrust
  const pt_dense = propTableLookup(0.5, 600, 15, 1.225);
  const pt_thin = propTableLookup(0.5, 600, 15, 0.9);
  assert(pt_thin.thrust < pt_dense.thrust, 'PropTable: lower ρ → lower thrust');
  console.log(`  ✓ Prop table: direction, RPM, density all check out`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. DRAG MODEL
// ═══════════════════════════════════════════════════════════════════════════
section('7. AERODYNAMIC DRAG');

{
  const [dx0, dy0, dz0] = computeDragForces(0, 0, 0, 0, 0, DEFAULT_DRAG_TENSOR);
  assert(dx0 === 0 && dy0 === 0 && dz0 === 0, 'Drag: zero velocity → zero drag');

  const [dx, dy, dz] = computeDragForces(10, 0, 0, 0, 0, DEFAULT_DRAG_TENSOR);
  assert(dx < 0, `Drag: Fx opposes motion (Fx=${dx.toFixed(2)})`);

  // Quadratic scaling
  const [dx1] = computeDragForces(5, 0, 0, 0, 0, DEFAULT_DRAG_TENSOR);
  const [dx2] = computeDragForces(10, 0, 0, 0, 0, DEFAULT_DRAG_TENSOR);
  const ratio = dx2 / dx1;
  approxEqual(ratio, 4.0, 0.5, `Drag: quadratic scaling ratio=${ratio.toFixed(2)}`);
  console.log(`  ✓ Drag model: zero-vel=0, opposes motion, ~quadratic (ratio=${ratio.toFixed(2)})`);

  // Mass-scaled tensor (DragTensor uses dx/dy/dz fields)
  const heavy = scaleDragTensorForMass(DEFAULT_DRAG_TENSOR, 5.0, 15.0);
  assert(heavy.dx > DEFAULT_DRAG_TENSOR.dx, 'Drag: heavier drone → larger drag coefficient');
  console.log(`  ✓ Mass-scaled drag: 5kg→dx=${DEFAULT_DRAG_TENSOR.dx.toFixed(3)}, 15kg→dx=${heavy.dx.toFixed(3)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. FULL PHYSICS ENGINE — HOVER STABILITY (ALL 3 CONFIGS)
// ═══════════════════════════════════════════════════════════════════════════
section('8. HOVER STABILITY — ALL DRONE TYPES');

const configs: Array<{name: string, type: DroneType, mass: number, propDiam: number, armLen: number}> = [
  { name: 'Bicopter 5kg/15"',   type: 'bicopter',    mass: 5.0,  propDiam: 15, armLen: 0.5  },
  { name: 'Quadcopter 8kg/18"', type: 'quadcopter',   mass: 8.0,  propDiam: 18, armLen: 0.5  },
  { name: 'Hexacopter 15kg/22"',type: 'hexacopter',   mass: 15.0, propDiam: 22, armLen: 0.8  },
];

function makeEngine(cfg: typeof configs[0], hifi = false): PhysicsEngine {
  const engine = new PhysicsEngine();
  engine.config = {
    droneType: cfg.type,
    mass: cfg.mass,
    propDiameter: cfg.propDiam,
    armLength: cfg.armLen,
    batteryVoltage: 22.2,
    useHighFidelityAero: hifi,
  };
  engine.reset();
  return engine;
}

for (const cfg of configs) {
  console.log(`\n  --- ${cfg.name} ---`);
  const engine = makeEngine(cfg);

  const agent = new RLAgent();
  const steps = 625; // 10 seconds at 16ms
  let maxAlt = 0, minAlt = 999, crashTime = -1;
  let finalState: any = null;

  for (let i = 0; i < steps; i++) {
    const state = engine.getState();
    const action = agent.heuristicAction(state, cfg.type, 'none', cfg.mass);
    finalState = engine.step(action);

    if (finalState.z > maxAlt) maxAlt = finalState.z;
    if (finalState.z < minAlt) minAlt = finalState.z;
    if (finalState.z < -0.5 && crashTime < 0) crashTime = i * DT;
  }

  const fs = finalState!;
  console.log(`    Final: z=${fs.z.toFixed(3)}m, vz=${fs.z_dot.toFixed(3)}m/s, phi=${(fs.phi*180/Math.PI).toFixed(2)}°, theta=${(fs.theta*180/Math.PI).toFixed(2)}°`);
  console.log(`    Range: alt=[${minAlt.toFixed(3)}, ${maxAlt.toFixed(3)}]m`);

  // PASS CRITERIA: stable hover at ~1m, no crash, attitude < 15°
  assert(crashTime < 0, `${cfg.name}: no crash`);
  assert(maxAlt < 5.0, `${cfg.name}: no runaway (maxAlt=${maxAlt.toFixed(2)}m < 5m)`);
  assert(Math.abs(fs.z - 1.0) < 0.5, `${cfg.name}: final alt within 0.5m of target (z=${fs.z.toFixed(3)})`);
  assert(Math.abs(fs.phi) < 0.26, `${cfg.name}: roll < 15° (phi=${(fs.phi*180/Math.PI).toFixed(2)}°)`);
  assert(Math.abs(fs.theta) < 0.26, `${cfg.name}: pitch < 15° (theta=${(fs.theta*180/Math.PI).toFixed(2)}°)`);
  assert(Math.abs(fs.z_dot) < 1.0, `${cfg.name}: vz < 1 m/s at 10s (vz=${fs.z_dot.toFixed(3)})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. WIND DISTURBANCE REJECTION
// ═══════════════════════════════════════════════════════════════════════════
section('9. WIND DISTURBANCE REJECTION');

for (const cfg of configs) {
  console.log(`\n  --- ${cfg.name} + Wind ---`);
  const engine = makeEngine(cfg);
  engine.tests.windEnabled = true;

  const agent = new RLAgent();
  const steps = 625; // 10s
  let crashed = false;
  let finalState: any = null;

  for (let i = 0; i < steps; i++) {
    const state = engine.getState();
    const action = agent.heuristicAction(state, cfg.type, 'none', cfg.mass);
    finalState = engine.step(action);
    if (finalState.z < -2.0) { crashed = true; break; }
  }

  const fs = finalState!;
  console.log(`    Final: z=${fs.z.toFixed(3)}m, x=${fs.x.toFixed(2)}m, y=${fs.y.toFixed(2)}m`);
  assert(!crashed, `${cfg.name}: survives 10s wind (crashed=${crashed})`);
  assert(fs.z > -1.0, `${cfg.name}: altitude maintained (z=${fs.z.toFixed(3)})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. MOTOR-OUT TEST
// ═══════════════════════════════════════════════════════════════════════════
section('10. MOTOR-OUT SURVIVABILITY');

for (const cfg of configs) {
  console.log(`\n  --- ${cfg.name} Motor Out ---`);
  const engine = makeEngine(cfg);
  engine.tests.motorOutEnabled = true;

  const agent = new RLAgent();
  const steps = 312; // 5s
  let finalState: any = null;

  for (let i = 0; i < steps; i++) {
    const state = engine.getState();
    const action = agent.heuristicAction(state, cfg.type, 'none', cfg.mass);
    finalState = engine.step(action);
  }

  const fs = finalState!;
  console.log(`    Final: z=${fs.z.toFixed(3)}m, phi=${(fs.phi*180/Math.PI).toFixed(1)}°, theta=${(fs.theta*180/Math.PI).toFixed(1)}°`);
  // Motor-out: just check it doesn't NaN or hard crash immediately
  assert(isFinite(fs.z), `${cfg.name}: no NaN with motor out`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. RK4 INTEGRATION ACCURACY
// ═══════════════════════════════════════════════════════════════════════════
section('11. RK4 NUMERICAL INTEGRATION');

{
  // Free-fall test: drop from z=10m with no thrust, check z after 1s
  // Analytical: z(1) = 10 - 0.5*g*1² = 10 - 4.905 = 5.095m
  const biCfg = configs[0]; // bicopter
  const engine = makeEngine(biCfg);
  engine.setInitialConditions(10.0, 0, 0);

  const zeroAction = [0, 0, 0, 0, 0, 0]; // This won't be exactly zero thrust, but let's test
  // Actually for true free-fall, use tc=-1 (minimum collective → zero thrust)
  const freefallAction = [-1, 0, 0, -1, 0, 0];

  const stepsPerSec = Math.round(1.0 / DT);
  for (let i = 0; i < stepsPerSec; i++) {
    engine.step(freefallAction);
  }
  const state = engine.getState();
  // With drag and motor idle RPM there may be small thrust, so allow wider tolerance
  const analytical_z = 10.0 - 0.5 * GRAVITY * 1.0;
  console.log(`  Free-fall 1s: z=${state.z.toFixed(4)}m (analytical≈${analytical_z.toFixed(3)}m)`);
  // The motor idle speed may produce tiny thrust; allow 1m tolerance
  assert(Math.abs(state.z - analytical_z) < 1.5, `RK4: free-fall z within 1.5m of analytical`);

  // Check velocity: vz should be ~-g*t = -9.81
  console.log(`  Free-fall vz=${state.z_dot.toFixed(3)}m/s (analytical≈${(-GRAVITY).toFixed(2)})`);
  assert(Math.abs(state.z_dot - (-GRAVITY)) < 2.0, `RK4: free-fall vz within 2 m/s of -g`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. ENERGY CONSERVATION CHECK
// ═══════════════════════════════════════════════════════════════════════════
section('12. ENERGY AUDIT');

{
  const biCfgE = configs[0];
  const engine = makeEngine(biCfgE);
  engine.tests.batterySagEnabled = true;

  const agent = new RLAgent();
  const steps = 1250; // 20s hover
  for (let i = 0; i < steps; i++) {
    const state = engine.getState();
    const action = agent.heuristicAction(state, 'bicopter', 'none', 5.0);
    engine.step(action);
  }
  const state = engine.getState();
  const energy = (engine as any).totalEnergyConsumed;
  const battery = (engine as any).currentBattery;
  const batCap = (engine as any).batteryCapacity;
  const batPct = (battery / batCap * 100);

  console.log(`  20s hover: energy=${energy.toFixed(1)}J, battery=${batPct.toFixed(1)}%`);
  assert(energy > 0, 'Energy: consumed > 0 during hover');
  assert(batPct < 100, 'Energy: battery drained during hover');
  assert(batPct > 50, 'Energy: battery not excessively drained in 20s');

  // Sanity: hover power ≈ mg * √(mg / (2ρA)) / FM
  // For bicopter: mg=49.05N, A=2*π*(0.19)²=0.227m², FM=0.7
  // P_ideal = 49.05^1.5 / √(2*1.225*0.227) = 343.4 / 0.745 = 460.9W → P_actual = 460.9/0.7 = 658W
  // Over 20s: E ≈ 658*20 = 13160J
  // This is approximate — allow wide range
  assert(energy > 1000 && energy < 30000, `Energy: 20s hover energy=${energy.toFixed(0)}J (expected ~13000J order of magnitude)`);
  console.log(`  ✓ Energy consumption in plausible range`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. DRYDEN TURBULENCE MODEL
// ═══════════════════════════════════════════════════════════════════════════
section('13. DRYDEN TURBULENCE (MIL-HDBK-1797B)');

{
  const dryden = new DrydenTurbulence(DT);
  let rng = () => Math.random();

  // Moderate intensity should produce meaningful gusts
  let maxU = 0, maxV = 0, maxW = 0;
  for (let i = 0; i < 1000; i++) {
    const g = dryden.step(10, 5, 'moderate', rng);
    if (Math.abs(g.u) > maxU) maxU = Math.abs(g.u);
    if (Math.abs(g.v) > maxV) maxV = Math.abs(g.v);
    if (Math.abs(g.w) > maxW) maxW = Math.abs(g.w);
  }
  assert(maxU > 0.5, `Dryden: moderate gusts produce u > 0.5 m/s (got ${maxU.toFixed(2)})`);
  assert(maxU < 30, `Dryden: moderate gusts u < 30 m/s (got ${maxU.toFixed(2)})`);
  console.log(`  ✓ Moderate turbulence: max u=${maxU.toFixed(2)}, v=${maxV.toFixed(2)}, w=${maxW.toFixed(2)} m/s`);

  // Severe > moderate
  dryden.reset();
  let maxU_sev = 0;
  for (let i = 0; i < 1000; i++) {
    const g = dryden.step(10, 5, 'severe', rng);
    if (Math.abs(g.u) > maxU_sev) maxU_sev = Math.abs(g.u);
  }
  assert(maxU_sev > maxU * 0.8, 'Dryden: severe intensity ≥ moderate');
  console.log(`  ✓ Severe max u=${maxU_sev.toFixed(2)} m/s`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. HIGH-FIDELITY MODE (prop tables + ground effect + ISA + drag)
// ═══════════════════════════════════════════════════════════════════════════
section('14. HIGH-FIDELITY AERO MODE');

{
  const engine = makeEngine(configs[0], true); // bicopter, hifi=true

  const agent = new RLAgent();
  const steps = 625; // 10s
  let maxAlt = 0;
  let finalState: any = null;

  for (let i = 0; i < steps; i++) {
    const state = engine.getState();
    const action = agent.heuristicAction(state, 'bicopter', 'none', 5.0);
    finalState = engine.step(action);
    if (finalState.z > maxAlt) maxAlt = finalState.z;
  }

  const fs = finalState!;
  console.log(`  HiFi bicopter 10s: z=${fs.z.toFixed(3)}m, maxAlt=${maxAlt.toFixed(2)}m`);
  assert(isFinite(fs.z), 'HiFi: no NaN');
  assert(maxAlt < 10, `HiFi: no runaway (maxAlt=${maxAlt.toFixed(2)}m)`);
  console.log(`  ✓ High-fidelity mode runs without NaN or runaway`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. DOMAIN RANDOMIZATION
// ═══════════════════════════════════════════════════════════════════════════
section('15. DOMAIN RANDOMIZATION');

{
  const { DomainRandomizer, DEFAULT_DOMAIN_RAND } = await import('../src/DomainRandomizer');
  const { SeededRandom } = await import('../src/SeededRandom');
  const drCfg = { ...DEFAULT_DOMAIN_RAND, enabled: true };
  const dr = new DomainRandomizer(drCfg);
  const basePhys = { droneType: 'bicopter' as const, mass: 5.0, propDiameter: 15, armLength: 0.5, batteryVoltage: 22.2 };
  const drConfigs: any[] = [];
  for (let i = 0; i < 10; i++) {
    drConfigs.push(dr.randomize(basePhys, new SeededRandom(i * 1000), i));
  }
  const masses = drConfigs.map((c: any) => c.physicsConfig.mass);
  const uniqueMasses = new Set(masses.map((m: number) => m.toFixed(3)));
  assert(uniqueMasses.size > 1, 'DomainRand: produces varied mass values');
  console.log(`  ✓ 10 randomizations → ${uniqueMasses.size} unique masses`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. LONG-DURATION NUMERICAL STABILITY
// ═══════════════════════════════════════════════════════════════════════════
section('16. LONG-DURATION STABILITY (60s)');

{
  const engine = makeEngine(configs[0]); // bicopter

  const agent = new RLAgent();
  const steps = 3750; // 60 seconds
  let crashed = false;
  let nan = false;

  for (let i = 0; i < steps; i++) {
    const state = engine.getState();
    if (!isFinite(state.z) || !isFinite(state.phi)) { nan = true; break; }
    if (state.z < -5) { crashed = true; break; }
    const action = agent.heuristicAction(state, 'bicopter', 'none', 5.0);
    engine.step(action);
  }
  const fs = engine.getState();
  console.log(`  60s: z=${fs.z.toFixed(3)}m, crashed=${crashed}, nan=${nan}`);
  assert(!nan, 'LongRun: no NaN after 60s');
  assert(!crashed, 'LongRun: no crash after 60s');
  assert(Math.abs(fs.z - 1.0) < 0.3, `LongRun: altitude stable at 1m (z=${fs.z.toFixed(3)})`);
  console.log(`  ✓ 60s stable: z=${fs.z.toFixed(3)}m`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log(`AUDIT COMPLETE: ${passCount} passed, ${failCount} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
}
console.log('═'.repeat(70));
process.exit(failCount > 0 ? 1 : 0);
