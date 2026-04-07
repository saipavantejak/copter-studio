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
import { SensorNoise, SensorConfig } from './SensorNoise';
import { SeededRandom } from './SeededRandom';
import {
  qNorm, qToEuler, eulerToQuatSmallAngle,
  betThrust, stepMotor, rk4Step, computeInertia,
  rigidBodyDerivatives,
} from './physics/core';
import { MOTOR_TAU, OMEGA_IDLE, DT } from './physics/constants';
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
}

export interface TestModules {
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

  // ── v12 high-fidelity subsystems ─────────────────────────────────────────
  private dryden = new DrydenTurbulence(DT);

  constructor() { this.reset(); }

  public reset() {
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
    this.z     = z0;
    this.phi   = phi0;
    this.theta = theta0;
    this.quat  = eulerToQuatSmallAngle(phi0, theta0);
  }

  public step(action: number[]): DroneState {
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

    const avgCmd = action.reduce((s,b)=>s+Math.abs(b),0)/action.length;
    let vf = Math.pow(this.config.batteryVoltage / 22.2, 2);
    if (this.tests.batterySagEnabled) {
      this.currentBattery = Math.max(0, this.currentBattery - avgCmd*50*dt);
      const pct = this.currentBattery/this.batteryCapacity;
      vf *= pct>0.2 ? 1.0 : (pct/0.2)*0.3+0.7;
    } else {
      this.currentBattery = this.batteryCapacity;
    }
    this.totalEnergyConsumed += avgCmd*666*numMotors*dt;

    const safePropDiam = Math.max(1, this.config.propDiameter);
    const pf = Math.pow(safePropDiam/15, 4);
    const hifi = this.config.useHighFidelityAero === true;

    // ── Air density correction (ISA) ─────────────────────────────────────
    // At sea level this is 1.225 kg/m³; at 100m AGL it's ~1.211 kg/m³ (1% drop).
    const airDensity = hifi ? isaAtmosphere(Math.max(0, this.z)).density : 1.225;

    // ── Thrust calculation ────────────────────────────────────────────────
    let Fz = 0;
    if (hifi) {
      // Prop tables with ISA density + ground effect
      const rotorRadius  = (this.config.propDiameter * 0.0254) / 2;
      const ge = multiRotorGroundEffect(
        Math.max(0.01, this.z), rotorRadius, this.config.armLength, this.phi
      );
      if (this.config.droneType === 'bicopter') {
        const t0 = propTableLookup(action[0],     this.motorOmegas[0], this.config.propDiameter, airDensity);
        const t1 = propTableLookup(action[3]??0,  this.motorOmegas[1], this.config.propDiameter, airDensity);
        Fz  = (t0.thrust + (failed[1] ? 0 : t1.thrust)) * vf * ge;
      } else {
        for (let i = 0; i < numMotors; i++) {
          if (!failed[i]) {
            Fz += propTableLookup(action[i]??0, this.motorOmegas[i], this.config.propDiameter, airDensity).thrust * vf;
          }
        }
        Fz *= ge;
      }
    } else {
      // v11 BET model (unchanged)
      if (this.config.droneType==='bicopter') {
        Fz = betThrust(action[0], this.motorOmegas[0], this.config.propDiameter) * vf;
        if (!failed[1]) Fz += betThrust(action[3]??0, this.motorOmegas[1], this.config.propDiameter) * vf;
      } else {
        for (let i=0;i<numMotors;i++) {
          if (!failed[i]) Fz += betThrust(action[i], this.motorOmegas[i], this.config.propDiameter)*pf*vf;
        }
      }
    }

    const perMotorCap = 100;
    const maxT = 40*vf*pf;
    const mx = UniversalMixer.mix(this.config.droneType, action, maxT, this.tests.motorOutEnabled, this.config.armLength);
    let { L, M, N } = mx.moments;

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
        // Gust forces in world frame (mass * acceleration from gust)
        wfx = this.config.mass * gust.u * 0.5;
        wfy = this.config.mass * gust.v * 0.5;
        // Vertical gust contributes to Fz modulation
        Fz  = Math.max(0, Fz + this.config.mass * gust.w * 0.3);
        // Angular gust disturbs rates
        this.p += gust.p * dt;
        this.q += gust.q * dt;
        this.r += gust.r * dt;
        // Add steady headwind for long-range
        if (this.tests.missionPreset==='long-range') wfx += 15 * this.dragCoeffOverride;
      } else {
        // v11 sinusoidal gust model (unchanged)
        this.windPhaseX+=0.5*dt; this.windPhaseY+=0.7*dt;
        let gx=Math.sin(this.windPhaseX)*10+Math.sin(this.windPhaseX*2.3)*5;
        let gy=Math.sin(this.windPhaseY)*10+Math.sin(this.windPhaseY*1.7)*5;
        if (this.tests.missionPreset==='long-range') gx+=15;
        wfx = this.dragCoeffOverride * gx * Math.abs(gx);
        wfy = this.dragCoeffOverride * gy * Math.abs(gy);
      }
    }

    // ── Thermal updraft ───────────────────────────────────────────────
    if (hifi && this.config.thermalConfig?.enabled) {
      const wThermal = thermalUpdraft(this.x, this.y, this.z, this.config.thermalConfig);
      Fz += this.config.mass * wThermal * 0.5;
    }

    // ── Aerodynamic drag ──────────────────────────────────────────────────
    let extraFx = wfx, extraFy = wfy;
    if (hifi) {
      const dragTensor = scaleDragTensorForMass(DEFAULT_DRAG_TENSOR, 5.0, this.config.mass);
      const [dfx, dfy, dfz] = computeDragForces(
        this.x_dot, this.y_dot, this.z_dot,
        this.phi, this.theta,
        dragTensor
      );
      extraFx += dfx;
      extraFy += dfy;
      Fz = Math.max(0, Fz + dfz);
    }

    const sv0 = [this.x,this.y,this.z, this.x_dot,this.y_dot,this.z_dot, ...this.quat, this.p,this.q,this.r];
    const { Ixx, Iyy, Izz } = this.config.inertiaOverride ?? computeInertia(this.config.propDiameter, this.config.mass, this.config.armLength);
    const sv1 = rk4Step(sv0, {Fz,L,M,N}, {fx:extraFx,fy:extraFy}, this.config.mass, Ixx, Iyy, Izz, dt);

    this.x=sv1[0]; this.y=sv1[1]; this.z=sv1[2];
    this.x_dot=sv1[3]; this.y_dot=sv1[4]; this.z_dot=sv1[5];
    this.quat=[sv1[6],sv1[7],sv1[8],sv1[9]];
    this.p=sv1[10]; this.q=sv1[11]; this.r=sv1[12];
    qNorm(this.quat);
    [this.phi,this.theta,this.psi]=qToEuler(this.quat);

    if (this.z<0) {
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
      const [,,yaw] = qToEuler(this.quat);
      this.phi=0; this.theta=0; this.psi=yaw;
      this.quat=[Math.cos(yaw/2), 0, 0, Math.sin(yaw/2)];
    }

    // ── Numerical integration stability guards ────────────────────────────

    // NaN divergence detection — reset to last known good state
    if (!Number.isFinite(this.x_dot) || !Number.isFinite(this.z_dot) ||
        !Number.isFinite(this.p) || !Number.isFinite(this.phi)) {
      this.x_dot = this.y_dot = this.z_dot = 0;
      this.p = this.q = this.r = 0;
    }

    // State divergence guard — clamp velocities to physical limits
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
    };
  }

  public getObservation(): DroneState {
    const clean = this.getState();
    if (!this.sensorCfg.enableNoise) return clean;
    const noisy = this.sensorNoise.applyNoise(clean, this.sensorCfg, this.dt);
    return {...clean, ...noisy};
  }
}
