// src/physics/core.ts
// Pure functional physics primitives — zero DOM dependencies.
// Importable by browser bundles (via Vite), Node.js (via tsx), and Web Workers.
//
// Shared by:
//   • src/PhysicsEngine.ts     (stateful sim class)
//   • server/gymBridge.ts      (Node WebSocket server)
//   • src/workers/episodeWorker.ts (headless batch benchmark)

import {
  AIR_DENSITY, BET_NB, BET_LIFT, BET_CHORD,
  BET_THETA_MIN_DEG, BET_THETA_MAX_DEG,
  MOTOR_TAU, OMEGA_IDLE, OMEGA_MAX,
  GRAVITY, DT, INCHES_TO_METRES,
} from './constants';

export type Vec = number[];

// ── Quaternion helpers ────────────────────────────────────────────────────────

/** Normalise quaternion in-place. Resets to identity if degenerate. */
export function qNorm(q: Vec): void {
  const n = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
  if (n < 1e-12) {
    // Degenerate quaternion — likely upstream NaN or corruption
    console.warn('[qNorm] Degenerate quaternion detected (norm < 1e-12); resetting to identity');
    q[0]=1; q[1]=q[2]=q[3]=0;
    return;
  }
  for (let i=0; i<4; i++) q[i] /= n;
}

/** Quaternion [w,x,y,z] → 3×3 rotation matrix (body → world). */
export function qToR(q: Vec): number[][] {
  const [w,x,y,z] = q;
  return [
    [1-2*(y*y+z*z),  2*(x*y-w*z),   2*(x*z+w*y)  ],
    [2*(x*y+w*z),    1-2*(x*x+z*z), 2*(y*z-w*x)  ],
    [2*(x*z-w*y),    2*(y*z+w*x),   1-2*(x*x+y*y)],
  ];
}

/** Quaternion → Euler angles [φ roll, θ pitch, ψ yaw] (ZYX convention). */
export function qToEuler(q: Vec): [number,number,number] {
  const [w,x,y,z] = q;
  const phi   = Math.atan2(2*(w*x+y*z), 1-2*(x*x+y*y));
  const sinP  = Math.max(-1, Math.min(1, 2*(w*y-z*x)));
  const theta = Math.asin(sinP);
  const psi   = Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z));
  return [phi, theta, psi];
}

/** Initialise quaternion from small-angle Euler (for IC setup). */
export function eulerToQuatSmallAngle(phi: number, theta: number): Vec {
  const n = Math.sqrt(1 + (phi/2)**2 + (theta/2)**2);
  return [1/n, (phi/2)/n, (theta/2)/n, 0];
}

// ── Blade Element Theory (BET) thrust ────────────────────────────────────────

/**
 * Compute rotor thrust using Blade Element Theory.
 * @param collective  Normalised collective pitch command [-1, 1]
 * @param omega       Rotor angular velocity (rad/s)
 * @param propDiamIn  Propeller diameter in inches
 * @returns Thrust in Newtons
 */
export function betThrust(collective: number, omega: number, propDiamIn: number): number {
  const R  = (propDiamIn * INCHES_TO_METRES) / 2;
  const A  = Math.PI * R * R;
  const thetaDeg = BET_THETA_MIN_DEG + ((collective + 1) / 2) * (BET_THETA_MAX_DEG - BET_THETA_MIN_DEG);
  const theta    = thetaDeg * Math.PI / 180;
  const CT = Math.max(0, (BET_NB * BET_CHORD * BET_LIFT * theta * R) / (4 * A));
  const vTip = omega * R;
  return CT * AIR_DENSITY * A * vTip * vTip;
}

// ── Motor first-order dynamics ────────────────────────────────────────────────

/**
 * Advance motor speed by dt using exact ODE solution:
 *   ω(t+dt) = ωTarget + (ω − ωTarget) · exp(−dt/τ)
 * @param omega    Current rotor speed (rad/s)
 * @param cmd      Normalised throttle command [-1, 1]
 * @param dt       Timestep (s)
 * @param tau      Time constant (s) — defaults to MOTOR_TAU
 * @param failed   If true, motor is failed → return 0
 */
export function stepMotor(
  omega: number, cmd: number, dt: number,
  tau: number = MOTOR_TAU, failed = false
): number {
  if (failed) return 0;
  const omegaTarget = OMEGA_IDLE + Math.max(0, (cmd+1)/2) * (OMEGA_MAX - OMEGA_IDLE);
  return omegaTarget + (omega - omegaTarget) * Math.exp(-dt / tau);
}

// ── RK4 vector helpers ────────────────────────────────────────────────────────

export function vecAdd(a: Vec, b: Vec, scale = 1): Vec {
  return a.map((v, i) => v + b[i] * scale);
}

export interface RigidBodyForces {
  Fz: number;  // total thrust (body z)
  L:  number;  // roll moment (Nm)
  M:  number;  // pitch moment (Nm)
  N:  number;  // yaw moment (Nm)
}

export interface WindForce { fx: number; fy: number; }

/**
 * Compute rigid-body state derivatives for RK4.
 * State vector: [x, y, z, ẋ, ẏ, ż, qw, qx, qy, qz, p, q, r]
 */
