// PhysicsEngine.ts — v12
// v12 additions:
//   • PhysicsConfig extended with optional high-fidelity flags (backward-compatible)
//   • Dryden turbulence replaces sinusoidal gust when useHighFidelityAero=true
//   • Drag tensor replaces scalar drag when useHighFidelityAero=true
//   • Ground effect (Cheeseman-Bennett) multiplies rotor thrust near ground
//   • ISA atmosphere corrects air density with altitude
//   • Prop tables replace BET when useHighFidelityAero=true
//   All new features default OFF — existing behaviour is unchanged.

import { UniversalMixer, DroneType } from './UniversalMixer';
import { assertValidConfig } from './configValidation';
import { rotorThrust, thrustLimit, interpolatePropulsion, type PropulsionPoint } from './physics/propulsion';
import { SensorNoise, SensorConfig } from './SensorNoise';
import { SeededRandom } from './SeededRandom';
import {
  qNorm, qToEuler, eulerToQuatSmallAngle,
  betThrust, stepMotor, rk4Step, computeInertia,
  rigidBodyDerivatives,
} from './physics/core';
import { MOTOR_TAU, OMEGA_IDLE, DT, GRAVITY, AIR_DENSITY, FIGURE_OF_MERIT, MOTOR_ESC_EFF, IDLE_POWER_W } from './physics/constants';
import { maxThrustPerMotor, maxYawTorquePerMotor, saturateMotorThrusts, betCalibration } from './physics/thrustLimits';
import { OMEGA_MAX as OMEGA_MAX_CONST } from './physics/constants';
import { DrydenTurbulence, TurbulenceIntensity, isaAtmosphere, thermalUpdraft, DEFAULT_THERMAL } from './physics/atmosphere';
import { propTableLookup } from './physics/propTables';
import { computeDragForces, multiRotorGroundEffect, DEFAULT_DRAG_TENSOR, scaleDragTensorForMass } from './physics/groundEffect';

export interface PhysicsConfig {
  droneType: DroneType;
  mass: number;
  propDiameter: number;
  batteryVoltage: number;
  armLength: number;
  // ── v12 high-fidelity options (all optional, default = false = v11 behaviour) ──
  /** Enable Dryden turbulence, drag tensor, ground effect, ISA density, prop tables */
  useHighFidelityAero?: boolean;
  /** Turbulence severity when useHighFidelityAero=true AND windEnabled=true */
  turbulenceIntensity?: TurbulenceIntensity;
  /** Optional measured inertia override (kg·m²). Falls back to computeInertia() heuristic. */
  inertiaOverride?: { Ixx: number; Iyy: number; Izz: number };
  /** Custom prop table name (defaults to 'APC_15x4.5MR'). Extend propTables.ts to add more. */
  propTableId?: string;
  /** Enable thermal/updraft model for long-range missions */
  thermalConfig?: import('./physics/atmosphere').ThermalConfig;
  batteryCapacity?: number;
  /** Explicit payload mass in kg; never inferred from a universal airframe mass. */
  payloadMassKg?: number;
  /** Measured nominal-voltage maximum static thrust per rotor, newtons. */
  maxThrustPerMotorN?: number;
  propulsionCurve?: PropulsionPoint[];
}

export interface TestModules {
  mission?: import('./MissionSpec').MissionSpec;
  windEnabled: boolean;
  payloadShiftEnabled: boolean;
  batterySagEnabled: boolean;
  motorOutEnabled: boolean;
  missionPreset: 'none' | 'long-range' | 'precision-drop' | 'high-speed';
}

export interface DroneState {
  x: number; y: number; z: number;
  x_dot: number; y_dot: number; z_dot: number;
  phi: number; theta: number; psi: number;
  p: number; q: number; r: number;
  battery: number;
  droneType: DroneType;
  time: number;
  energyConsumed: number;
  motorOmegas: number[];
  failureReason?: string;
  impactSpeedMps?: number;
}

export class PhysicsEngine {
  public x=0; public y=0; public z=0;
  public x_dot=0; public y_dot=0; public z_dot=0;
  private quat=[1,0,0,0];
  public phi=0; public theta=0; public psi=0;
  public p=0; public q=0; public r=0;
  private motorOmegas: number[] = new Array(6).fill(OMEGA_IDLE);

  private readonly dt = DT;

  public config: PhysicsConfig = {
    droneType: 'bicopter', mass: 5.0, propDiameter: 15, batteryVoltage: 22.2, armLength: 0.5
  };
  public tests: TestModules = {
    windEnabled: false, payloadShiftEnabled: false,
    batterySagEnabled: false, motorOutEnabled: false, missionPreset: 'none'
  };
  public sensorCfg: SensorConfig = { enableNoise: false, imuNoiseLevel: 0.5, gpsNoiseLevel: 0.5 };

