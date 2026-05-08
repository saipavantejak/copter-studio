# Copter Studios — Beginner's Guide

A friendly walkthrough for first-time users. If you'd rather read this inside the app, click the **Guide** button in the top-right of the header — same content, with a search box and section navigation.

> **TL;DR** — Pick a quick preset, press the green **Start Simulation** button, and a 3D drone will hover at 1 m. Toggle Wind or Failure Mode to stress-test it. Use the **Aether AI** panel on the right to run scenarios in plain English.

---

## What is Copter Studios?

Copter Studios is a browser-based **drone flight simulator**. It runs a real physics engine (Blade-Element-Theory thrust model, RK4 quaternion integration, ISA atmosphere, Dryden turbulence) so the bi-, quad-, and hexacopters you build behave like real aircraft.

**You don't need to install anything.** Everything runs in your browser. No accounts. No setup.

### Who is it for?

- **Hobbyists** — learn how multirotors fly and what changing mass / prop / battery does.
- **Students & researchers** — train RL controllers in Google Colab and benchmark them here.
- **Engineers** — prototype configurations and tuning before cutting carbon.

---

## Your first flight (3 minutes)

### Step 1 — Pick a preset

In the **Drone Configurator** panel on the left, click one of the quick-preset buttons:

| Preset | Mass | Prop | Best for |
|---|---|---|---|
| **Nano (Crazyflie)** | 27 g | 1.5″ | Smallest drone in the world |
| **Micro Racer** | 2.5 kg | 8″ | Fast, agile quadcopter |
| **Research Bi** | 5 kg | 15″ | Well-mannered first flight |
| **Cargo Quad** | 8 kg | 18″ | Heavy-lift quadcopter |
| **Heavy Hex** | 15 kg | 22″ | Six-rotor cargo platform |

The four sliders below the presets snap to a known-good config.

### Step 2 — Press Start Simulation

The 3D viewport in the centre of the screen shows a translucent launch overlay. Click the green **Start Simulation** button, confirm the prompt, and the drone will hover at 1 m. Watch the bottom-left telemetry update at 60 fps:

- `ALT` — altitude in metres
- `ROLL` / `PITCH` — attitude in degrees
- `Vz` — vertical velocity (m/s)
- `BAT` — battery percentage
- `T` — elapsed time

### Step 3 — Try a stress test

Toggle one of the test modules in the configurator and watch the drone respond:

- **Wind & Turbulence** — gusty wind, drone sways, controller fights back
- **Failure Mode** — kills one motor (quads usually crash; hexes survive)
- **Battery Endurance** — voltage drops over time, thrust authority decreases

To stop the simulation, click the small red **Stop** button in the top-right of the viewport. The next Start gives you a fresh launch.

---

## The six tabs

The tab bar at the top of the app switches between six workspaces. Beginners only need the first one.

| Tab | What it does |
|---|---|
| **Simulation** | The main 3D viewport. Configure on the left, fly in the middle, talk to Aether on the right. |
| **Benchmark** | Run dozens of episodes back-to-back to measure crash rate, mean SEC, and stability. Optional domain-randomization shakes mass / wind / sensor noise per episode. |
| **Policy X-Ray** | For loaded RL models. Shows which sensors the policy attends to (Jacobian sensitivity) and visualises action distributions. |
| **Digital Twin** | Calibrate the simulator against a CSV of real flight data so sim behaviour matches a specific physical drone. |
| **Gym Bridge** | Documentation for the WebSocket gym server. Used by Python (Stable-Baselines3 etc.) to train RL policies against this physics engine. |
| **Leaderboard** | Your best flights ranked by SEC. Share configs as URLs. |

---

## The Drone Configurator

### Drone type

- **Bicopter** — 2 motors with tilting nacelles. Hard to balance, fun to watch.
- **Quadcopter** — 4 motors in X-configuration. The standard. What DJI sells.
- **Hexacopter** — 6 motors. Survives a single motor failure.

### Sliders

| Slider | What it controls |
|---|---|
| **Mass** | Total weight in kg. Heavier needs more thrust. Range 0.02 – 20 kg. |
| **Prop Ø** | Propeller diameter in inches. Bigger = more thrust per RPM, but slower spin-up. |
| **Battery V** | Pack voltage. 3.7 V (1S nano) → 44.4 V (12S heavy). Higher V → more peak thrust. |
| **Arm length** | Motor-to-centre distance. Bigger = more roll/pitch authority but more inertia. |

The hint text under each slider shows typical ranges. Stay inside them for realistic behaviour; venture outside to see what breaks.

### Test modules

| Toggle | Effect |
|---|---|
| **Wind & Turbulence** | Stochastic gusts (0 – 40 mph) using a Dryden turbulence model. |
| **Payload Dynamics** | Centre-of-gravity shifts ±10 % during flight (swinging cargo). |
| **Battery Endurance** | Voltage drops as the pack drains. |
| **Failure Mode** | Kills one motor. |
| **Sensor Noise** | Adds Gaussian noise to IMU and GPS readings. |

