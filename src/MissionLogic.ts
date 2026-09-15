import { thrustLimit, motorCount } from './physics/propulsion';
import { DroneState, PhysicsConfig } from './PhysicsEngine';

export interface MissionMetrics {
  sec: number;
  /** Legacy numeric field is zero when inapplicable; consumers MUST check this flag. */
  secApplicable?: boolean;
  metricWarnings?: string[];
  hoverPowerW: number;
  spt: number;
  sptGrade: string;
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
    // Explicit payload only. Legacy SEC units remain J/(g payload·km).
    // secApplicable=false means consumers must display N/A, never rank zero as best.
    const payloadMassGrams = (config.payloadMassKg ?? 0) * 1000;
    const distanceKm = Math.max(0, totalDistance) / 1000;

    const secApplicable = payloadMassGrams > 0 && distanceKm >= 0.01;
    let sec = 0;
    let hoverPowerW = 0;
    if (!secApplicable) {
      // Hover → report instantaneous power draw (J·kg/W/m-independent metric)
      if (history.length >= 2) {
        const last = history[history.length - 1];
        const prev = history[history.length - 2];
        const dt = Math.max(1e-3, (last.time - prev.time));
        const dE = Math.max(0, totalEnergyConsumed - (prev.energyConsumed ?? 0));
        hoverPowerW = dE / dt;
      }
      sec = 0;
    } else {
      // Division guards — both factors already floored to strictly positive.
      const denom = payloadMassGrams * distanceKm;
      sec = denom > 1e-9 ? totalEnergyConsumed / denom : 0;
    }
    // NaN / Inf guard — any upstream divide-by-zero collapses to 0 here.
    if (!Number.isFinite(sec)) sec = 0;
    if (!Number.isFinite(hoverPowerW)) hoverPowerW = 0;

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

    const sptGrade = 'unvalidated legacy ratio';

    const propFactor = Math.pow(config.propDiameter / 15, 4);
    const numMotors = config.droneType === 'quadcopter' ? 4 : config.droneType === 'hexacopter' ? 6 : 2;
    const maxThrust = thrustLimit(config) * motorCount(config);
    const optimalTotalMass = (maxThrust * 0.6) / this.GRAVITY;
    const computedCargo = Math.max(0, optimalTotalMass - config.mass);

    // Cap by disc loading limit (typical multirotor max ~50 kg/m^2)
    const discLoadingMax = 50; // kg/m^2
    const propDiameterM = config.propDiameter * 0.0254; // propDiameter is in inches
    const discArea = numMotors * Math.PI * Math.pow(propDiameterM / 2, 2);
    const discLoadingCap = Math.max(0, discLoadingMax * discArea - config.mass);

    // Also cap payload ratio at 3:1 (cargo : airframe mass)
    const payloadRatioCap = config.mass * 3;

    const optimalCargoWeight = Math.min(computedCargo, discLoadingCap, payloadRatioCap);

    let pointOfNoReturn = 0;
    if (history.length > 10) {
      const recentEnergy = totalEnergyConsumed - (history[history.length - 10].energyConsumed || 0);
      const recentTime = (history[history.length - 1].time - history[history.length - 10].time) || 1;
      const powerRate = recentEnergy / recentTime;
      const currentVelocity = Math.sqrt(telemetry.x_dot**2 + telemetry.y_dot**2 + telemetry.z_dot**2);
      if (powerRate > 0.1 && currentVelocity > 0.1) {
        // Unit chain: battery (0–1 fraction) × 10000 (mAh capacity assumed)
        //           × batteryVoltage (V) × 3.6 (conversion: 1 mAh·V × 3.6 = 1 J)
        //           = remaining energy in Joules
        const remainingEnergy = telemetry.battery * (config.batteryCapacity ?? 10000) * config.batteryVoltage * 3.6;
        const timeRemaining = remainingEnergy / powerRate;
        pointOfNoReturn = Math.min(500, (timeRemaining * currentVelocity) / 2 / 1000);
      }
    }

    const targetDeviation = Math.min(100000, Math.sqrt(telemetry.x**2 + telemetry.y**2) * 100);

    // Fix 6: use config.armLength (was hardcoded 0.5m)
    const velocitySq = telemetry.x_dot**2 + telemetry.y_dot**2 + telemetry.z_dot**2;
    const dragForce = 0.5 * this.AIR_DENSITY * velocitySq * 1.2 * 0.05;
    const armLength = config.armLength ?? 0.5;
    const bendingMoment = dragForce * armLength;
    const structuralStress = Math.min(500, bendingMoment * 0.1);

    return {
      sec,
      secApplicable,
      metricWarnings: ['Experimental estimates, not independently validated', ...(!secApplicable ? ['SEC requires explicit payload and at least 10 m travel'] : []), 'SPT is not a validated stability score', 'Range, cargo and stress estimates are not safety limits'],
      hoverPowerW,
      spt,
      sptGrade,
      optimalCargoWeight,
      pointOfNoReturn,
      targetDeviation,
      structuralStress,
      distanceTraveled: distanceKm,
      energyConsumed: totalEnergyConsumed
    };
  }
}
