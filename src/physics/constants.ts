// src/physics/constants.ts
// Single source of truth for all physics constants shared between
// PhysicsEngine (browser), gymBridge (Node), and the episode worker.
// No DOM dependencies — safe to import anywhere.

// ── Environment ───────────────────────────────────────────────────────────────
export const GRAVITY      = 9.81;   // m/s²
export const AIR_DENSITY  = 1.225;  // kg/m³ at sea level 15°C

// ── Blade Element Theory (BET) ────────────────────────────────────────────────
export const BET_NB    = 2;      // number of blades
export const BET_LIFT  = 5.7;    // 2D lift curve slope (1/rad)
export const BET_CHORD = 0.025;  // blade chord width (m)
// Collective pitch mapping: cmd ∈ [-1,1] → θ ∈ [-5°, 18°]
export const BET_THETA_MIN_DEG = -5;
export const BET_THETA_MAX_DEG = 18;

// ── Motor / ESC dynamics ──────────────────────────────────────────────────────
export const MOTOR_TAU  = 0.05;  // s — first-order ESC + motor lag (50 ms typical)
export const OMEGA_IDLE = 100;   // rad/s — minimum rotor speed at zero throttle
export const OMEGA_MAX  = 1200;  // rad/s — maximum rotor speed at full throttle

// ── Simulation timestep ───────────────────────────────────────────────────────
export const DT = 0.016;         // s ≈ 62.5 Hz (one animation frame at 60 fps)

// ── Unit conversion ───────────────────────────────────────────────────────────
export const INCHES_TO_METRES = 0.0254;

// ── High-fidelity aerodynamics (v12) ─────────────────────────────────────────
// Scalar drag coefficient used when high-fidelity drag tensor is disabled.
export const DRAG_SCALAR     = 0.47;   // dimensionless Cd (body-averaged)

// Ground effect — Cheeseman-Bennett formula active below this height (rotor radii)
export const GROUND_EFFECT_MAX_Z_OVER_R = 10.0;

// Atmospheric reference altitude for ISA corrections (sea level default)
export const ISA_REF_ALT_M   = 0.0;   // m

// Earth radius for NED ↔ lat/lon conversion (HIL bridge)
export const EARTH_RADIUS_M  = 6_371_000;  // m (mean spherical)

// MAVLink HIL — default ports
export const HIL_PORT_LISTEN = 14550;
export const HIL_PORT_SEND   = 14560;
