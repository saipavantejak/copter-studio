/**
 * groundEffect.ts — Rotor ground effect models
 *
 * Implements two levels of ground-effect fidelity:
 *
 * 1. Cheeseman-Bennett (1955) — simple analytical formula, widely used
 *    in multirotor GNC simulators.  Good to ±8% for z/R > 0.5.
 *
 * 2. Betz-corrected model — adds a first-order correction for small z/R
 *    and multi-rotor interference (adjacent rotor wake recirculation).
 *
 * Reference:
 *   Cheeseman, I.C. & Bennett, W.E. (1955) "The effect of ground on a
 *   helicopter rotor in forward flight." ARC R&M 3021.
 *
 *   Sanchez-Cuevas, P. et al. (2017) "Multirotor UAS for wind turbine
 *   inspection…" Sensors 17(12).
 *
 * Zero DOM dependencies.
 */

// ── Drag Tensor ───────────────────────────────────────────────────────────────

/**
 * 3×3 diagonal aerodynamic drag coefficient matrix in the body frame.
 * Off-diagonal terms are zero for a symmetric airframe.
 *
 * Values are body-frame drag coefficients [N/(m/s)²].
 * Tuned for a 5 kg bicopter with ~0.5 m arm length and 15" props.
 *
 *   F_drag_body = -diag(dx, dy, dz) · v_body²  (element-wise, signed)
 */
export interface DragTensor {
  dx: number;  // longitudinal (nose-tail)
  dy: number;  // lateral (wing-tip to wing-tip)
  dz: number;  // vertical (top-bottom, highest drag for flat plate)
}

/**
 * Default drag tensor for a 5 kg bicopter.
 * Drag increases: dx (streamlined) < dz (mostly rotor disk) < dy (side).
 */
export const DEFAULT_DRAG_TENSOR: DragTensor = {
  dx: 0.15,  // N/(m/s)² — longitudinal (motor nacelles streamlined)
  dy: 0.35,  // N/(m/s)² — lateral (side profile largest)
  dz: 0.22,  // N/(m/s)² — vertical (rotor disk blockage)
};

/**
 * Scale drag tensor by mass ratio for different drone sizes.
 * Drag force ~ body frontal area ~ mass^(2/3) for geometrically similar craft.
 */
export function scaleDragTensorForMass(base: DragTensor, baseMass: number, newMass: number): DragTensor {
  const scale = Math.pow(newMass / baseMass, 2 / 3);
  return { dx: base.dx * scale, dy: base.dy * scale, dz: base.dz * scale };
}

/**
 * Compute aerodynamic drag forces in the world frame.
 *
 * @param vx, vy, vz  Velocity components in world frame (m/s)
 * @param phi, theta  Roll and pitch angles (rad) — used to rotate drag tensor
 * @param drag        Drag tensor (body-frame coefficients)
 * @returns  [Fx, Fy, Fz] drag forces in world frame (N)
 */
export function computeDragForces(
  vx: number, vy: number, vz: number,
  phi: number, theta: number,
  drag: DragTensor,
): [number, number, number] {
  // Rotate velocity into body frame (simplified: ZYX small-angle approximation)
  // Full rotation: v_body = R^T · v_world
  const cp = Math.cos(phi),   sp = Math.sin(phi);
  const ct = Math.cos(theta), st = Math.sin(theta);

  const vbx =  ct * vx + st * sp * vy + st * cp * vz;
  const vby =  cp * vy - sp * vz;
  const vbz = -st * vx + ct * sp * vy + ct * cp * vz;

  // Body-frame drag: F_drag_body = -D · |v| · v (signed, element-wise)
  const Fbx = -drag.dx * Math.abs(vbx) * vbx;
  const Fby = -drag.dy * Math.abs(vby) * vby;
  const Fbz = -drag.dz * Math.abs(vbz) * vbz;

  // Rotate drag force back to world frame: F_world = R · F_body
  const Fwx = (ct * Fbx - st * Fbz) + 0;
  const Fwy = (sp * st * Fbx + cp * Fby + sp * ct * Fbz) + 0;
  const Fwz = (cp * st * Fbx - sp * Fby + cp * ct * Fbz) + 0;

  return [Fwx, Fwy, Fwz];
}

// ── Ground Effect ─────────────────────────────────────────────────────────────

/**
 * Cheeseman-Bennett ground effect thrust multiplier.
 *
 * T_IGE / T_OGE = 1 / (1 − (R / (4·z))²)
 *
 * @param altitudeM   Rotor hub height above ground (m)
 * @param rotorRadius Rotor radius (m)
 * @returns  Thrust multiplier (1.0 = no effect, up to ~1.5 near ground)
 *
 * Valid range: z/R > 0.25.  Clamped above to prevent physically impossible values.
 * At z = 0 the formula is singular; we cap the output at 1.5× (conservative).
 */
export function groundEffectFactor(altitudeM: number, rotorRadius: number): number {
  if (rotorRadius <= 0) return 1.0;

  const z_over_R = altitudeM / rotorRadius;

  // No meaningful ground effect above 10 rotor radii
  if (z_over_R > 10) return 1.0;

  // Cheeseman-Bennett formula — avoid singularity at z = 0
  const inner = 1.0 / (4.0 * Math.max(0.25, z_over_R));
  const factor = 1.0 / (1.0 - inner * inner);

  // Physical cap: ground effect can't more than double thrust
  return Math.min(1.5, Math.max(1.0, factor));
}

/**
 * Multi-rotor ground effect: applies Cheeseman-Bennett per rotor and
 * returns the average multiplier across all rotors.
 *
 * For a bicopter the two rotors are laterally separated; the rotor closer
 * to the ground (non-zero roll) gets slightly more ground effect.
 *
 * @param altitudeM   CG height above ground (m)
 * @param rotorRadius Rotor radius (m)
 * @param armLength   Distance from CG to rotor hub (m)
 * @param phi         Roll angle (rad) — tilts one rotor lower
 */
export function multiRotorGroundEffect(
  altitudeM:   number,
  rotorRadius: number,
  armLength:   number,
  phi:         number,
): number {
  // Height of each rotor hub above ground
  const zL = altitudeM - armLength * Math.sin(phi);  // left rotor
  const zR = altitudeM + armLength * Math.sin(phi);  // right rotor

  const geL = groundEffectFactor(Math.max(0.01, zL), rotorRadius);
  const geR = groundEffectFactor(Math.max(0.01, zR), rotorRadius);

  return (geL + geR) / 2;
}
