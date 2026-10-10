# Copter Studios

Browser-based drone flight simulator — RK4/BET dynamics, TF.js RL training, MAVLink HIL bridge, and Gemini-powered NLP control. The interactive simulator runs in the browser; bridges and training scripts run separately.

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![TensorFlow.js](https://img.shields.io/badge/TF.js-4.22-ff6f00)
![Three.js](https://img.shields.io/badge/Three.js-0.183-black)
![License](https://img.shields.io/badge/License-MIT-green)

**[Launch Live Demo](https://copter-studio.vercel.app)**

<p align="center">
  <img src="public/logo-dark.png" alt="Copter Studios" width="200" />
</p>

> **3D drone simulator** with real-time physics, RL training panel, Aether AI chat interface, crash forensics, and benchmark dashboards — all in one browser tab. Clone and run `npm run dev` to see it in action.

## Features

- **Real-time Physics Engine** — RK4 integration, quaternion attitude, Blade Element Theory thrust, ISA atmosphere, Dryden MIL-HDBK-1797B turbulence, Cheeseman-Bennett ground effect, spring-damper ground contact with Coulomb friction, thermal updrafts
- **3D Visualization** — Three.js / React Three Fiber drone rendering with real-time telemetry overlay
- **RL Training** — TensorFlow.js inference in-browser + WebSocket Gym Bridge for Python (stable-baselines3) training
- **Aether NLP** — Natural language simulation commands powered by Gemini 2.5 Flash with local regex fallback
- **Multi-drone Support** — Bicopter, quadcopter, hexacopter, octocopter configurations
- **Robustness Testing** — Domain randomization, sensor noise (MPU-6050, BMP280, u-blox M8N), motor-out, battery sag, wind stress
- **Benchmarking** — Deterministic seeded episodes, crash forensics, policy X-Ray explainability
- **Digital Twin** — Calibration UI for matching sim parameters to real hardware
- **MAVLink HIL Bridge** — Hardware-in-the-loop integration (MAVLink v2, zero dependencies)
- **CI/CD Ready** — Headless benchmark runner with pass/fail thresholds

## Quick Start

### Prerequisites

- Node.js 22.13+ or 24+ (required by the locked tooling)
- npm 9+

### Installation

```bash
git clone https://github.com/saipavantejak/copter-studio.git
cd copter-studio
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Optional: Enable Aether AI

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Copy `.env.example` to `.env.local`
3. Add your key: `GEMINI_API_KEY=your_key_here`

The app works fully without Gemini — Aether falls back to the local regex parser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm test` | Run tests (vitest) |
| `npm run lint` | TypeScript type-check |
| `npm run gym-bridge` | Start WebSocket bridge for Python RL training |
| `npm run hil-bridge` | Start MAVLink HIL bridge |
| `npm run ci:benchmark` | Headless CI benchmark (50 episodes) |
| `npm run ci:benchmark:strict` | Strict benchmark (100 episodes, 30% mission non-success threshold) |

## Project Structure

```
copter-studio/
├── src/
│   ├── physics/          # Core physics (atmosphere, ground effect, sensors, prop tables)
│   ├── tabs/             # UI tab components (Simulation, Benchmark, Gym, etc.)
│   ├── context/          # React context (global app state)
│   ├── hooks/            # Custom React hooks
│   ├── workers/          # Web Workers (episode runner)
│   ├── PhysicsEngine.ts  # Main simulation engine (RK4 + BET)
│   ├── RLAgent.ts        # TensorFlow.js RL inference
│   ├── SimulationParser.ts # Aether NLP (Gemini + local fallback)
│   ├── DroneSim.tsx      # 3D drone visualization
│   └── App.tsx           # Root component
├── server/
│   ├── gymBridge.ts      # WebSocket ↔ OpenAI Gym bridge
│   └── mavlinkHILBridge.ts # MAVLink v2 HIL bridge
├── api/
│   └── gemini.ts         # Vercel serverless function (Gemini proxy)
├── scripts/
│   └── ci-benchmark.ts   # Headless CI benchmark runner
├── public/
│   ├── demo_model/       # Pre-trained demo model
│   └── swash-bicop-colab-trainer.ipynb  # Google Colab training notebook
└── vite.config.ts        # Vite + Gemini proxy plugin
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add `GEMINI_API_KEY` to Environment Variables (optional)
4. Deploy — Vercel auto-detects Vite and handles the serverless function in `api/`

### Static Hosting (Netlify, GitHub Pages, etc.)

```bash
npm run build
```

Serve the `dist/` folder. Note: Aether AI requires a serverless backend for the Gemini proxy — without it, the local regex parser is used.

## RL Training with Python

1. Start the Gym Bridge: `npm run gym-bridge`
2. Illustrative Python integration (requires registering the bridge-backed Gym environment; not an evaluated PPO result):

```python
# See public/swash-bicop-colab-trainer.ipynb for full example
import gymnasium as gym
from stable_baselines3 import PPO

# Connect to the WebSocket gym bridge
env = gym.make("CopterStudios-v1", ws_url="ws://localhost:8765")
model = PPO("MlpPolicy", env)
model.learn(total_timesteps=100_000)
```

## Air-Gap Mode

For restricted networks without external API access:

```javascript
window.__AIRGAP_MODE = true;
```

All Gemini API calls are disabled. Aether uses the local parser exclusively.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5.8, Tailwind CSS 4 |
| 3D | Three.js, React Three Fiber, Drei |
| ML | TensorFlow.js 4.22 |
| Charts | Recharts |
| Animation | Motion (Framer Motion) |
| Build | Vite 6 |
| Test | Vitest, Testing Library |
| AI | Gemini 2.5 Flash (server-side proxy) |
| Backend | Express, WebSocket |

## License

MIT

<!-- BEGIN GENERATED ML EVALUATION -->
## Reproducible ML evaluation

The current simulation-only artifact is [`public/learning/residual-policy.json`](public/learning/residual-policy.json). `physicalValidation=false`, `passesSimulationGate=false`, and `promoted=false`. The existing controller remains active.

Training: 3 predeclared runs × 600 episodes = 1800 episodes. Settings, state bins, reward, physics, success criteria and the candidate gate are unchanged. Validation banks: 200001–200050 (calm), 201001–201050 (synthetic wind). Fresh final banks: 300001–300050 (calm), 301001–301050 (wind). No tuning or winner selection was performed. Legacy test banks were used only to reproduce and diagnose the historical run.

| Training seed | Scenario | Baseline successes | Policy successes | Baseline altitude error (m) | Policy altitude error (m) | Baseline reward | Policy reward | Gate |
|---|---|---|---|---|---|---|---|---|
| 314159 | Calm | 50/50 | 50/50 | 0.026406 | 0.035383 | -27.751174 | -42.950386 | Fail |
| 314159 | Wind | 0/50 | 0/50 | 0.158275 | 0.153262 | -1000.546097 | -999.968646 | Fail |
| 271828 | Calm | 50/50 | 50/50 | 0.026406 | 0.044399 | -27.751174 | -50.181579 | Fail |
| 271828 | Wind | 0/50 | 0/50 | 0.158275 | 0.172537 | -1000.546097 | -1002.149485 | Fail |
| 161803 | Calm | 50/50 | 50/50 | 0.026406 | 0.045299 | -27.751174 | -50.365393 | Fail |
| 161803 | Wind | 0/50 | 0/50 | 0.158275 | 0.166930 | -1000.546097 | -1002.425054 | Fail |

| Scenario | Mean policy − baseline reward | Crossed-bootstrap 95% CI | Training-run t 95% CI (fixed episode bank) |
|---|---|---|---|
| Calm | -20.081278 | [-24.154069, -15.325759] | [-30.586678, -9.575878] |
| Wind | -0.968298 | [-2.373722, 0.486239] | [-4.311276, 2.374680] |

There are 50 unique final IC seeds per scenario, shared across the three policies: 100 unique baseline flights and 300 policy flights. Repeated baseline records are not independent observations. Each run's calm success rate has a Wilson 95% CI of [0.928652, 1.000000]; each wind success rate has CI [0.000000, 0.071348]. The crossed bootstrap resamples training runs and shared episode seeds; only three training runs are available. Degenerate observed success-difference intervals do not prove equal underlying success probabilities. The historical candidate gate is applied separately to every run; no seed is selected as a winner.

### Limitations

Simulation only; `physicalValidation=false`. Synthetic sinusoidal wind is uncalibrated for this nano configuration and every final wind flight terminates at the numerical operating envelope. Conditional pre-failure altitude error cannot establish robustness. No measured gust or battery-to-depletion endurance labels exist. The policy observes only altitude error and vertical speed and changes motor collective commands; no physical-flight performance claim is supported. The Q-table at the top level is the first predeclared run for compatibility, not a selected best policy.

Reproduction commands, original and refreshed numeric-claim tables, diagnosis and a supported resume statement are in [`reports/ml-evaluation-audit.md`](reports/ml-evaluation-audit.md). The CI benchmark's mission non-success threshold is separate from the RL promotion gate.

<!-- END GENERATED ML EVALUATION -->
