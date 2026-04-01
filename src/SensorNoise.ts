// SensorNoise.ts
// Uses SeededRandom for fully reproducible noise — critical for deterministic benchmarks.
// Models: MPU-6050 IMU, BMP280 barometer, u-blox M8N GPS

import { SeededRandom } from './SeededRandom';

export interface SensorConfig {
  enableNoise: boolean;
  imuNoiseLevel: number; // 0–1 scale
  gpsNoiseLevel: number; // 0–1 scale
}

export interface NoisyObservation {
  x: number; y: number; z: number;
  x_dot: number; y_dot: number; z_dot: number;
  phi: number; theta: number; psi: number;
  p: number; q: number; r: number;
}

export class SensorNoise {
  // ── IMU specs (MPU-6050 datasheet) ──────────────────────────────
  private static readonly GYRO_NOISE_DENSITY = 0.005; // rad/s / sqrt(Hz)
  private static readonly GYRO_BIAS_STABILITY  = 0.001; // rad/s — in-run bias
  private static readonly ACCEL_NOISE_DENSITY  = 0.002; // m/s²  / sqrt(Hz)
  // ── Barometer (BMP280) ──────────────────────────────────────────
  private static readonly BARO_NOISE_STD       = 0.025; // m RMS
  private static readonly BARO_DRIFT_RATE      = 0.0005;// m/s drift rate
  // ── GPS (u-blox M8N) ────────────────────────────────────────────
  private static readonly GPS_POS_NOISE_STD    = 0.4;   // m CEP50
  private static readonly GPS_VEL_NOISE_STD    = 0.05;  // m/s

  // Persistent bias states (random-walk)
  private gyroBias = [0, 0, 0];
  public rng = new SeededRandom(42);
  private baroBias = 0;

  reset() {
    this.gyroBias = [this.rng.nextGaussian() * 0.001, this.rng.nextGaussian() * 0.001, this.rng.nextGaussian() * 0.001];
    this.baroBias = this.rng.nextGaussian() * 0.03;
  }

  /** Advance bias random-walk by dt seconds */
  private walkBiases(dt: number) {
    const gw = SensorNoise.GYRO_BIAS_STABILITY * Math.sqrt(dt);
    for (let i = 0; i < 3; i++) this.gyroBias[i] += this.rng.nextGaussian() * gw;
    this.baroBias += this.rng.nextGaussian() * SensorNoise.BARO_DRIFT_RATE * dt;
  }

  applyNoise(
    state: NoisyObservation,
    cfg: SensorConfig,
    dt: number
  ): NoisyObservation {
    if (!cfg.enableNoise) return { ...state };

    const imu = cfg.imuNoiseLevel;
    const gps = cfg.gpsNoiseLevel;
    this.walkBiases(dt);

    const gn = SensorNoise.GYRO_NOISE_DENSITY;
    const an = SensorNoise.ACCEL_NOISE_DENSITY;
    const bn = SensorNoise.BARO_NOISE_STD;
    const pn = SensorNoise.GPS_POS_NOISE_STD;
    const vn = SensorNoise.GPS_VEL_NOISE_STD;

    return {
      // GPS position (10 Hz update, constant noise floor)
      x:     state.x     + this.rng.nextGaussian() * pn * gps,
      y:     state.y     + this.rng.nextGaussian() * pn * gps,
      // Barometer altitude (50 Hz, with slow drift)
      z:     state.z     + this.baroBias + this.rng.nextGaussian() * bn * imu,
      // GPS velocity
      x_dot: state.x_dot + this.rng.nextGaussian() * vn * gps,
      y_dot: state.y_dot + this.rng.nextGaussian() * vn * gps,
      z_dot: state.z_dot + this.rng.nextGaussian() * an * imu,
      // IMU — Euler angles estimated via complementary filter (approx.)
      phi:   state.phi   + this.rng.nextGaussian() * gn * imu,
      theta: state.theta + this.rng.nextGaussian() * gn * imu,
      psi:   state.psi   + this.rng.nextGaussian() * gn * imu,
      // Gyroscope rates + bias + white noise
      p:     state.p     + this.gyroBias[0] + this.rng.nextGaussian() * gn * imu,
      q:     state.q     + this.gyroBias[1] + this.rng.nextGaussian() * gn * imu,
      r:     state.r     + this.gyroBias[2] + this.rng.nextGaussian() * gn * imu,
    };
  }
}