  private time = 0;
  public get batteryCapacity(): number { return this.config.batteryCapacity ?? 10000; }
  public currentBattery = 10000;
  private windPhaseX = 0;
  private windPhaseY = 0;
  public totalDistance = 0;
  public totalEnergyConsumed = 0;
  private sensorNoise = new SensorNoise();
  public motorTauOverride: number = MOTOR_TAU;
  public dragCoeffOverride: number = 0.47;
  public rng: SeededRandom = new SeededRandom(42);
  /** True when ANY per-motor thrust was clipped last step (actuator saturation). */
  public lastSaturated: boolean = false;
  /** Instantaneous electrical draw (Watts) from last step. */
  public lastPowerW: number = 0;
  public failureReason: string | undefined;
  public impactSpeedMps = 0;
  private airborne = false;

  // ── v12 high-fidelity subsystems ─────────────────────────────────────────
  private dryden = new DrydenTurbulence(DT);

  constructor() { this.reset(); }

  public reset() {
    assertValidConfig(this.config);
    this.failureReason = undefined;
    this.impactSpeedMps = 0;
    this.airborne = false;
    this.lastPowerW = 0;
    this.lastSaturated = false;
    this.x=this.y=this.z=0;
    this.x_dot=this.y_dot=this.z_dot=0;
    this.quat=[1,0,0,0];
    this.phi=this.theta=this.psi=0;
    this.p=this.q=this.r=0;
    this.motorOmegas = new Array(6).fill(OMEGA_IDLE);
    this.time=0;
    this.currentBattery=this.batteryCapacity;
    this.windPhaseX=this.rng.next()*Math.PI*2;
    this.windPhaseY=this.rng.next()*Math.PI*2;
    this.totalDistance=0;
    this.totalEnergyConsumed=0;
    this.sensorNoise.reset();
    this.dryden.reset();
  }

  /** Set initial conditions without 'as any' casts. Call reset() first. */
  public setInitialConditions(z0: number, phi0: number, theta0: number): void {
    this.airborne = z0 > 0.1;
    this.z     = z0;
    this.phi   = phi0;
    this.theta = theta0;
    this.quat  = eulerToQuatSmallAngle(phi0, theta0);
  }

