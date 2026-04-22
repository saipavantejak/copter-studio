// Numerical validation of the four physics refactors.
// Run with: npx tsx scripts/validate-physics-refactor.ts

import { PhysicsEngine } from '../src/PhysicsEngine';
import { RLAgent } from '../src/RLAgent';
import { maxThrustPerMotor } from '../src/physics/thrustLimits';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const results: { name: string; ok: boolean; note: string }[] = [];

function check(name: string, ok: boolean, note: string) {
  results.push({ name, ok, note });
  console.log(`  ${ok ? PASS : FAIL}  ${name}  —  ${note}`);
}

function makeEngine(cfg: any) {
  const e = new PhysicsEngine();
  (e as any).config = cfg;
  e.reset();
  return e;
}

// ── 1. Energy model: DJI Phantom-class 1.5 kg quad on 10" props ─────────────
{
  console.log('\n[1] Actuator-disk momentum-theory hover power');
  const e = makeEngine({ droneType: 'quadcopter', mass: 1.5, propDiameter: 10, batteryVoltage: 14.8, armLength: 0.2 });
  const agent = new RLAgent();
  // Settle: run 6 s @ 16 ms → 375 steps
  for (let i = 0; i < 400; i++) {
    const s = e.getState();
    const a = agent.heuristicAction(s, 'quadcopter', 'none', 1.5);
    e.step(a);
  }
  const p = e.lastPowerW;
  const ok = p > 80 && p < 260;
  check('1.5 kg / 10" quad hover power', ok, `measured ${p.toFixed(1)} W (DJI Phantom 4 ≈ 160 W)`);
  check('NOT the old 3 W underestimate', p > 20, `${p.toFixed(1)} W >> 3 W`);
}

// ── 2. Nano drone: Crazyflie 27 g on 1.5" props ─────────────────────────────
{
  console.log('\n[2] Nano drone — Crazyflie 27 g');
  const e = makeEngine({ droneType: 'quadcopter', mass: 0.027, propDiameter: 1.5, batteryVoltage: 3.7, armLength: 0.046 });
  const agent = new RLAgent();
  for (let i = 0; i < 400; i++) {
    const s = e.getState();
    const a = agent.heuristicAction(s, 'quadcopter', 'none', 0.027);
    e.step(a);
  }
  const p = e.lastPowerW;
  const st = e.getState();
  check('hover power in 0.5 – 8 W range', p > 0.5 && p < 8, `measured ${p.toFixed(2)} W (Crazyflie ≈ 2 W)`);
  check('altitude is finite', Number.isFinite(st.z), `z = ${st.z.toFixed(3)} m`);
  check('no NaN in state', Number.isFinite(st.x_dot) && Number.isFinite(st.phi), 'all finite');
}

// ── 3. Altitude SS error for 1.5 kg quad ─────────────────────────────────────
{
  console.log('\n[3] Altitude steady-state error (target z = 1.0 m)');
  const e = makeEngine({ droneType: 'quadcopter', mass: 1.5, propDiameter: 10, batteryVoltage: 14.8, armLength: 0.2 });
  const agent = new RLAgent();
  for (let i = 0; i < 1200; i++) { // 19 s settle
    const s = e.getState();
    const a = agent.heuristicAction(s, 'quadcopter', 'none', 1.5);
    e.step(a);
  }
  const err = Math.abs(1.0 - e.getState().z);
  check('|z - 1.0 m| < 5 cm', err < 0.05, `error = ${(err * 100).toFixed(2)} cm`);
  check('|z - 1.0 m| NOT ≈ 1 m (old bug)', err < 0.2, 'feed-forward cancelled gravity offset');
}

// ── 4. Actuator saturation with wind + mass mismatch ─────────────────────────
{
  console.log('\n[4] Actuator saturation under domain randomization');
  const T_max = maxThrustPerMotor(22, 44.4);
  const trueMass = 17.25; // 15% heavier than 15 kg preset
  const mg = trueMass * 9.81;
  const totalMax = 6 * T_max;
  check('Heavy-Hex max thrust finite', T_max > 10 && T_max < 200, `T_max per motor = ${T_max.toFixed(1)} N`);
  check('At 115% mass hover is still feasible', totalMax > mg * 1.2, `${totalMax.toFixed(0)} N vs ${mg.toFixed(0)} N needed`);

  // Severe stress: motor-out + heavy overweight + wind. Under this scenario
  // the remaining 5 motors on a 17 kg hex cannot maintain attitude without
  // some of them clipping at T_max — saturation MUST trigger.
  const e = makeEngine({ droneType: 'hexacopter', mass: 17.25, propDiameter: 22, batteryVoltage: 44.4, armLength: 0.8 });
  (e as any).tests = { windEnabled: true, payloadShiftEnabled: true, batterySagEnabled: false, motorOutEnabled: true, missionPreset: 'none' };
  const agent = new RLAgent();
  let sawSaturation = false;
  for (let i = 0; i < 600; i++) {
    const s = e.getState();
    const a = agent.heuristicAction(s, 'hexacopter', 'none', 17.25);
    e.step(a);
    if (e.lastSaturated) sawSaturation = true;
  }
  check('saturation flag triggered under extreme stress', sawSaturation, 'motor-out + wind + 15% overweight → clipping');
}

// ── 5. SEC never NaN ─────────────────────────────────────────────────────────
await (async () => {
  console.log('\n[5] SEC edge-case handling (no NaN)');
  const { MissionLogic } = await import('../src/MissionLogic');
  // Case A: nano drone with distance zero
  const metrics1 = MissionLogic.calculateMetrics(
    { droneType: 'quadcopter', mass: 0.027, propDiameter: 1.5, batteryVoltage: 3.7, armLength: 0.046 },
    { x: 0, y: 0, z: 1, x_dot: 0, y_dot: 0, z_dot: 0, phi: 0, theta: 0, psi: 0, p: 0, q: 0, r: 0, battery: 1, droneType: 'quadcopter', time: 1, energyConsumed: 2, motorOmegas: [] },
    [],
    2,
    0,
  );
  check('nano-drone hover → sec finite (0)', Number.isFinite(metrics1.sec), `sec = ${metrics1.sec}`);
  check('nano-drone hover → hoverPowerW finite', Number.isFinite(metrics1.hoverPowerW), `hoverPowerW = ${metrics1.hoverPowerW}`);

  // Case B: cargo drone with distance > 0
  const metrics2 = MissionLogic.calculateMetrics(
    { droneType: 'quadcopter', mass: 8.0, propDiameter: 18, batteryVoltage: 22.2, armLength: 0.6 },
    { x: 100, y: 0, z: 1, x_dot: 5, y_dot: 0, z_dot: 0, phi: 0, theta: 0, psi: 0, p: 0, q: 0, r: 0, battery: 0.5, droneType: 'quadcopter', time: 20, energyConsumed: 5000, motorOmegas: [] },
    [],
    5000,
    100,
  );
  check('cargo drone → sec finite', Number.isFinite(metrics2.sec), `sec = ${metrics2.sec.toFixed(4)}`);
})();

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────');
const pass = results.filter(r => r.ok).length;
console.log(`${pass} / ${results.length} checks passed`);
if (pass < results.length) process.exit(1);
