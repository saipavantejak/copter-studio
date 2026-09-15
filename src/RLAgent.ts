// RLAgent.ts — v11
// Added: serializeForWorker() / loadFromWorkerData() for transferring the
// loaded RL policy to the episode benchmark Web Worker via structured-clone.
// The worker can now benchmark the real RL policy, not just heuristic PD.

import * as tf from '@tensorflow/tfjs';
import { VehicleController } from './VehicleController';
import type { PhysicsConfig } from './PhysicsEngine';
import type { MissionSpec } from './MissionSpec';
import { DroneType } from './UniversalMixer';
import { DroneState } from './PhysicsEngine';
import {
  DT, GRAVITY, AIR_DENSITY, BET_NB, BET_LIFT, BET_CHORD,
  BET_THETA_MIN_DEG, BET_THETA_MAX_DEG, OMEGA_IDLE, OMEGA_MAX,
  INCHES_TO_METRES,
} from './physics/constants';
import { maxThrustPerMotor } from './physics/thrustLimits';

// ── Serialized model payload (structured-clone-safe) ─────────────────────────

export interface SerializedModel {
  topology:    object;          // model.toJSON()
  weightSpecs: tf.io.WeightsManifestEntry[];
  weightData:  ArrayBuffer;     // concatenated Float32 weights
  droneType:   DroneType;
}

export class RLAgent {
  private vehicleController = new VehicleController();
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
  public predictAction(state: number[], droneType: DroneType = 'bicopter', missionPreset = 'none', mass: number | PhysicsConfig = 5.0, mission?: MissionSpec): number[] {
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
    if (typeof mass === 'object') {
      return this.vehicleController.action({x:state[0],y:state[1],z:state[2],x_dot:state[3],y_dot:state[4],z_dot:state[5],phi:state[6],theta:state[7],psi:state[8],p:state[9],q:state[10],r:state[11]}, mass, mission ?? (missionPreset === 'long-range' || missionPreset === 'high-speed' ? { mode:'velocity',targetAltitudeM:1,forwardVelocityMps:5,durationSeconds:16 } : undefined));
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
    const expected = data.droneType === 'quadcopter' ? 4 : 6;
    if (model.inputs[0].shape.at(-1) !== this.stateDim || model.outputs[0].shape.at(-1) !== expected) {
      model.dispose();
      throw new Error('Worker policy dimensions are incompatible with aircraft');
    }
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
    this.vehicleController.reset();
  }

  /** Dispose TF.js model to free GPU/CPU memory. Call on unmount or model swap. */
  public dispose(): void {
    this.actorNet.dispose();
    this.criticNet.dispose();
    this.userModel?.dispose();
    this.userModel = null;
    this.isUsingUserModel = false;
  }

  /**
   * Compute the collective command tc ∈ [-1,1] where total rotor thrust = mg.
   *
   * Uses binary search over the actual BET thrust model — cached per config
   * key. If BET cannot deliver mg at tc=1 (under-powered drone) the function
   * returns +1 (saturated) so the outer PID can still ramp the integral to
   * push the motors as high as physics allows, rather than silently returning
   * an infeasible bias.
   */
  /** Backward-compatible entry point. Pass PhysicsConfig for faithful hardware inputs.
   * Numeric-only legacy callers use the documented demo defaults, not inferred hardware. */
  public heuristicAction(state: Partial<DroneState>, droneType: DroneType, missionPreset: string, mass: number | PhysicsConfig = 5, mission?: MissionSpec): number[] {
    const config: PhysicsConfig = typeof mass === 'object' ? mass :
      {droneType,mass,propDiameter:15,batteryVoltage:22.2,armLength:0.5};
    return this.vehicleController.action(state,config,mission ?? (missionPreset === 'long-range' || missionPreset === 'high-speed'
      ? {mode:'velocity',targetAltitudeM:1,forwardVelocityMps:5,durationSeconds:16}:undefined));
  }

}