export function rigidBodyDerivatives(
  sv: Vec,
  forces: RigidBodyForces,
  wind: WindForce,
  mass: number,
  Ixx: number,
  Iyy: number,
  Izz: number,
): Vec {
  const [,,, xd,yd,zd, qw,qx,qy,qz, pp,qq,rr] = sv;
  const { Fz, L, M, N } = forces;
  const R = qToR([qw,qx,qy,qz]);

  const Fx_e = Fz * R[0][2] + wind.fx;
  const Fy_e = Fz * R[1][2] + wind.fy;
  const Fz_e = Fz * R[2][2] - mass * GRAVITY;

  const p_dot = (L + (Iyy - Izz) * qq * rr) / Ixx;
  const q_dot = (M + (Izz - Ixx) * pp * rr) / Iyy;
  const r_dot = (N + (Ixx - Iyy) * pp * qq) / Izz;

  const dqw = -0.5*(pp*qx + qq*qy + rr*qz);
  const dqx =  0.5*(pp*qw + rr*qy - qq*qz);
  const dqy =  0.5*(qq*qw - rr*qx + pp*qz);
  const dqz =  0.5*(rr*qw + qq*qx - pp*qy);

  return [xd, yd, zd, Fx_e/mass, Fy_e/mass, Fz_e/mass,
          dqw, dqx, dqy, dqz, p_dot, q_dot, r_dot];
}

/**
 * Full RK4 step: integrate rigid-body state by dt.
 * Returns the new state vector.
 *
 * NOTE: Forces and wind are held constant across all four RK4 stages.
 * This is valid when dt (16ms) << τ_wind (~50ms). For higher-frequency
 * force variations, re-evaluate forces at each stage.
 */
export function rk4Step(
  sv0: Vec,
  forces: RigidBodyForces,
  wind: WindForce,
  mass: number,
  Ixx: number,
  Iyy: number,
  Izz: number,
  dt: number = DT,
): Vec {
  const k1 = rigidBodyDerivatives(sv0,                   forces, wind, mass, Ixx, Iyy, Izz);
  const k2 = rigidBodyDerivatives(vecAdd(sv0, k1, dt/2), forces, wind, mass, Ixx, Iyy, Izz);
  const k3 = rigidBodyDerivatives(vecAdd(sv0, k2, dt/2), forces, wind, mass, Ixx, Iyy, Izz);
  const k4 = rigidBodyDerivatives(vecAdd(sv0, k3, dt),   forces, wind, mass, Ixx, Iyy, Izz);
  return sv0.map((v, i) => v + (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]) * dt / 6);
}

/**
 * Ground contact: spring-damper model with Coulomb friction.
 * - Normal force: Kn * penetration + Dn * z_dot (when z < 0)
 * - Friction: mu * |Fn| opposing horizontal velocity
 * - Angular damping on contact, yaw preserved.
 */
export function applyGroundContact(sv: Vec): Vec {
  const out = [...sv];
  if (out[2] < 0) {
    // Spring-damper normal force parameters
    const Kn = 2000;    // spring stiffness (N/m)
    const Dn = 50;      // damping (N·s/m)
    const mu = 0.6;     // Coulomb friction coefficient

    const penetration = -out[2];
    const Fn = Math.max(0, Kn * penetration - Dn * out[5]); // normal force (upward)

    // Apply normal correction: clamp at ground, apply spring impulse to z_dot
    // Use dt=DT and assume 5kg reference mass for standalone ground contact
    const dtGc = 0.016; // simulation timestep
    const massGc = 5.0; // reference mass for standalone function
    out[2] = 0;
    out[5] = Math.max(0, out[5] + Fn * dtGc / massGc);

    // Coulomb friction opposing horizontal velocity
    const vHoriz = Math.sqrt(out[3] ** 2 + out[4] ** 2);
    if (vHoriz > 1e-6) {
      const frictionForce = mu * Fn;
      const frictionDecel = Math.min(frictionForce * dtGc / massGc, vHoriz); // clamp to prevent reversal
      out[3] -= (out[3] / vHoriz) * frictionDecel;
      out[4] -= (out[4] / vHoriz) * frictionDecel;
    }

    // Angular damping — reduce rates but don't zero them instantly
    out[10] *= 0.8;  // p (roll rate)
    out[11] *= 0.8;  // q (pitch rate)
    out[12] *= 0.9;  // r (yaw rate) — less damping, preserves spin

    // Preserve yaw (heading) on ground contact — zero roll/pitch only
    const [,,psi] = qToEuler([out[6], out[7], out[8], out[9]]);
    out[6] = Math.cos(psi / 2);
    out[7] = 0;
    out[8] = 0;
    out[9] = Math.sin(psi / 2);
  }
  return out;
}

// ── Inertia tensor helpers ────────────────────────────────────────────────────

/**
 * Simplified inertia tensor scaled from propeller size, mass, and arm length.
 * Same formula as PhysicsEngine so bridge and sim produce identical dynamics.
 */
export function computeInertia(
  propDiameter: number, mass: number, armLength: number
): { Ixx: number; Iyy: number; Izz: number } {
  const sf  = Math.pow(propDiameter / 15, 2) * (mass / 5.0);
  const arm = armLength;
  return {
    Ixx: 0.1 * sf * (arm / 0.5) ** 2,
    Iyy: 0.1 * sf * (arm / 0.5) ** 2,
    Izz: 0.2 * sf * (arm / 0.5) ** 2,
  };
}
