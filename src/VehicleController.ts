import type { DroneState, PhysicsConfig } from './PhysicsEngine';
import type { MissionSpec } from './MissionSpec';
import { DEFAULT_MISSION } from './MissionSpec';
import { computeInertia } from './physics/core';
import { commandForThrust, motorCount, thrustLimit } from './physics/propulsion';
import { DT, GRAVITY } from './physics/constants';

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/** Configuration-aware engineering baseline; gains are not flight-validated. */
export class VehicleController {
  private integral = 0;
  reset() { this.integral = 0; }

  action(s: Partial<DroneState>, config: PhysicsConfig, mission: MissionSpec = DEFAULT_MISSION): number[] {
    const n = motorCount(config), max = thrustLimit(config), d = config.armLength;
    const phi = s.phi ?? 0, theta = s.theta ?? 0;
    const error = mission.targetAltitudeM - (s.z ?? 0);
    const az = 4 * error - 3.2 * (s.z_dot ?? 0) + 0.5 * this.integral;
    const tilt = Math.max(0.5, Math.cos(phi) * Math.cos(theta));
    const rawTotal = config.mass * (GRAVITY + az) / tilt;
    if (!((rawTotal > n * max && error > 0) || (rawTotal < 0 && error < 0))) this.integral = clamp(this.integral + error * DT, 4);
    const total = Math.max(0, Math.min(n * max, rawTotal));
    const vx = mission.mode === 'velocity' ? mission.forwardVelocityMps : clamp(-0.8 * (s.x ?? 0), 3);
    const vy = clamp(-0.8 * (s.y ?? 0), 3);
    const pitchTarget = clamp(1.5 * (vx - (s.x_dot ?? 0)) / GRAVITY, 0.3);
    // Positive roll creates NEGATIVE world-y acceleration in this rigid-body model.
    const rollTarget = clamp(-1.5 * (vy - (s.y_dot ?? 0)) / GRAVITY, 0.3);
    const inertia = config.inertiaOverride ?? computeInertia(config.propDiameter, config.mass, d);
    const L = inertia.Ixx * (36 * (rollTarget - phi) - 10 * (s.p ?? 0));
    const M = inertia.Iyy * (36 * (pitchTarget - theta) - 10 * (s.q ?? 0));
    const N = inertia.Izz * (-16 * Math.atan2(Math.sin(s.psi ?? 0), Math.cos(s.psi ?? 0)) - 7 * (s.r ?? 0));
    if (config.droneType === 'bicopter') {
      const tc = commandForThrust(config, total / 2);
      const authority = Math.max(1e-8, total * d);
      const lat = clamp(L / authority, 1), lon = clamp(M / authority, 1), yaw = clamp(N / authority, 1);
      return [tc, lat, clamp(lon + yaw, 1), tc, lat, clamp(lon - yaw, 1)];
    }
    let deltas: number[];
    if (n === 4) {
      const roll = L / (4 * d * Math.SQRT1_2), pitch = M / (4 * d * Math.SQRT1_2), yaw = N / (4 * 0.05);
      deltas = [roll-pitch+yaw, -roll+pitch+yaw, -roll-pitch-yaw, roll+pitch-yaw];
    } else {
      deltas = Array.from({length: 6}, (_, i) => {
        const a = Math.PI/6 + i*Math.PI/3;
        return L*Math.sin(a)/(3*d) + M*Math.cos(a)/(3*d) + N*(i%2 === 0 ? 1 : -1)/(6*0.05);
      });
    }
    const collective = total / n;
    // Scale moments together to retain their direction when a rotor reaches a limit.
    let scale = 1;
    for (const delta of deltas) if (delta !== 0) scale = Math.min(scale, delta > 0 ? (max-collective)/delta : -collective/delta);
    const commands = deltas.map(delta => commandForThrust(config, collective + delta * scale));
    while (commands.length < 6) commands.push(0);
    return commands;
  }
}
