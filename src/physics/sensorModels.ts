/**
 * sensorModels.ts — Production-grade IMU and GPS sensor models
 *
 * Replaces the simple Gaussian additive noise in SensorNoise.ts with
 * physically accurate models based on real sensor characterisation data.
 *
 * IMU Model (Allan Variance decomposition):
 *   • ARW  — Angle Random Walk (white noise on gyro)
 *   • BI   — Bias Instability (1/f correlated noise, Gauss-Markov)
 *   • VRW  — Velocity Random Walk (white noise on accel)
 *   • ABi  — Accel Bias Instability
 *
 * GPS Model:
 *   • Position noise (horizontal ≠ vertical)
 *   • Velocity noise
 *   • Fix latency (100 ms typ)
 *   • Urban canyon dropout probability
 *   • Satellite count variation
 *
 * Reference:
 *   IEEE Std 647-2006 (Gyro testing)
 *   El-Sheimy et al. (2008) "Analysis and Modeling of Inertial Sensor
 *   Errors Using Allan Variance." IEEE Trans. Instrumentation.
 *
 * Zero DOM dependencies.
 */

import { boxMullerGaussian } from './atmosphere';

// ── IMU Sensor Parameters ─────────────────────────────────────────────────────

export interface IMUNoiseParams {
  /** Angle Random Walk (rad/s/√Hz) — gyro white noise floor */
  gyroARW:          number;
  /** Gyro Bias Instability (rad/s) — slow 1/f drift, Gauss-Markov σ */
  gyroBiasInst:     number;
  /** Bias Instability correlation time (s) — typically 50–300 s */
  gyroBiasTau:      number;
  /** Velocity Random Walk (m/s²/√Hz) — accel white noise floor */
  accelVRW:         number;
  /** Accel Bias Instability (m/s²) — slow drift */
  accelBiasInst:    number;
  /** Accel bias correlation time (s) */
  accelBiasTau:     number;
  /** Scale factor error (ppm) — multiplicative */
  gyroScalePPM:     number;
  accelScalePPM:    number;
  /** Quantisation noise (LSB) — for MEMS at low resolution */
  gyroQuantRad:     number;
  accelQuantMs2:    number;
}

/** MPU-6050 class sensor (low-cost MEMS, typical hobby drone) */
export const IMU_PARAMS_CONSUMER: IMUNoiseParams = {
  gyroARW:        0.005,    // rad/s/√Hz
  gyroBiasInst:   0.003,    // rad/s
  gyroBiasTau:    100,      // s
  accelVRW:       0.003,    // m/s²/√Hz  (≈ 400 μg/√Hz)
  accelBiasInst:  0.05,     // m/s²
  accelBiasTau:   200,      // s
  gyroScalePPM:   500,
  accelScalePPM:  300,
  gyroQuantRad:   0.000133, // 2π/(2^15) ≈ 0.008°
  accelQuantMs2:  0.0024,   // 1/4096 g
};

/** ICM-42688-P class sensor (high-end MEMS, used in DJI/production autopilots) */
export const IMU_PARAMS_PRODUCTION: IMUNoiseParams = {
  gyroARW:        0.0015,   // rad/s/√Hz
  gyroBiasInst:   0.0005,   // rad/s
  gyroBiasTau:    300,      // s
  accelVRW:       0.0007,   // m/s²/√Hz
  accelBiasInst:  0.01,     // m/s²
  accelBiasTau:   500,      // s
  gyroScalePPM:   100,
  accelScalePPM:  80,
  gyroQuantRad:   3.3e-5,
  accelQuantMs2:  0.0006,
};

// ── GPS Parameters ────────────────────────────────────────────────────────────

export interface GPSNoiseParams {
  /** Horizontal position 1σ (m) — open sky */
  horizPositionSigma:  number;
  /** Vertical position 1σ (m) — typ 1.5× horizontal */
  vertPositionSigma:   number;
  /** Velocity 1σ (m/s) */
  velocitySigma:       number;
  /** Fix latency (s) — delay between truth and reported position */
  fixLatencyS:         number;
  /** Probability of losing fix per second (urban canyon model) */
  dropoutProbPerSec:   number;
  /** Visible satellite count range [min, max] */
  satCountRange:       [number, number];
  /** Multipath error std (m) — adds correlated position error */
  multipathSigma:      number;
}

