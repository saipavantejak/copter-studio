import { DroneState, PhysicsConfig } from './PhysicsEngine';

export interface MissionMetrics {
  sec: number;
  spt: number;
  optimalCargoWeight: number;
  pointOfNoReturn: number;
  targetDeviation: number;
  structuralStress: number; // MPa (simplified)
  distanceTraveled: number;
  energyConsumed: number;
}

export interface TelemetryHistory extends DroneState {
  servos?: number[];
  sec?: number;
  spt?: number;
}

export class MissionLogic {
  private static readonly AIR_DENSITY = 1.225;
  private static readonly GRAVITY = 9.81;

  static calculateMetrics(
    config: PhysicsConfig,
    telemetry: DroneState,
    history: TelemetryHistory[],
    totalEnergyConsumed: number,
    totalDistance: number
  ): MissionMetrics {
    const payloadMassGrams = Math.max(100, (config.mass - 2.0) * 1000);
    const distanceKm = totalDistance / 1000;

    let sec = 0;
    if (payloadMassGrams > 0 && distanceKm > 0.001) {
      sec = totalEnergyConsumed / (payloadMassGrams * distanceKm);
    }

    let spt = 0;
    if (history.length > 1) {
      let servoDeltaSum = 0;
      let attitudeVarSum = 0;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i-1];
        const curr = history[i];
        if (curr.servos && prev.servos) {
          for (let j = 0; j < curr.servos.length; j++) {
            servoDeltaSum += Math.abs(curr.servos[j] - prev.servos[j]);
          }
        }
        attitudeVarSum += Math.abs(curr.phi - prev.phi) + Math.abs(curr.theta - prev.theta);
      }
      if (attitudeVarSum > 0.001) {
        spt = servoDeltaSum / (attitudeVarSum * 100);
      }
    }

    // Thrust ∝ D⁴ (dimensional analysis: T = CT·ρ·n²·D⁴), voltage ∝ V² (RPM² ∝ V²)
    const propFactor = Math.pow(config.propDiameter / 15, 4);
    const voltageFactor = Math.pow(config.batteryVoltage / 22.2, 2);
    const numMotors = config.droneType === 'quadcopter' ? 4 : config.droneType === 'hexacopter' ? 6 : 2;
    const maxThrust = 40 * voltageFactor * propFactor * numMotors;
    const optimalTotalMass = (maxThrust * 0.6) / this.GRAVITY;
    const optimalCargoWeight = Math.max(0, optimalTotalMass - 2.0);

    let pointOfNoReturn = 0;
    if (history.length > 10) {
      const recentEnergy = totalEnergyConsumed - (history[history.length - 10].energyConsumed || 0);
      const recentTime = (history[history.length - 1].time - history[history.length - 10].time) || 1;
      const powerRate = recentEnergy / recentTime;
      const currentVelocity = Math.sqrt(telemetry.x_dot**2 + telemetry.y_dot**2 + telemetry.z_dot**2);
      if (powerRate > 0 && currentVelocity > 0.1) {
        // Unit chain: battery (0–1 fraction) × 10000 (mAh capacity assumed)
        //           × batteryVoltage (V) × 3.6 (conversion: 1 mAh·V × 3.6 = 1 J)
        //           = remaining energy in Joules
        const remainingEnergy = telemetry.battery * 10000 * config.batteryVoltage * 3.6;
        const timeRemaining = remainingEnergy / powerRate;
        pointOfNoReturn = (timeRemaining * currentVelocity) / 2 / 1000;
      }
    }

    const targetDeviation = Math.sqrt(telemetry.x**2 + telemetry.y**2) * 100;

    // Fix 6: use config.armLength (was hardcoded 0.5m)
    const velocitySq = telemetry.x_dot**2 + telemetry.y_dot**2 + telemetry.z_dot**2;
    const dragForce = 0.5 * this.AIR_DENSITY * velocitySq * 1.2 * 0.05;
    const armLength = config.armLength ?? 0.5;
    const bendingMoment = dragForce * armLength;
    const structuralStress = bendingMoment * 0.1;

    return {
      sec,
      spt,
      optimalCargoWeight,
      pointOfNoReturn,
      targetDeviation,
      structuralStress,
      distanceTraveled: distanceKm,
      energyConsumed: totalEnergyConsumed
    };
  }
}
