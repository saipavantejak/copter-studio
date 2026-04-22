// src/physics/constants.ts
// Single source of truth for all physics constants shared between
// PhysicsEngine (browser), gymBridge (Node), and the episode worker.
// No DOM dependencies — safe to import anywhere.

// ── Environment ───────────────────────────────────────────────────────────────
export const GRAVITY      = 9.81;   // m/s²
export const AIR_DENSITY  = 1.225;  // kg/m³ at sea level 15°C

// ── Blade Element Theory (BET) ────────────────────────────────────────────────
// Source: APC 15x4.5 MR propeller at Re ≈ 100k–400k
// Reference: UIUC Propeller Database, Brandt & Selig (2011)
export const BET_NB    = 2;      // number of blades
export const BET_LIFT  = 5.7;    // 2D lift curve slope (1/rad) — thin airfoil theory ≈ 2π
export const BET_CHORD = 0.025;  // blade chord width (m) — APC 15" measured at 75% span
// Collective pitch mapping: cmd ∈ [-1,1] → θ ∈ [-5°, 18°]
export const BET_THETA_MIN_DEG = -5;   // reverse pitch limit (braking)
export const BET_THETA_MAX_DEG = 18;   // max pitch before stall at operating Re

// ── Motor / ESC dynamics ──────────────────────────────────────────────────────
// Typical ranges: cheap ESC τ=0.08–0.15s, DJI-class τ=0.02–0.03s, hobby τ=0.04–0.06s
export const MOTOR_TAU  = 0.05;  // s — first-order ESC + motor lag (50 ms typical)
export const OMEGA_IDLE = 100;   // rad/s — minimum rotor speed at zero throttle
export const OMEGA_MAX  = 1200;  // rad/s — maximum rotor speed at full throttle

// ── Simulation timestep ───────────────────────────────────────────────────────
export const DT = 0.016;         // s ≈ 62.5 Hz (one animation frame at 60 fps)

// ── Unit conversion ───────────────────────────────────────────────────────────
export const INCHES_TO_METRES = 0.0254;

// ── Actuator-disk power model ────────────────────────────────────────────────
// Induced hover power from momentum theory:
//     P_ideal = (m·g)^1.5 / sqrt(2·ρ·A_total)
// Real drones are less efficient than an ideal disk — Figure of Merit folds
// in tip losses, profile drag on the blade, and swirl.
//   • Good carbon-fibre large multirotor: FoM ≈ 0.70
//   • Typical APC plastic MR prop:        FoM ≈ 0.55
//   • Small coreless nano-prop:           FoM ≈ 0.40
// The motor + ESC then adds electrical losses.
export const FIGURE_OF_MERIT  = 0.55;   // shaft power = P_ideal / FoM
export const MOTOR_ESC_EFF    = 0.82;   // electrical → shaft efficiency (ESC · motor)
export const IDLE_POWER_W     = 0.05;   // avionics / flight-controller baseline draw

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
