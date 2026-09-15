// Generic maximum-thrust estimate. NOT a calibrated motor/propeller dataset.
// Use PhysicsConfig.propulsionCurve or maxThrustPerMotorN for explicit measured inputs.
// No guarantee that a real aircraft is represented by diameter and voltage alone.

export const MAX_THRUST_K         = 0.55;   // empirical constant (N)
export const MAX_THRUST_V_REF     = 14.8;   // reference voltage (V)
export const MAX_TORQUE_Q_OVER_T  = 0.016;  // yaw-torque / thrust ratio (m)  (~Ct_Q/Ct_T)

/**
 * Maximum static thrust a single motor+propeller pair can produce at its
 * configured battery voltage. Always strictly positive — a zero return would
 * break the mixer saturation path.
 *
 * @param propDiameterIn  Propeller diameter in inches
 * @param batteryVoltage  Pack voltage (V)
 */
export function maxThrustPerMotor(propDiameterIn: number, batteryVoltage: number): number {
  const d = Math.max(0.5, propDiameterIn);               // guard nano props
  const v = Math.max(1.0, batteryVoltage);               // guard dead battery
  const T = MAX_THRUST_K * Math.pow(d, 1.5) * Math.sqrt(v / MAX_THRUST_V_REF);
  return Math.max(0.05, T);                              // never zero
}

/**
 * Maximum yaw-torque a single motor can produce at saturation.
 * Motor counter-torque ≈ thrust × (Ct_Q / Ct_T) · R. We fold radius into
 * the ratio to stay dimensionless-per-motor and keep the mixer arithmetic
 * aligned with UniversalMixer's small 0.05 coefficient.
 */
export function maxYawTorquePerMotor(propDiameterIn: number, batteryVoltage: number): number {
  return maxThrustPerMotor(propDiameterIn, batteryVoltage) * MAX_TORQUE_Q_OVER_T * propDiameterIn;
}

/**
 * Calibrate raw BET thrust against the physical motor ceiling.
 *
 * The Blade-Element-Theory model in physics/core.ts was tuned for 15" APC MR
 * propellers at OMEGA_MAX = 1200 rad/s. When the user configures a nano prop
 * (1.5" Crazyflie) or a heavy-lift prop (22" U11), the raw BET output does
 * not match the motor's actual max static thrust — small props are under-
 * estimated (BET assumes low tip speed) and very large props are over-
 * estimated (supersonic tip speeds the motor can never reach).
 *
 * This function returns a multiplicative scale factor so that:
 *
 *   calibratedThrust(tc = +1) == maxThrustPerMotor(D, V)
 *
 * while preserving the BET response shape (θ ↔ CT curve). Apply by
 * multiplying raw BET thrust:
 *
 *   calibrated = rawBET * betCalibration(rawBETatMax, D, V)
 */
export function betCalibration(
  betThrustAtTcMax: number,
  propDiameterIn: number,
  batteryVoltage: number,
): number {
  const T_max = maxThrustPerMotor(propDiameterIn, batteryVoltage);
  return T_max / Math.max(1e-6, betThrustAtTcMax);
}

/**
 * Saturate a per-motor thrust vector to physical limits.
 *
 * Returns { thrusts, saturated } where `saturated = true` if ANY motor was
 * clipped. Controllers can use this flag to detect loss-of-authority.
 */
export function saturateMotorThrusts(thrusts: number[], maxPerMotor: number): {
  thrusts: number[];
  saturated: boolean;
} {
  let saturated = false;
  const out = thrusts.map(t => {
    const c = Math.max(0, Math.min(maxPerMotor, t));
    if (c !== t) saturated = true;
    return c;
  });
  return { thrusts: out, saturated };
}
