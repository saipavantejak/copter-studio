// RLAgent.ts — v11
// Added: serializeForWorker() / loadFromWorkerData() for transferring the
// loaded RL policy to the episode benchmark Web Worker via structured-clone.
// The worker can now benchmark the real RL policy, not just heuristic PD.

import * as tf from '@tensorflow/tfjs';
import { DroneType } from './UniversalMixer';
import { DroneState } from './PhysicsEngine';
import {
  DT, GRAVITY, AIR_DENSITY, BET_NB, BET_LIFT, BET_CHORD,
  BET_THETA_MIN_DEG, BET_THETA_MAX_DEG, OMEGA_IDLE, OMEGA_MAX,
  INCHES_TO_METRES,
} from './physics/constants';

// ── Serialized model payload (structured-clone-safe) ─────────────────────────

export interface SerializedModel {
  topology:    object;          // model.toJSON()
  weightSpecs: tf.io.WeightsManifestEntry[];
  weightData:  ArrayBuffer;     // concatenated Float32 weights
  droneType:   DroneType;
}

export class RLAgent {
  private actorNet: tf.Sequential;
  private criticNet: tf.Sequential;
  private userModel: tf.LayersModel | null = null;
  public isUsingUserModel: boolean = false;

  private readonly stateDim = 12;
  private readonly actionDim = 6;

  constructor() {
    this.actorNet  = this.buildActor();
    this.criticNet = this.buildCritic();
  }

