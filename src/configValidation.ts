import type { PhysicsConfig } from './PhysicsEngine';

/** Software limits, NOT a declaration of physical calibration or flight safety. */
export const CONFIG_LIMITS = {
  mass: [0.02, 100], propDiameter: [0.5, 60], batteryVoltage: [1, 100], armLength: [0.01, 5],
} as const;

export function configErrors(config: PhysicsConfig): string[] {
  const errors: string[] = [];
  if (!['bicopter', 'quadcopter', 'hexacopter'].includes(config.droneType)) errors.push('Unsupported drone type');
  for (const [key, range] of Object.entries(CONFIG_LIMITS)) {
    const value = config[key as keyof typeof CONFIG_LIMITS];
    if (!Number.isFinite(value) || value < range[0] || value > range[1]) errors.push(`${key} must be finite and within ${range[0]}–${range[1]}; input was not changed`);
  }
  for (const key of ['batteryCapacity', 'maxThrustPerMotorN'] as const) {
    if (config[key] !== undefined && (!Number.isFinite(config[key]) || config[key]! <= 0)) errors.push(`${key} must be positive and finite`);
  }
  if (config.payloadMassKg !== undefined && (!Number.isFinite(config.payloadMassKg) || config.payloadMassKg < 0 || config.payloadMassKg > config.mass)) errors.push('Payload must be between zero and total mass');
  if (config.inertiaOverride) {
    const { Ixx, Iyy, Izz } = config.inertiaOverride;
    if (![Ixx, Iyy, Izz].every(v => Number.isFinite(v) && v > 0) || Ixx > Iyy + Izz || Iyy > Ixx + Izz || Izz > Ixx + Iyy) errors.push('Invalid principal inertia tensor');
  }
  if (config.propulsionCurve) {
    const curve = config.propulsionCurve;
    if (!Array.isArray(curve)) { errors.push('Propulsion curve must be an array'); return errors; }
    if (curve.some(p => !p || typeof p !== 'object')) { errors.push('Invalid propulsion point'); return errors; }
    if (curve.length < 2 || curve[0]?.command !== -1 || curve[curve.length - 1]?.command !== 1) errors.push('Propulsion curve must span commands -1 to 1 with at least two points');
    curve.forEach((p, i) => {
      if (![p.command, p.thrustN, p.powerW].every(Number.isFinite) || p.thrustN < 0 || p.powerW < 0 || (i > 0 && (p.command <= curve[i - 1].command || p.thrustN < curve[i - 1].thrustN))) errors.push('Invalid or non-monotonic propulsion curve');
    });
  }
  return errors;
}

export function assertValidConfig(config: PhysicsConfig): void {
  const errors = configErrors(config);
  if (errors.length) throw new Error(errors.join('; '));
}
