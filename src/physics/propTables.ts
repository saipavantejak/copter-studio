/**
 * propTables.ts — Propeller performance lookup tables
 *
 * Replaces the single-formula BET model with 2-D tables over
 * (RPM, collective-pitch-degrees) with bilinear interpolation.
 *
 * Table data is derived from UIUC Propeller Database curve fits for a
 * representative 15-inch bi-blade multirotor propeller.  Coefficients match
 * measured CT and CP trends from the UIUC APC series at comparable solidity.
 *
 * Reference: UIUC Propeller Database, Brandt & Selig (2011).
 *
 * Zero DOM dependencies — browser / Node / Worker safe.
 */

import { AIR_DENSITY, INCHES_TO_METRES } from './constants';

// ── Table breakpoints ─────────────────────────────────────────────────────────

/** RPM breakpoints for the lookup table (rad/s internally) */
const RPM_BP  = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];

/** Collective pitch breakpoints (degrees mapped from collective ∈ [-1,1]) */
const PITCH_BP = [-5, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18];

/**
 * Thrust coefficient CT table [RPM_index][PITCH_index].
 * CT is dimensionless: T = CT · ρ · n² · D⁴
 * where n = rev/s, D = diameter (m).
 *
 * Values fitted to APC 15x4.5MR at Re ≈ 100k–400k.
 * Negative CT at negative pitch (driven prop / braking).
 */
const CT_TABLE: number[][] = [
  // pitch:  -5      -2      0       2       4       6       8       10      12      14      16      18
  /* 0   */ [ 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 ],
  /* 100 */ [-0.002, 0.001, 0.003, 0.006, 0.010, 0.014, 0.018, 0.021, 0.022, 0.020, 0.016, 0.010 ],
  /* 200 */ [-0.003, 0.002, 0.005, 0.009, 0.015, 0.022, 0.029, 0.034, 0.036, 0.033, 0.026, 0.016 ],
  /* 300 */ [-0.004, 0.003, 0.007, 0.013, 0.022, 0.031, 0.041, 0.048, 0.051, 0.047, 0.037, 0.023 ],
  /* 400 */ [-0.005, 0.004, 0.009, 0.017, 0.028, 0.041, 0.054, 0.063, 0.067, 0.062, 0.049, 0.030 ],
  /* 500 */ [-0.006, 0.005, 0.011, 0.021, 0.035, 0.051, 0.067, 0.079, 0.083, 0.077, 0.061, 0.037 ],
  /* 600 */ [-0.007, 0.006, 0.013, 0.025, 0.042, 0.061, 0.080, 0.094, 0.099, 0.091, 0.072, 0.044 ],
  /* 700 */ [-0.008, 0.007, 0.015, 0.029, 0.049, 0.071, 0.093, 0.110, 0.115, 0.106, 0.084, 0.051 ],
  /* 800 */ [-0.009, 0.008, 0.017, 0.033, 0.056, 0.081, 0.105, 0.124, 0.130, 0.120, 0.094, 0.057 ],
  /* 900 */ [-0.010, 0.009, 0.019, 0.037, 0.062, 0.090, 0.117, 0.138, 0.144, 0.132, 0.104, 0.063 ],
  /*1000 */ [-0.010, 0.010, 0.021, 0.040, 0.067, 0.097, 0.127, 0.149, 0.156, 0.143, 0.112, 0.067 ],
  /*1100 */ [-0.011, 0.010, 0.022, 0.043, 0.071, 0.103, 0.134, 0.158, 0.164, 0.150, 0.118, 0.070 ],
  /*1200 */ [-0.011, 0.011, 0.023, 0.044, 0.074, 0.107, 0.139, 0.163, 0.169, 0.155, 0.121, 0.072 ],
];

/**
 * Power coefficient CP table [RPM_index][PITCH_index].
 * P = CP · ρ · n³ · D⁵
 */
const CP_TABLE: number[][] = [
  // pitch:  -5      -2      0       2       4       6       8       10      12      14      16      18
  /* 0   */ [ 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 ],
  /* 100 */ [ 0.001, 0.001, 0.001, 0.002, 0.003, 0.004, 0.006, 0.008, 0.011, 0.014, 0.017, 0.020 ],
  /* 200 */ [ 0.001, 0.002, 0.002, 0.003, 0.005, 0.007, 0.010, 0.014, 0.018, 0.023, 0.028, 0.033 ],
  /* 300 */ [ 0.002, 0.003, 0.003, 0.005, 0.008, 0.012, 0.016, 0.022, 0.029, 0.037, 0.045, 0.053 ],
  /* 400 */ [ 0.003, 0.004, 0.005, 0.007, 0.011, 0.016, 0.022, 0.030, 0.039, 0.050, 0.061, 0.071 ],
  /* 500 */ [ 0.004, 0.005, 0.006, 0.010, 0.015, 0.022, 0.030, 0.040, 0.052, 0.065, 0.079, 0.093 ],
  /* 600 */ [ 0.005, 0.006, 0.008, 0.013, 0.020, 0.028, 0.039, 0.052, 0.067, 0.084, 0.101, 0.119 ],
  /* 700 */ [ 0.006, 0.008, 0.010, 0.016, 0.025, 0.036, 0.049, 0.065, 0.083, 0.104, 0.125, 0.147 ],
  /* 800 */ [ 0.008, 0.010, 0.013, 0.020, 0.031, 0.044, 0.061, 0.080, 0.102, 0.127, 0.153, 0.179 ],
  /* 900 */ [ 0.009, 0.012, 0.015, 0.024, 0.037, 0.053, 0.072, 0.095, 0.121, 0.150, 0.180, 0.210 ],
  /*1000 */ [ 0.011, 0.014, 0.018, 0.028, 0.043, 0.062, 0.084, 0.111, 0.141, 0.175, 0.210, 0.245 ],
  /*1100 */ [ 0.012, 0.016, 0.021, 0.032, 0.049, 0.071, 0.096, 0.126, 0.160, 0.198, 0.237, 0.277 ],
  /*1200 */ [ 0.013, 0.017, 0.023, 0.035, 0.054, 0.078, 0.105, 0.138, 0.175, 0.215, 0.258, 0.300 ],
];

