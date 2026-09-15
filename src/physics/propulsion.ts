import type { PhysicsConfig } from '../PhysicsEngine';
import { betThrust } from './core';
import { OMEGA_IDLE, OMEGA_MAX } from './constants';
import { maxThrustPerMotor, betCalibration } from './thrustLimits';
import { propTableLookup } from './propTables';

/** Measured static per-motor curve at the configured nominal voltage. */
export interface PropulsionPoint { command: number; thrustN: number; powerW: number }

export function motorCount(config: PhysicsConfig): number {
  return config.droneType === 'quadcopter' ? 4 : config.droneType === 'hexacopter' ? 6 : 2;
}

export function thrustLimit(config: PhysicsConfig): number {
  const curve = config.propulsionCurve;
  return curve?.length ? curve[curve.length - 1].thrustN
    : config.maxThrustPerMotorN ?? maxThrustPerMotor(config.propDiameter, config.batteryVoltage);
}

export function interpolatePropulsion(curve: PropulsionPoint[], command: number): PropulsionPoint {
  const c = Math.max(curve[0].command, Math.min(curve[curve.length - 1].command, command));
  const hi = curve.findIndex(p => p.command >= c);
  if (hi <= 0) return { ...curve[0] };
  const a = curve[hi - 1], b = curve[hi];
  const t = (c - a.command) / (b.command - a.command);
  return { command: c, thrustN: a.thrustN + t * (b.thrustN - a.thrustN), powerW: a.powerW + t * (b.powerW - a.powerW) };
}

/** Shared forward mapping used by the physics engine and controller inverse. */
export function rotorThrust(config: PhysicsConfig, command: number, omega: number, density = 1.225): number {
  if (config.propulsionCurve?.length) {
    const actualCommand = 2 * (omega - OMEGA_IDLE) / (OMEGA_MAX - OMEGA_IDLE) - 1;
    return interpolatePropulsion(config.propulsionCurve, actualCommand).thrustN;
  }
  const limit = thrustLimit(config);
  const raw = config.useHighFidelityAero
    ? propTableLookup(command, omega, config.propDiameter, density).thrust
    : betThrust(command, omega, config.propDiameter) * betCalibration(
      betThrust(1, OMEGA_MAX, config.propDiameter), config.propDiameter, config.batteryVoltage
    ) * limit / maxThrustPerMotor(config.propDiameter, config.batteryVoltage);
  return Math.max(0, Math.min(limit, raw));
}

export function commandForThrust(config: PhysicsConfig, thrustN: number): number {
  let lo = -1, hi = 1;
  for (let i = 0; i < 32; i++) {
    const command = (lo + hi) / 2;
    const omega = OMEGA_IDLE + (command + 1) / 2 * (OMEGA_MAX - OMEGA_IDLE);
    if (rotorThrust(config, command, omega) < thrustN) lo = command;
    else hi = command;
  }
  return (lo + hi) / 2;
}