### Mission presets

| Preset | Goal |
|---|---|
| **None** | Hover at 1 m. |
| **Long-Range** | Fly 10 km forward with steady headwind. |
| **High-Speed** | Fly 1 km forward as fast as possible. |
| **Precision-Drop** | Hover with a swinging payload. |

---

## Aether AI panel

Aether is an AI sim-operator on the right of the Simulation tab. Type plain English; it configures the simulator for you. It always shows what it interpreted in an **Approval Required** dialog before touching anything.

### Things you can ask

- *"Hover at 2 meters with a 7 kg bicopter."*
- *"Run a 50-episode benchmark on a quad with wind enabled."*
- *"Fly forward at 5 m/s for 10 seconds."*
- *"Train an RL policy for a 9 kg cargo quad."*
- *"Audit current SEC and SPT and suggest improvements."*

### Toolbar buttons

| Button | What it does |
|---|---|
| **Export SB3** | Generates a Python Stable-Baselines3 starter script for your config. |
| **Colab Notebook** | Downloads a Jupyter notebook pre-wired for Google Colab GPU training. |
| **Copy Notebook** | Copies the same notebook JSON to your clipboard — paste it directly into Colab. |
| **Forensics** | Opens a crash post-mortem with full state trace (only after a crash). |
| **Audit** | Asks Aether to grade your current run on energy and stability. |
| **Reward Fn** | Asks Aether to write an RL reward function for your goal. |

If the cloud AI is offline, Aether falls back to a local parser that still understands basic commands like `"hover"`, `"fly forward"`, `"run wind test"`. You're never locked out.

---

## Training your own RL policy

Out of the box the simulator flies with a tuned heuristic PID controller. To train a neural-network policy that flies your specific drone, follow this loop:

1. **Generate a Colab notebook** — In the Aether toolbar, click **Colab Notebook** (downloads) or **Copy Notebook** (clipboard). Your exact mass / prop / voltage are baked in.
2. **Run it in Google Colab** — Open [colab.research.google.com](https://colab.research.google.com), `File → Upload Notebook`, select the `.ipynb`, run all cells. ~15 min on the free GPU.
3. **Download `cargo_policy.zip`** — The notebook auto-downloads when training completes.
4. **Load it in the simulator** — Drag `model.json` and `weights.bin` into the **Load RL Model** dropzone in the Simulation tab. The status changes from "Heuristic PD" to "Loaded RL Agent".
5. **Benchmark it** — Switch to the Benchmark tab and run 50 – 100 episodes. Compare against the heuristic baseline.

---

## Glossary

| Term | Meaning |
|---|---|
| **BET** | Blade Element Theory — physics model that computes propeller thrust from blade geometry, pitch, and rotor speed. |
| **RK4** | Runge-Kutta 4 — a 4th-order numerical integrator used to step the rigid-body state forward in time. |
| **ISA** | International Standard Atmosphere — gives air density at any altitude. |
| **Dryden** | Spectral turbulence model from MIL-HDBK-1797B used for realistic wind gusts. |
| **SEC** | Specific Energy Consumption — Joules per gram of payload per kilometre. Lower = better. |
| **SPT** | Servo-Per-Tilt — measures how much the controller is twitching. Lower = smoother flight. |
| **PID** | Proportional-Integral-Derivative — feedback control algorithm. |
| **T/W** | Thrust-to-Weight ratio. T/W = 1 means just hover; T/W > 2 is normal. |
| **FoM** | Figure of Merit — rotor efficiency. Real multirotors are ~0.55 (vs an ideal disk at 1.0). |
| **Domain randomization** | During benchmark, mass / wind / sensor noise are jittered per episode to test robustness. |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Drone won't lift off | Mass is too heavy for prop/voltage. Pick a quick preset or lower mass / increase prop diameter. |
| Drone crashes immediately | Initial conditions or aggressive disturbance overwhelmed the controller. Disable Failure Mode and Wind, then re-enable one at a time. |
| Hover drifts in altitude | Controller is fighting external disturbance. Toggle off Wind / Payload Shift to verify hover is stable in calm. |
| Aether says "cloud AI unavailable" | The Gemini integration isn't configured. Local commands like `"hover at 2 m"` still work. |
| 3D viewport is blank | Browser missing WebGL. Try Chrome, Edge, or Firefox. |
| Want to start the tour again | Open the in-app **Guide**, then click **Replay onboarding tour** in the sidebar. |

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Esc` | Close any modal (Guide, Forensics, Replay) |
| `Enter` | Send message in the Aether chat input |

---

## Where to get help

- Open an issue on [GitHub](https://github.com/saipavantejak/copter-studio/issues)
- Type a question into the Aether chat — it can explain its own state and suggest fixes
- Re-trigger the guided onboarding tour from the in-app **Guide**

Happy flying.