  private buildActor(): tf.Sequential {
    const m = tf.sequential();
    m.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [this.stateDim] }));
    m.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    m.add(tf.layers.dense({ units: this.actionDim, activation: 'tanh' }));
    return m;
  }

  private buildCritic(): tf.Sequential {
    const m = tf.sequential();
    m.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [this.stateDim] }));
    m.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    m.add(tf.layers.dense({ units: 1, activation: 'linear' }));
    return m;
  }

  public async loadUserModel(jsonFile: File, weightsFile: File, droneType: DroneType = 'bicopter'): Promise<void> {
    try {
      const model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, weightsFile]));
      const inputDim  = model.inputs[0].shape.at(-1);
      const outputDim = model.outputs[0].shape.at(-1);
      if (inputDim !== this.stateDim)
        throw new Error(`Input shape mismatch: Expected ${this.stateDim}-DOF, got ${inputDim}.`);
      const expectedDim = droneType === 'quadcopter' ? 4 : 6;
      if (outputDim !== expectedDim)
        throw new Error(`Output shape mismatch: Expected ${expectedDim}-DOF for ${droneType}, got ${outputDim}.`);
      this.userModel = model;
      this.isUsingUserModel = true;
    } catch (e) {
      this.userModel = null;
      this.isUsingUserModel = false;
      throw e;
    }
  }

  /** Predict action from noisy OR clean observation array */
  public predictAction(state: number[], droneType: DroneType = 'bicopter', missionPreset = 'none', mass = 5.0): number[] {
    if (this.isUsingUserModel && this.userModel) {
      return tf.tidy(() => {
        const t = tf.tensor2d([state]);
        const a = this.userModel!.predict(t) as tf.Tensor;
        const arr = Array.from(a.dataSync());
        if (arr.length < 6) {
          console.warn(`[RLAgent] Model output ${arr.length} dims, padding to 6. Check model output shape.`);
          while (arr.length < 6) arr.push(0);
        }
        return arr;
      });
    }
    return this.heuristicActionArray(state, droneType, missionPreset, mass);
  }

  // ── Worker serialization ────────────────────────────────────────────────────

  /**
   * Serialize the loaded user model into a structured-clone-safe payload
   * that can be transferred to a Web Worker via postMessage.
   * Returns null when no user model is loaded (worker falls back to heuristic PD).
   */
  public async serializeForWorker(droneType: DroneType): Promise<SerializedModel | null> {
    if (!this.isUsingUserModel || !this.userModel) return null;
    try {
      let topology: object = {};
      let weightSpecs: tf.io.WeightsManifestEntry[] = [];
      let weightData = new ArrayBuffer(0);

      await this.userModel.save({
        save: async (artifacts: tf.io.ModelArtifacts) => {
          topology    = artifacts.modelTopology as object;
          weightSpecs = (artifacts.weightSpecs ?? []) as tf.io.WeightsManifestEntry[];
          const wd = artifacts.weightData;
          if (wd instanceof ArrayBuffer) {
            weightData = wd;
          } else if (Array.isArray(wd)) {
            const total  = (wd as ArrayBuffer[]).reduce((s, b) => s + b.byteLength, 0);
            const merged = new Uint8Array(total);
            let offset   = 0;
            for (const buf of wd as ArrayBuffer[]) {
              merged.set(new Uint8Array(buf), offset);
              offset += buf.byteLength;
            }
            weightData = merged.buffer;
          }
          return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' as const } };
        },
      });

      return { topology, weightSpecs, weightData, droneType };
    } catch (e) {
      console.warn('[RLAgent] serializeForWorker failed:', e);
      return null;
    }
  }

  /**
   * Reconstruct a tf.LayersModel from a SerializedModel payload.
   * Called inside the Web Worker after receiving the postMessage payload.
   */
  public async loadFromWorkerData(data: SerializedModel): Promise<void> {
    const model = await tf.loadLayersModel(
      tf.io.fromMemory(data.topology, data.weightSpecs, data.weightData)
    );
    this.userModel        = model;
    this.isUsingUserModel = true;
  }

  private heuristicActionArray(stateArr: number[], droneType: DroneType, missionPreset: string, mass = 5.0): number[] {
    return this.heuristicAction({
      x:stateArr[0],y:stateArr[1],z:stateArr[2],
      x_dot:stateArr[3],y_dot:stateArr[4],z_dot:stateArr[5],
      phi:stateArr[6],theta:stateArr[7],psi:stateArr[8],
      p:stateArr[9],q:stateArr[10],r:stateArr[11]
    }, droneType, missionPreset, mass);
  }

  // ── Altitude integral accumulator for steady-state error elimination ──────
  private altIntegral = 0;
  private lastHeuristicTime = 0;
  private cachedHoverTc: Map<string, number> = new Map();

  /** Reset integral state (call on sim reset) */
  public resetIntegral(): void {
    this.altIntegral = 0;
    this.lastHeuristicTime = 0;
  }

  /** Dispose TF.js model to free GPU/CPU memory. Call on unmount or model swap. */
  public dispose(): void {
    this.userModel?.dispose();
    this.userModel = null;
    this.isUsingUserModel = false;
  }

  /**
   * Compute the collective command tc ∈ [-1,1] where total rotor thrust = mg.
   * Uses binary search over the actual BET thrust model — cached per config key.
   */
  private computeHoverTc(numMotors: number, propDiamIn: number, mass: number): number {
    const key = `${numMotors}_${propDiamIn}_${mass}`;
    const cached = this.cachedHoverTc.get(key);
    if (cached !== undefined) return cached;

    const mg = mass * GRAVITY;
    let lo = -1, hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      // Compute total thrust at tc=mid
      const omega = OMEGA_IDLE + Math.max(0, (mid + 1) / 2) * (OMEGA_MAX - OMEGA_IDLE);
      const R  = (propDiamIn * INCHES_TO_METRES) / 2;
      const A  = Math.PI * R * R;
      const thetaDeg = BET_THETA_MIN_DEG + ((mid + 1) / 2) * (BET_THETA_MAX_DEG - BET_THETA_MIN_DEG);
      const theta = thetaDeg * Math.PI / 180;
      const CT = Math.max(0, (BET_NB * BET_CHORD * BET_LIFT * theta * R) / (4 * A));
      const vTip = omega * R;
      const thrustPerMotor = CT * AIR_DENSITY * A * vTip * vTip;
      const totalThrust = numMotors * thrustPerMotor;
      if (totalThrust > mg) hi = mid; else lo = mid;
    }
    const hoverTc = (lo + hi) / 2;
    this.cachedHoverTc.set(key, hoverTc);
    return hoverTc;
  }

  public heuristicAction(state: Partial<DroneState>, droneType: DroneType, missionPreset: string, mass = 5.0): number[] {
    const {x=0,y=0,z=0,x_dot:xd=0,y_dot:yd=0,z_dot:zd=0,phi=0,theta=0,psi=0,p=0,q=0,r=0}=state;
    let xt=0, yt=0, zt=1.0;
    if (missionPreset==='long-range') xt=10000;
    else if (missionPreset==='high-speed') xt=1000;

    const hasMissionTarget = (missionPreset !== 'none' && (xt !== 0 || yt !== 0));

    // ── Config-dependent parameters ──────────────────────────────────────
    const numMotors = droneType === 'hexacopter' ? 6 : droneType === 'quadcopter' ? 4 : 2;
    const estPropDiam = droneType === 'hexacopter' ? 22 : droneType === 'quadcopter' ? 18 : 15;

    // ── Gain scheduling ─────────────────────────────────────────────────
    // Thrust authority varies hugely across configs (betThrust ∝ N_motors × D^4).
    // Scale altitude gains inversely with thrust authority so all drones have
    // similar closed-loop altitude response.
    const thrustAuthority = (numMotors / 2) * Math.pow(estPropDiam / 15, 4);
    const massRatio = mass / 5.0;
    // altScale: heavier → need more tc, more thrust authority → need less tc
    const altScale = massRatio / thrustAuthority;

    const refInertia = 5.0 * 0.5 * 0.5;
    const estArmLength = droneType === 'hexacopter' ? 0.8 : droneType === 'quadcopter' ? 0.5 : 0.5;
    const estInertia = mass * estArmLength * estArmLength;
    const inertiaRatio = estInertia / refInertia;

    // PD gains scaled so all configs have similar closed-loop response
    const Kp_alt  = 0.4  * altScale;
    const Kd_alt  = 0.25 * Math.sqrt(altScale);
    const Ki_alt  = 0.06 * altScale;
    const Kp_att  = 0.15 * inertiaRatio;
    const Kd_att  = 0.08 * inertiaRatio;
    const Kp_yaw  = 0.1;
    const Kd_yaw  = 0.05;

    // ── Altitude PID with hover bias ──────────────────────────────────────
    // Compute exact hover collective from BET thrust model via binary search.
    // PD corrections are applied around this equilibrium point.
    const hoverBias = this.computeHoverTc(numMotors, estPropDiam, mass);

    const altError = zt - z;
    const dt = DT;
    this.altIntegral = Math.max(-2, Math.min(2, this.altIntegral + altError * dt));

    const clamp = (v:number) => Math.max(-1, Math.min(1,v));
    // PD correction around hover bias
    const correction = clamp(altError * Kp_alt + (-zd) * Kd_alt + this.altIntegral * Ki_alt);
    let tc = Math.max(-1, Math.min(1, hoverBias + correction));

    // ── Horizontal position PD (when mission target exists) ───────────────
    let pitchTarget = 0;   // desired pitch angle for forward (x) motion
    let rollTarget  = 0;   // desired roll angle for lateral (y) motion

    if (hasMissionTarget) {
      const posKp = 0.3;   // position proportional gain
      const posKd = 0.8;   // position derivative (velocity damping) gain
      const maxVCmd = 5;    // max commanded velocity m/s
      const maxAttCmd = 0.3; // max attitude command radians (~17 deg)
      const vBrake = 0.05;  // velocity braking gain

      // Outer loop: position error -> commanded velocity, clamped
      const vx_cmd = Math.max(-maxVCmd, Math.min(maxVCmd, posKp * (xt - x)));
      const vy_cmd = Math.max(-maxVCmd, Math.min(maxVCmd, posKp * (yt - y)));

      // Inner loop: velocity error -> attitude command (pitch for x, roll for y)
      pitchTarget = Math.max(-maxAttCmd, Math.min(maxAttCmd, posKd * (vx_cmd - xd)));
      rollTarget  = Math.max(-maxAttCmd, Math.min(maxAttCmd, posKd * (vy_cmd - yd)));

      // Anti-windup: horizontal velocity braking when exceeding 10 m/s
      if (Math.abs(xd) > 10) pitchTarget -= Math.max(-maxAttCmd, Math.min(maxAttCmd, vBrake * xd));
      if (Math.abs(yd) > 10) rollTarget  -= Math.max(-maxAttCmd, Math.min(maxAttCmd, vBrake * yd));

      pitchTarget = Math.max(-maxAttCmd, Math.min(maxAttCmd, pitchTarget));
      rollTarget  = Math.max(-maxAttCmd, Math.min(maxAttCmd, rollTarget));
    }

    // ── Attitude stabilization ────────────────────────────────────────────
    // When a mission target exists, track the commanded attitude from the
    // horizontal position controller instead of raw position error.
    let rc: number, pc: number;
    if (hasMissionTarget) {
      rc = clamp((rollTarget - phi) * Kp_att - p * Kd_att);
      pc = clamp((pitchTarget - theta) * Kp_att - q * Kd_att);
    } else {
      // Cascaded position → attitude control (same structure as mission mode)
      // Outer loop: position error → attitude target, clamped to prevent tip-over
      const posKpFree  = 0.2;   // softer than mission mode
      const posKdFree  = 0.5;
      const maxAttFree = 0.25;  // ~14° max lean for station-keeping

      const rollCmd  = Math.max(-maxAttFree, Math.min(maxAttFree, posKpFree * (yt - y) - posKdFree * yd));
      const pitchCmd = Math.max(-maxAttFree, Math.min(maxAttFree, posKpFree * (xt - x) - posKdFree * xd));

      // Inner loop: track commanded attitude
      rc = clamp((rollCmd - phi) * Kp_att - p * Kd_att);
      pc = clamp((pitchCmd - theta) * Kp_att - q * Kd_att);
    }

    const yc = clamp((-psi) * Kp_yaw - r * Kd_yaw);

    if (droneType==='bicopter')
      return [tc+yc, rc, pc, tc-yc, rc, pc];

    if (droneType==='quadcopter') {
      // X-config quad mixer — must match UniversalMixer moment equations:
      //   L = (t0+t3-t1-t2)*d*0.707  →  needs t0,t3 ∝ +rc, t1,t2 ∝ -rc
      //   M = (t1+t3-t0-t2)*d*0.707  →  needs t1,t3 ∝ +pc, t0,t2 ∝ -pc
      //   N = (t0+t1-t2-t3)*0.05     →  needs t0,t1 ∝ +yc, t2,t3 ∝ -yc
      return [
        tc + rc - pc + yc,  // motor 0
        tc - rc + pc + yc,  // motor 1
        tc - rc - pc - yc,  // motor 2
        tc + rc + pc - yc,  // motor 3
        0, 0,
      ];
    }

    // Hexacopter — motors at [30°, 90°, 150°, 210°, 270°, 330°], dirs [CW,CCW,CW,CCW,CW,CCW]
    //   L = Σ t_i * d * sin(θ_i)  →  motor_i needs sin(θ_i) coefficient for rc
    //   M = Σ t_i * d * cos(θ_i)  →  motor_i needs cos(θ_i) coefficient for pc
    //   N = Σ t_i * dir_i * 0.05  →  motor_i needs dir_i coefficient for yc
    const s30 = 0.5, c30 = 0.866;
    return [
      tc + s30*rc + c30*pc + yc,    // motor 0: 30°, CW
      tc +     rc          - yc,    // motor 1: 90°, CCW
      tc + s30*rc - c30*pc + yc,    // motor 2: 150°, CW
      tc - s30*rc - c30*pc - yc,    // motor 3: 210°, CCW
      tc -     rc          + yc,    // motor 4: 270°, CW
      tc - s30*rc + c30*pc - yc,    // motor 5: 330°, CCW
    ];
  }
}
