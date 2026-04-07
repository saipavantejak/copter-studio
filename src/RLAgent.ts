// RLAgent.ts — v11
// Added: serializeForWorker() / loadFromWorkerData() for transferring the
// loaded RL policy to the episode benchmark Web Worker via structured-clone.
// The worker can now benchmark the real RL policy, not just heuristic PD.

import * as tf from '@tensorflow/tfjs';
import { DroneType } from './UniversalMixer';
import { DroneState } from './PhysicsEngine';
import { DT } from './physics/constants';

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

  public heuristicAction(state: Partial<DroneState>, droneType: DroneType, missionPreset: string, mass = 5.0): number[] {
    const {x=0,y=0,z=0,x_dot:xd=0,y_dot:yd=0,z_dot:zd=0,phi=0,theta=0,psi=0,p=0,q=0,r=0}=state;
    let xt=0, yt=0, zt=1.0;
    if (missionPreset==='long-range') xt=10000;
    else if (missionPreset==='high-speed') xt=1000;

    const hasMissionTarget = (missionPreset !== 'none' && (xt !== 0 || yt !== 0));

    // ── Mass-adaptive gain scheduling ─────────────────────────────────────
    // Base gains tuned for 5kg. Scale proportionally to mass for heavier drones.
    const massRatio = mass / 5.0;
    const Kp_alt  = 0.5  * massRatio;          // altitude P-gain
    const Kd_alt  = 0.2  * Math.sqrt(massRatio); // altitude D-gain
    const Ki_alt  = 0.08 * massRatio;           // altitude I-gain
    const Kp_att  = 0.1  * Math.sqrt(massRatio); // roll/pitch P-gain
    const Kd_att  = 0.05 * Math.sqrt(massRatio); // roll/pitch D-gain
    const Kp_yaw  = 0.1;
    const Kd_yaw  = 0.05;

    // ── Altitude PID with anti-overshoot clamping ─────────────────────────
    const altError = zt - z;
    const dt = DT;
    this.altIntegral = Math.max(-2, Math.min(2, this.altIntegral + altError * dt));

    // Reduce altitude gain when error is very large to prevent runaway overshoot
    const altGainScale = Math.abs(altError) > 50 ? 50 / Math.abs(altError) : 1.0;
    const clamp = (v:number) => Math.max(-1, Math.min(1,v));
    let tc = clamp((altError * Kp_alt * altGainScale) + (-zd) * Kd_alt + this.altIntegral * Ki_alt);

    // Clamp thrust to max 2x hover (hover ~ 0.5 in normalised units)
    tc = Math.max(-1, Math.min(1, tc));

    // Anti-windup: vertical velocity braking
    const vBrake = 0.5;
    if (Math.abs(zd) > 10) tc -= clamp(vBrake * zd);
    tc = Math.max(-1, Math.min(1, tc));

    // ── Horizontal position PD (when mission target exists) ───────────────
    let pitchTarget = 0;   // desired pitch angle for forward (x) motion
    let rollTarget  = 0;   // desired roll angle for lateral (y) motion

    if (hasMissionTarget) {
      const posKp = 0.3;   // position proportional gain
      const posKd = 0.8;   // position derivative (velocity damping) gain
      const maxVCmd = 5;    // max commanded velocity m/s
      const maxAttCmd = 0.3; // max attitude command radians (~17 deg)

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
      rc = clamp((yt - y - phi) * Kp_att - p * Kd_att);
      let pe = xt - x - theta;
      if (missionPreset === 'high-speed') pe = Math.max(-0.5, Math.min(0.5, pe));
      pc = clamp(pe * Kp_att - q * Kd_att);
    }

    const yc = clamp((-psi) * Kp_yaw - r * Kd_yaw);

    if (droneType==='bicopter')
      return [tc+yc, rc, pc, tc-yc, rc, pc];
    if (droneType==='quadcopter')
      return [tc-rc+pc+yc, tc+rc+pc-yc, tc-rc-pc-yc, tc+rc-pc+yc, 0, 0];
    // hexacopter
    return [tc-rc+pc+yc, tc+rc+pc-yc, tc+rc-yc, tc+rc-pc+yc, tc-rc-pc-yc, tc-rc+yc];
  }
}
