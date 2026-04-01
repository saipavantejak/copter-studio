// DomainRandomizer.ts
// Tier upgrade: Domain Randomization for robust sim-to-real transfer.
// Randomizes mass, prop, battery, motor lag, drag, and sensor noise per episode.
// Based on the technique used by OpenAI for dexterous manipulation.

import { PhysicsConfig } from './PhysicsEngine';
import { SensorConfig } from './SensorNoise';
import { SeededRandom } from './SeededRandom';

export interface DomainRandomConfig {
  enabled: boolean;
  // Mass variation ±%
  massVariationPct:    number;  // e.g. 0.15 = ±15%
  // Propeller efficiency variation ±%
  propEffVariation:   number;  // scales propDiameter effectively
  // Battery voltage variation ±%
  voltageVariation:   number;
  // Motor time constant range [min, max] s
  motorTauRange:      [number, number];
  // Aerodynamic drag coefficient range
  dragRange:          [number, number];
  // Sensor noise intensity range
  imuNoiseRange:      [number, number];
  gpsNoiseRange:      [number, number];
  // Wind enabled probability
  windProbability:    number;
  // Payload shift probability
  payloadProbability: number;
}

export const DEFAULT_DOMAIN_RAND: DomainRandomConfig = {
  enabled: false,
  massVariationPct:    0.15,
  propEffVariation:    0.10,
  voltageVariation:    0.05,
  motorTauRange:       [0.03, 0.09],
  dragRange:           [0.25, 0.75],
  imuNoiseRange:       [0.1, 0.8],
  gpsNoiseRange:       [0.1, 0.6],
  windProbability:     0.3,
  payloadProbability:  0.2,
};

export interface RandomizedEpisodeConfig {
  physicsConfig: PhysicsConfig;
  sensorConfig:  SensorConfig;
  dragCoeff:     number;
  motorTau:      number;
  windEnabled:   boolean;
  payloadEnabled: boolean;
  seed:          number;
}

export class DomainRandomizer {
  constructor(private cfg: DomainRandomConfig) {}

  updateConfig(cfg: Partial<DomainRandomConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  /** Generate a fully randomized episode config from a seeded RNG */
  randomize(
    base: PhysicsConfig,
    rng: SeededRandom,
    seed: number
  ): RandomizedEpisodeConfig {
    if (!this.cfg.enabled) {
      return {
        physicsConfig: { ...base, armLength: base.armLength ?? 0.5 },
        sensorConfig:  { enableNoise: false, imuNoiseLevel: 0.3, gpsNoiseLevel: 0.3 },
        dragCoeff:     0.47,
        motorTau:      0.05,
        windEnabled:   false,
        payloadEnabled: false,
        seed,
      };
    }

    const vary = (v: number, pct: number) =>
      v * (1 + rng.uniform(-pct, pct));

    const randomizedConfig: PhysicsConfig = {
      droneType:      base.droneType,
      mass:           vary(base.mass,            this.cfg.massVariationPct),
      propDiameter:   vary(base.propDiameter,     this.cfg.propEffVariation),
      batteryVoltage: vary(base.batteryVoltage,   this.cfg.voltageVariation),
      armLength:      base.armLength ?? 0.5,   // arm length not randomized — it's a fixed hardware param
    };

    const sensorConfig: SensorConfig = {
      enableNoise:    true,
      imuNoiseLevel:  rng.uniform(...this.cfg.imuNoiseRange),
      gpsNoiseLevel:  rng.uniform(...this.cfg.gpsNoiseRange),
    };

    return {
      physicsConfig:  randomizedConfig,
      sensorConfig,
      dragCoeff:      rng.uniform(...this.cfg.dragRange),
      motorTau:       rng.uniform(...this.cfg.motorTauRange),
      windEnabled:    rng.next() < this.cfg.windProbability,
      payloadEnabled: rng.next() < this.cfg.payloadProbability,
      seed,
    };
  }

  /** Generate a batch of N randomized configs from a master seed */
  randomizeBatch(base: PhysicsConfig, masterSeed: number, n: number): RandomizedEpisodeConfig[] {
    const masterRng = new SeededRandom(masterSeed);
    return Array.from({ length: n }, (_, i) => {
      const epRng = masterRng.fork(i);
      return this.randomize(base, epRng, masterSeed ^ (i * 0x9E3779B9));
    });
  }
}

/** Compute a summary of domain randomization spread for UI display */
export function domainRandSummary(cfg: DomainRandomConfig, base: PhysicsConfig) {
  return {
    massRange:    [base.mass*(1-cfg.massVariationPct), base.mass*(1+cfg.massVariationPct)],
    motorTauRange: cfg.motorTauRange,
    dragRange:    cfg.dragRange,
    imuRange:     cfg.imuNoiseRange,
    windProb:     cfg.windProbability,
  };
}