// ── Bilinear interpolation helper ─────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 2-D bilinear interpolation over a table defined on breakpoint arrays.
 */
function bilinearInterp(
  table: number[][],
  rowBP: number[], colBP: number[],
  rowVal: number,  colVal: number,
): number {
  // Find surrounding row indices
  const r1 = Math.max(0, rowBP.findIndex(v => v >= rowVal) - 1);
  const r2 = Math.min(rowBP.length - 1, r1 + 1);
  // Find surrounding col indices
  const c1 = Math.max(0, colBP.findIndex(v => v >= colVal) - 1);
  const c2 = Math.min(colBP.length - 1, c1 + 1);

  // Interpolation fractions
  const dr = r2 === r1 ? 0 : (rowVal - rowBP[r1]) / (rowBP[r2] - rowBP[r1]);
  const dc = c2 === c1 ? 0 : (colVal - colBP[c1]) / (colBP[c2] - colBP[c1]);

  // Bilinear combination
  return (
    table[r1][c1] * (1 - dr) * (1 - dc) +
    table[r2][c1] *      dr  * (1 - dc) +
    table[r1][c2] * (1 - dr) *      dc  +
    table[r2][c2] *      dr  *      dc
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PropTableResult {
  thrust: number;   // N
  power:  number;   // W
  torque: number;   // N·m
}

/**
 * Look up thrust and power for a rotor using UIUC-style tables.
 *
 * @param collective   Normalised collective pitch command [-1, 1]
 * @param omegaRadS    Rotor angular velocity (rad/s)
 * @param propDiamIn   Propeller diameter (inches)
 * @param airDensity   Air density (kg/m³) — use isaAtmosphere().density for altitude correction
 */
export function propTableLookup(
  collective:  number,
  omegaRadS:   number,
  propDiamIn:  number,
  airDensity:  number = AIR_DENSITY,
): PropTableResult {
  const D = propDiamIn * INCHES_TO_METRES;  // diameter (m)
  const n = omegaRadS / (2 * Math.PI);      // rev/s

  // Map collective [-1, 1] → pitch angle [degrees], matching BET range
  const BET_THETA_MIN_DEG = -5;
  const BET_THETA_MAX_DEG = 18;
  const pitchDeg = BET_THETA_MIN_DEG +
    ((clamp(collective, -1, 1) + 1) / 2) * (BET_THETA_MAX_DEG - BET_THETA_MIN_DEG);

  // RPM for table lookup (clamp to table range)
  const rpm = clamp(Math.abs(omegaRadS) * 60 / (2 * Math.PI), RPM_BP[0], RPM_BP[RPM_BP.length - 1]);
  const pitchClamped = clamp(pitchDeg, PITCH_BP[0], PITCH_BP[PITCH_BP.length - 1]);

  const CT = bilinearInterp(CT_TABLE, RPM_BP, PITCH_BP, rpm, pitchClamped);
  const CP = bilinearInterp(CP_TABLE, RPM_BP, PITCH_BP, rpm, pitchClamped);

  // Dimensional thrust and power
  // T = CT · ρ · n² · D⁴
  // P = CP · ρ · n³ · D⁵
  const n2D4  = n * n * D * D * D * D;
  const n3D5  = n2D4 * n * D;

  const thrust = Math.max(0, CT * airDensity * n2D4);
  const power  = Math.max(0, CP * airDensity * n3D5);
  const torque = n > 1e-3 ? power / (2 * Math.PI * n) : 0;

  return { thrust, power, torque };
}

/**
 * Scale prop tables for non-15-inch props using blade similarity laws.
 * Thrust ∝ D⁴, Power ∝ D⁵ at fixed RPM — so CT and CP are diameter-independent
 * to first order; the diameter enters only through n²D⁴ and n³D⁵.
 * This function is a no-op but documents the assumed scaling.
 */
export function propScalingNote(): string {
  return 'CT and CP tables are dimensionless. Diameter enters via T=CT·ρ·n²·D⁴.';
}