export const GPS_PARAMS_CONSUMER: GPSNoiseParams = {
  horizPositionSigma: 1.5,
  vertPositionSigma:  2.5,
  velocitySigma:      0.05,
  fixLatencyS:        0.10,
  dropoutProbPerSec:  0.005,
  satCountRange:      [6, 14],
  multipathSigma:     0.8,
};

export const GPS_PARAMS_RTK: GPSNoiseParams = {
  horizPositionSigma: 0.02,
  vertPositionSigma:  0.04,
  velocitySigma:      0.01,
  fixLatencyS:        0.05,
  dropoutProbPerSec:  0.001,
  satCountRange:      [10, 18],
  multipathSigma:     0.05,
};

// ── Allan Variance IMU Model ──────────────────────────────────────────────────

export class AllanVarianceIMU {
  // Gauss-Markov bias states  [x, y, z]
  private gyroBias  = [0, 0, 0];
  private accelBias = [0, 0, 0];

  // Quantisation states (carry-over from previous step)
  private gyroQuant  = [0, 0, 0];
  private accelQuant = [0, 0, 0];

  constructor(private readonly params: IMUNoiseParams) {}

  /**
   * Apply IMU noise to clean gyroscope measurements.
   * @param clean [p, q, r] clean angular rates (rad/s)
   * @param dt    Timestep (s)
   * @param rand  Uniform [0,1) PRNG
   * @returns noisy gyro readings (rad/s)
   */
  addGyroNoise(clean: [number, number, number], dt: number, rand: () => number): [number, number, number] {
    const { gyroARW, gyroBiasInst, gyroBiasTau, gyroScalePPM, gyroQuantRad } = this.params;

    // 1. Angle Random Walk (white noise, ARW specified in rad/s/√Hz)
    const arw_sigma = gyroARW / Math.sqrt(dt);

    // 2. Bias Instability — Gauss-Markov update
    const a_b  = Math.exp(-dt / gyroBiasTau);
    const q_b  = gyroBiasInst * Math.sqrt(1 - a_b * a_b);

    // 3. Scale factor error (parts-per-million, multiplicative)
    const sf = 1 + gyroScalePPM * 1e-6;

    return clean.map((v, i) => {
      // Update bias state
      this.gyroBias[i] = a_b * this.gyroBias[i] + q_b * boxMullerGaussian(rand(), rand());

      // White noise
      const wn = arw_sigma * boxMullerGaussian(rand(), rand());

      // Scale factor
      const scaled = v * sf;

      // Quantisation (first-order hold model)
      const q = gyroQuantRad;
      const raw = scaled + this.gyroBias[i] + wn + this.gyroQuant[i];
      const quantised = Math.round(raw / q) * q;
      this.gyroQuant[i] = raw - quantised; // carry-over error

      return quantised;
    }) as [number, number, number];
  }

  /**
   * Apply IMU noise to clean accelerometer measurements.
   * @param clean [ax, ay, az] clean specific force (m/s²)
   * @param dt    Timestep (s)
   * @param rand  Uniform [0,1) PRNG
   */
  addAccelNoise(clean: [number, number, number], dt: number, rand: () => number): [number, number, number] {
    const { accelVRW, accelBiasInst, accelBiasTau, accelScalePPM, accelQuantMs2 } = this.params;

    const vrw_sigma = accelVRW / Math.sqrt(dt);
    const a_b  = Math.exp(-dt / accelBiasTau);
    const q_b  = accelBiasInst * Math.sqrt(1 - a_b * a_b);
    const sf   = 1 + accelScalePPM * 1e-6;

    return clean.map((v, i) => {
      this.accelBias[i] = a_b * this.accelBias[i] + q_b * boxMullerGaussian(rand(), rand());

      const wn = vrw_sigma * boxMullerGaussian(rand(), rand());
      const raw = v * sf + this.accelBias[i] + wn + this.accelQuant[i];
      const q   = accelQuantMs2;
      const quantised = Math.round(raw / q) * q;
      this.accelQuant[i] = raw - quantised;

      return quantised;
    }) as [number, number, number];
  }