  public step(action: number[]): DroneState {
    if (this.failureReason) return this.getState();
    const required = this.config.droneType === 'quadcopter' ? 4 : 6;
    if (action.length < required || !action.slice(0, required).every(Number.isFinite)) {
      this.failureReason = 'Invalid controller output';
      return this.getState();
    }
    const commandSaturated = action.some(v => Math.abs(v) >= 0.999);
    action = action.map(v => Math.max(-1, Math.min(1, v)));
    this.time += this.dt;
    const dt = this.dt;

    const numMotors = this.config.droneType==='quadcopter' ? 4
      : this.config.droneType==='hexacopter' ? 6 : 2;

    const failed = new Array(6).fill(false);
    if (this.tests.motorOutEnabled) {
      failed[this.config.droneType==='bicopter' ? 1 : 0] = true;
    }

    const tau = this.motorTauOverride;
    if (this.config.droneType === 'bicopter') {
      this.motorOmegas[0] = stepMotor(this.motorOmegas[0], action[0],      dt, tau, failed[0]);
      this.motorOmegas[1] = stepMotor(this.motorOmegas[1], action[3] ?? 0, dt, tau, failed[1]);
    } else {
      const numM = this.config.droneType === 'quadcopter' ? 4 : 6;
      for (let i = 0; i < numM; i++) {
        this.motorOmegas[i] = stepMotor(this.motorOmegas[i], action[i] ?? 0, dt, tau, failed[i]);
      }
    }

    // vf = battery-SAG factor only (1.0 when pack is healthy). The baseline
    // voltage→thrust scaling moved into maxThrustPerMotor() via sqrt(V/14.8),
    // so vf here starts at unity and only drops below 1 under sag.
    let vf = 1.0;
    // instantPower is computed AFTER the thrust calculation below — we need
    // the actual total thrust Fz (commanded by the controller and clipped by
    // actuator saturation) to apply momentum theory correctly. Declared here
    // and written once Fz is finalised.
    let instantPower = 0;

    if (this.tests.batterySagEnabled) {
      const pct = this.currentBattery / this.batteryCapacity;
      vf = pct > 0.2 ? 1 : (pct / 0.2) * 0.3 + 0.7;
    }
    if (this.currentBattery <= 0) vf = 0;

    const hifi = this.config.useHighFidelityAero === true;

    // ── Air density correction (ISA) ─────────────────────────────────────
    // At sea level this is 1.225 kg/m³; at 100m AGL it's ~1.211 kg/m³ (1% drop).
    const airDensity = hifi ? isaAtmosphere(Math.max(0, this.z)).density : 1.225;

    // ── Per-motor thrust (raw BET or prop-table), then saturate ──────────
    // Physical ceiling derived from battery voltage + prop diameter. Once
    // this is applied, domain-randomisation of wind/mass CAN overwhelm the
    // controller — restoring the expected non-zero crash rate.
    const T_max = thrustLimit(this.config);
    const rotorRadius_m = (this.config.propDiameter * 0.0254) / 2;
    const ge = hifi
      ? multiRotorGroundEffect(Math.max(0.01, this.z), rotorRadius_m, this.config.armLength, this.phi)
      : 1.0;

    // Shared propulsion mapping; generic estimates are not measured calibration.
    const rawThrusts: number[] = new Array(numMotors).fill(0);
    const thrustIdx = (i: number) => (this.config.droneType === 'bicopter' && i === 1) ? 3 : i;
    for (let i = 0; i < numMotors; i++) {
      if (failed[i]) continue;
      const cmd = action[thrustIdx(i)] ?? 0;
      const t = rotorThrust(this.config, cmd, this.motorOmegas[i], airDensity);
      rawThrusts[i] = t * vf * ge;
    }
    const { thrusts: satThrusts, saturated } = saturateMotorThrusts(rawThrusts, T_max);
    this.lastSaturated = saturated || commandSaturated;
    let Fz = satThrusts.reduce((s, t) => s + t, 0);

    // ── Moments: run mixer with physical T_max, then clip to per-motor sat ─
    const mx = UniversalMixer.fromThrusts(this.config.droneType, satThrusts, action, this.config.armLength);
    let { L, M, N } = mx.moments;
    // Yaw-torque saturation (brushless motors can't produce unbounded reactive torque)
    const N_max = maxYawTorquePerMotor(this.config.propDiameter, this.config.batteryVoltage) * numMotors;
    N = Math.max(-N_max, Math.min(N_max, N));
    // Roll/pitch moments are bounded implicitly by per-motor thrust saturation
    // (the mixer already uses armLength × T_max), but we also cap by arm·ΣT_max
    // as a defensive ceiling against numerical artefacts under heavy wind.
    const M_max = this.config.armLength * T_max * numMotors;
    L = Math.max(-M_max, Math.min(M_max, L));
    M = Math.max(-M_max, Math.min(M_max, M));

    if (this.tests.payloadShiftEnabled || this.tests.missionPreset==='precision-drop') {
      let cx=(this.config.propDiameter*0.0254)*0.1, cy=cx;
      if (this.tests.missionPreset==='precision-drop') {
        cx*=Math.sin(this.time*2); cy*=Math.cos(this.time*1.5);
      }
      L+=Fz*cy; M-=Fz*cx;
    }

    let wfx=0, wfy=0;
    if (this.tests.windEnabled || this.tests.missionPreset==='long-range') {
      if (hifi) {
        // ── Dryden MIL-HDBK-1797B turbulence ─────────────────────────────
        const tas = Math.max(0.5, Math.sqrt(this.x_dot**2 + this.y_dot**2 + this.z_dot**2));
        const intensity: TurbulenceIntensity = this.config.turbulenceIntensity ?? 'moderate';
        const gust = this.dryden.step(
          Math.max(0.5, this.z), tas, intensity, () => this.rng.next()
        );
        // Altitude-dependent wind ramp: logarithmic wind profile (ABL theory)
        // At z=0: factor=0, at z=2m: factor≈0.5, at z=10m: factor≈0.83, at z=30m+: factor=1.0
        const z_agl_hi = Math.max(0, this.z);
        const windRampHi = Math.min(1.0, Math.log(1 + z_agl_hi) / Math.log(31));
        // Gust forces in world frame (mass * acceleration from gust)
        wfx = Math.max(0.02, this.config.mass) * gust.u * 0.5 * windRampHi;
        wfy = Math.max(0.02, this.config.mass) * gust.v * 0.5 * windRampHi;
        // Vertical gust contributes to Fz modulation
        Fz  = Math.max(0, Fz + Math.max(0.02, this.config.mass) * gust.w * 0.3);
        // Angular gust disturbs rates
        this.p += gust.p * dt;
        this.q += gust.q * dt;
        this.r += gust.r * dt;
        // Add steady headwind for long-range
        if (this.tests.missionPreset==='long-range') wfx += 15 * this.dragCoeffOverride;
      } else {
        // v11 sinusoidal gust model with altitude-dependent wind ramp
        this.windPhaseX+=0.5*dt; this.windPhaseY+=0.7*dt;
        let gx=Math.sin(this.windPhaseX)*10+Math.sin(this.windPhaseX*2.3)*5;
        let gy=Math.sin(this.windPhaseY)*10+Math.sin(this.windPhaseY*1.7)*5;
        // Altitude-dependent wind ramp: logarithmic wind profile (ABL theory)
        // At z=0: factor=0, at z=2m: factor≈0.5, at z=10m: factor≈0.83, at z=30m+: factor=1.0
        const z_agl = Math.max(0, this.z);
        const windRamp = Math.min(1.0, Math.log(1 + z_agl) / Math.log(31));
        gx *= windRamp;
        gy *= windRamp;
        if (this.tests.missionPreset==='long-range') gx+=15;
        wfx = this.dragCoeffOverride * gx * Math.abs(gx);
        wfy = this.dragCoeffOverride * gy * Math.abs(gy);
      }
    }

    // ── Thermal updraft ───────────────────────────────────────────────
    if (hifi && this.config.thermalConfig?.enabled) {
      const wThermal = thermalUpdraft(this.x, this.y, this.z, this.config.thermalConfig);
      Fz += Math.max(0.02, this.config.mass) * wThermal * 0.5;
    }

    // ── Aerodynamic drag ──────────────────────────────────────────────────
    let extraFx = wfx, extraFy = wfy;
    if (hifi) {
      const dragTensor = scaleDragTensorForMass(DEFAULT_DRAG_TENSOR, 5.0, Math.max(0.02, this.config.mass));
      const [dfx, dfy, dfz] = computeDragForces(
        this.x_dot, this.y_dot, this.z_dot,
        this.phi, this.theta,
        dragTensor
      );
      extraFx += dfx;
      extraFy += dfy;
      Fz = Math.max(0, Fz + dfz);
    }

    // Electrical draw derives from rotor thrust, not wind/drag/updraft forces.
    const rotorArea = Math.PI * rotorRadius_m * rotorRadius_m;
    instantPower = this.currentBattery <= 0 ? 0 : IDLE_POWER_W;
    for (let i = 0; i < numMotors; i++) {
      if (failed[i] || this.currentBattery <= 0) continue;
      if (this.config.propulsionCurve?.length) {
        const actualCommand = 2 * (this.motorOmegas[i] - OMEGA_IDLE) / (OMEGA_MAX_CONST - OMEGA_IDLE) - 1;
        instantPower += interpolatePropulsion(this.config.propulsionCurve, actualCommand).powerW;
      } else {
        instantPower += Math.pow(satThrusts[i], 1.5) /
          Math.sqrt(2 * airDensity * rotorArea) / FIGURE_OF_MERIT / MOTOR_ESC_EFF;
      }
    }
    // Nominal-energy model. Voltage sag remains an explicitly approximate modifier.
    const availableJ = this.currentBattery * this.config.batteryVoltage * 3.6;
    const usedJ = Math.min(availableJ, instantPower * dt);
    this.totalEnergyConsumed += usedJ;
    this.currentBattery = Math.max(0, this.currentBattery - usedJ / (this.config.batteryVoltage * 3.6));
    this.lastPowerW = usedJ / dt;
    if (this.currentBattery <= 0) this.failureReason = 'Battery depletion';

    const sv0 = [this.x,this.y,this.z, this.x_dot,this.y_dot,this.z_dot, ...this.quat, this.p,this.q,this.r];
    // Clamp mass to a floor that keeps the RK4 integrator numerically stable
    // (20g nano-drones are supported; below that the attitude dynamics become
    // too stiff for a 16 ms timestep).
    const mass_eff = Math.max(0.02, Math.max(0.02, this.config.mass));
    const { Ixx: Ixx_raw, Iyy: Iyy_raw, Izz: Izz_raw } =
      this.config.inertiaOverride ?? computeInertia(this.config.propDiameter, mass_eff, this.config.armLength);
    // Inertia floor — prevent divide-by-zero in angular ODE for tiny rotors
    const I_MIN = 1e-7;
    const Ixx = Math.max(I_MIN, Ixx_raw);
    const Iyy = Math.max(I_MIN, Iyy_raw);
    const Izz = Math.max(I_MIN, Izz_raw);
    const sv1 = rk4Step(sv0, {Fz,L,M,N}, {fx:extraFx,fy:extraFy}, mass_eff, Ixx, Iyy, Izz, dt);

    if (!sv1.every(Number.isFinite)) {
      this.failureReason = 'Numerical divergence';
      return this.getState();
    }
    this.x=sv1[0]; this.y=sv1[1]; this.z=sv1[2];
    this.x_dot=sv1[3]; this.y_dot=sv1[4]; this.z_dot=sv1[5];
    this.quat=[sv1[6],sv1[7],sv1[8],sv1[9]];
    this.p=sv1[10]; this.q=sv1[11]; this.r=sv1[12];
    qNorm(this.quat);
    [this.phi,this.theta,this.psi]=qToEuler(this.quat);

    if (this.z > 0.1) this.airborne = true;
    if (this.z<0) {
      this.impactSpeedMps = Math.max(0, -this.z_dot);
      if (this.airborne) this.failureReason = 'Ground impact';
      // Spring-damper ground contact with Coulomb friction
      const Kn = 2000, Dn = 50, mu = 0.6;
      const penetration = -this.z;
      const Fn = Math.max(0, Kn * penetration - Dn * this.z_dot);
      this.z = 0;
      this.z_dot = Math.max(0, this.z_dot + Fn * 0.001);
      // Coulomb friction
      const vH = Math.sqrt(this.x_dot**2 + this.y_dot**2);
      if (vH > 1e-6) {
        const fd = Math.min(mu * Fn * 0.001, vH);
        this.x_dot -= (this.x_dot / vH) * fd;
        this.y_dot -= (this.y_dot / vH) * fd;
      }
      // Angular damping (preserve yaw)
      this.p *= 0.8; this.q *= 0.8; this.r *= 0.9;
      // Preserve impact attitude for failure analysis.
    }

    // ── Numerical integration stability guards ────────────────────────────

    // NaN divergence detection — reset to last known good state
    if (!Number.isFinite(this.x_dot) || !Number.isFinite(this.z_dot) ||
        !Number.isFinite(this.p) || !Number.isFinite(this.phi)) {
      this.x_dot = this.y_dot = this.z_dot = 0;
      this.p = this.q = this.r = 0;
    }

    if ([this.x_dot,this.y_dot,this.z_dot].some(v => Math.abs(v) > 50) ||
        [this.p,this.q,this.r].some(v => Math.abs(v) > 30)) {
      this.failureReason = this.failureReason ?? 'Numerical operating envelope exceeded';
    }
    // Rendering bounds; the failure above is latched and cannot become success.
    const V_MAX = 50; // m/s — well above any multirotor's capability
    this.x_dot = Math.max(-V_MAX, Math.min(V_MAX, this.x_dot));
    this.y_dot = Math.max(-V_MAX, Math.min(V_MAX, this.y_dot));
    this.z_dot = Math.max(-V_MAX, Math.min(V_MAX, this.z_dot));

    // Clamp angular rates to physical limits
    const W_MAX = 30; // rad/s — physical limit for multirotor angular rates
    this.p = Math.max(-W_MAX, Math.min(W_MAX, this.p));
    this.q = Math.max(-W_MAX, Math.min(W_MAX, this.q));
    this.r = Math.max(-W_MAX, Math.min(W_MAX, this.r));

    // Clamp position to reasonable range
    const POS_MAX = 5000; // meters
    this.x = Math.max(-POS_MAX, Math.min(POS_MAX, this.x));
    this.y = Math.max(-POS_MAX, Math.min(POS_MAX, this.y));
    this.z = Math.max(-500, Math.min(POS_MAX, this.z)); // z can't go below -500 (deep underground)

    this.totalDistance+=Math.sqrt(this.x_dot**2+this.y_dot**2+this.z_dot**2)*dt;
    return this.getState();
  }

  public getState(): DroneState {
    return {
      x:this.x, y:this.y, z:this.z,
      x_dot:this.x_dot, y_dot:this.y_dot, z_dot:this.z_dot,
      phi:this.phi, theta:this.theta, psi:this.psi,
      p:this.p, q:this.q, r:this.r,
      battery:this.currentBattery/this.batteryCapacity,
      droneType:this.config.droneType,
      time:this.time,
      energyConsumed:this.totalEnergyConsumed,
      motorOmegas:[...this.motorOmegas],
      failureReason:this.failureReason,
      impactSpeedMps:this.impactSpeedMps,
    };
  }

  public getObservation(): DroneState {
    const clean = this.getState();
    if (!this.sensorCfg.enableNoise) return clean;
    const noisy = this.sensorNoise.applyNoise(clean, this.sensorCfg, this.dt);
    return {...clean, ...noisy};
  }
}