  reset(): void {
    this.gyroBias  = [0, 0, 0];
    this.accelBias = [0, 0, 0];
    this.gyroQuant = [0, 0, 0];
    this.accelQuant = [0, 0, 0];
  }
}

// ── GPS Model ─────────────────────────────────────────────────────────────────

export class GPSModel {
  private fixLost    = false;
  private satCount   = 12;
  private multipathX = 0; private multipathY = 0; private multipathZ = 0;
  private latencyBuf: Array<{ x: number; y: number; z: number }> = [];

  constructor(private readonly params: GPSNoiseParams) {}

  /**
   * Apply GPS model to true position/velocity.
   * Returns null when GPS fix is lost (e.g. urban canyon dropout).
   */
  step(
    trueX: number, trueY: number, trueZ: number,
    trueVx: number, trueVy: number, trueVz: number,
    dt: number,
    rand: () => number,
  ): {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    eph: number; epv: number;
    fixType: number; satsVisible: number;
  } | null {
    const p = this.params;

    // ── Fix dropout model ─────────────────────────────────────────────────
    if (!this.fixLost && rand() < p.dropoutProbPerSec * dt) {
      this.fixLost = true;
    } else if (this.fixLost && rand() < 0.1 * dt) {
      // Recover fix (10% chance per second)
      this.fixLost = false;
    }
    if (this.fixLost) return null;

    // ── Satellite count variation ─────────────────────────────────────────
    const [satMin, satMax] = p.satCountRange;
    if (rand() < 0.01) { // occasionally update sat count
      this.satCount = Math.round(satMin + rand() * (satMax - satMin));
    }

    // ── Multipath error (correlated, slow-changing) ───────────────────────
    const mp_tau = 30; // s — multipath correlation time
    const a_mp   = Math.exp(-dt / mp_tau);
    const q_mp   = p.multipathSigma * Math.sqrt(1 - a_mp * a_mp);
    this.multipathX = a_mp * this.multipathX + q_mp * boxMullerGaussian(rand(), rand());
    this.multipathY = a_mp * this.multipathY + q_mp * boxMullerGaussian(rand(), rand());
    this.multipathZ = a_mp * this.multipathZ + q_mp * 0.5 * boxMullerGaussian(rand(), rand());

    // ── White position noise ──────────────────────────────────────────────
    const wn_h = p.horizPositionSigma * boxMullerGaussian(rand(), rand());
    const wn_v = p.vertPositionSigma  * boxMullerGaussian(rand(), rand());

    // ── Fix latency: buffer truth positions ──────────────────────────────
    this.latencyBuf.push({ x: trueX, y: trueY, z: trueZ });
    const latencySamples = Math.max(1, Math.round(p.fixLatencyS / dt));
    while (this.latencyBuf.length > latencySamples + 1) this.latencyBuf.shift();
    const delayed = this.latencyBuf[0];

    const reportedX = delayed.x + wn_h + this.multipathX;
    const reportedY = delayed.y + wn_h * 0.7 + this.multipathY;
    const reportedZ = delayed.z + wn_v + this.multipathZ;

    // ── Velocity noise ────────────────────────────────────────────────────
    const vNoise = p.velocitySigma;
    const reportedVx = trueVx + vNoise * boxMullerGaussian(rand(), rand());
    const reportedVy = trueVy + vNoise * boxMullerGaussian(rand(), rand());
    const reportedVz = trueVz + vNoise * boxMullerGaussian(rand(), rand());

    // ── DOP estimates ─────────────────────────────────────────────────────
    const eph = p.horizPositionSigma * 100; // cm
    const epv = p.vertPositionSigma  * 100; // cm

    return {
      x: reportedX, y: reportedY, z: reportedZ,
      vx: reportedVx, vy: reportedVy, vz: reportedVz,
      eph, epv,
      fixType: 3, // 3D fix
      satsVisible: this.satCount,
    };
  }

  reset(): void {
    this.fixLost    = false;
    this.satCount   = 12;
    this.multipathX = this.multipathY = this.multipathZ = 0;
    this.latencyBuf = [];
  }
}
