// UserGuide.tsx — Beginner-friendly help modal
// Always one click away via the "?" button in the app header. Walks new users
// through what Copter Studios is, the three things they should try first,
// every tab in the app, every slider in the configurator, the test toggles,
// the Aether AI panel, common questions, and a small glossary.

import { useState, useEffect, useRef, type ReactElement } from 'react';
import {
  X, Search, Rocket, Wind, BarChart2, Eye, Settings, Terminal, Trophy,
  Bot, Sliders, AlertTriangle, BookOpen, Lightbulb, ChevronRight,
} from 'lucide-react';

const STORAGE_KEY_TOUR = 'copter-studios-onboarding-v1';

interface UserGuideProps {
  onClose: () => void;
}

interface Section {
  id: string;
  label: string;
  icon: any;
  body: () => ReactElement;
}

// ── Reusable atoms ──────────────────────────────────────────────────────────

const H = ({ children }: { children: React.ReactNode }) =>
  <h3 className="text-sm font-bold text-emerald-700 mb-2 mt-5 first:mt-0">{children}</h3>;

const P = ({ children }: { children: React.ReactNode }) =>
  <p className="text-ink text-[13px] leading-relaxed mb-3">{children}</p>;

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="flex gap-3 mb-3">
    <div className="shrink-0 w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-700 font-bold text-xs">{n}</div>
    <div className="flex-1">
      <div className="text-ink font-semibold text-[13px] mb-0.5">{title}</div>
      <div className="text-muted text-[12px] leading-relaxed">{children}</div>
    </div>
  </div>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 my-3 flex gap-2">
    <Lightbulb className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
    <div className="text-emerald-800/90 text-[12px] leading-relaxed">{children}</div>
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) =>
  <code className="bg-surface border border-line-strong px-1.5 py-0.5 rounded text-[11px] font-mono text-emerald-700">{children}</code>;

const Row = ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
  <div className="flex gap-3 py-1.5 border-b border-line/60 last:border-0 text-[12px]">
    <div className="w-32 shrink-0 text-muted font-mono">{left}</div>
    <div className="flex-1 text-ink leading-relaxed">{right}</div>
  </div>
);

// ── Section bodies ──────────────────────────────────────────────────────────

const sections: Section[] = [
  {
    id: 'what',
    label: 'What is Copter Studios?',
    icon: BookOpen,
    body: () => (
      <div>
        <P>
          Copter Studios is a browser-based <span className="text-ink font-semibold">drone flight simulator</span>.
          It runs a real physics engine (Blade-Element-Theory thrust, RK4 quaternion integration,
          ISA atmosphere) so the bi-, quad-, and hexacopters you build behave like real aircraft.
        </P>
        <P>
          You don't need to install anything. Configure a drone with the sliders, press
          <Code>Start Simulation</Code>, and a 3D viewport shows it fly. Add wind, payload shift,
          battery sag, or motor-outs to stress-test it. Use plain-English commands in the Aether AI
          panel to run scenarios without touching the sliders.
        </P>
        <H>Who is it for?</H>
        <ul className="text-ink text-[12px] space-y-1.5 list-disc list-inside leading-relaxed">
          <li><span className="text-ink font-semibold">Hobbyists</span> — learn how multirotors fly and what changing mass / prop / battery does.</li>
          <li><span className="text-ink font-semibold">Students &amp; researchers</span> — train RL controllers in Google Colab and benchmark them here.</li>
          <li><span className="text-ink font-semibold">Engineers</span> — prototype configurations and tuning before cutting carbon.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'first-flight',
    label: 'Your first flight (3 minutes)',
    icon: Rocket,
    body: () => (
      <div>
        <Step n={1} title="Pick a preset (left panel)">
          In the <span className="text-ink">Drone Configurator</span> on the left, click a
          quick-preset button — start with <Code>Research Bi</Code> (5 kg bicopter) or
          <Code>Cargo Quad</Code> (8 kg quadcopter). The sliders update to a known-good config.
        </Step>
        <Step n={2} title="Press the green Start Simulation button">
          The 3D viewport in the centre shows a launch overlay. Click it, confirm the prompt, and
          the drone will hover at 1 m. Watch the bottom-left telemetry: <Code>ALT</Code>,
          <Code>ROLL</Code>, <Code>PITCH</Code>, <Code>BAT</Code> all update at 60 fps.
        </Step>
        <Step n={3} title="Try a stress test">
          In the configurator, toggle <Code>Wind &amp; Turbulence</Code>. The drone will sway and
          the controller will fight back. Toggle <Code>Failure Mode</Code> to kill a motor — a
          quad will struggle, a hex will keep flying.
        </Step>
        <Note>
          To stop, click the small red <Code>Stop</Code> button in the top-right of the viewport.
          The next Start gives you a fresh launch.
        </Note>
      </div>
    ),
  },
  {
    id: 'tabs',
    label: 'The six tabs',
    icon: Wind,
    body: () => (
      <div>
        <P>The tab bar at the top of the app switches between six workspaces.</P>
        <Row left={<><Wind className="inline w-3 h-3 mr-1" />Simulation</>} right={
          <>The main 3D viewport. Configure on the left, fly in the middle, talk to Aether on the right.</>
        } />
        <Row left={<><BarChart2 className="inline w-3 h-3 mr-1" />Benchmark</>} right={
          <>Run dozens of episodes back-to-back to measure crash rate, mean SEC (specific energy consumption), and stability. Optional domain-randomization shakes mass / wind / sensor-noise per episode.</>
        } />
        <Row left={<><Eye className="inline w-3 h-3 mr-1" />Policy X-Ray</>} right={
          <>For loaded RL models. Shows which sensors the policy is paying attention to (Jacobian sensitivity) and visualises action distributions.</>
        } />
        <Row left={<><Settings className="inline w-3 h-3 mr-1" />Digital Twin</>} right={
          <>Calibrate the simulator against a CSV of real flight data. Useful when you want sim behaviour to match a specific physical drone.</>
        } />
        <Row left={<><Terminal className="inline w-3 h-3 mr-1" />Gym Bridge</>} right={
          <>Documentation for the WebSocket gym server. Used by Python (Stable-Baselines3 etc.) to train RL policies against this physics engine.</>
        } />
        <Row left={<><Trophy className="inline w-3 h-3 mr-1" />Leaderboard</>} right={
          <>Your best flights ranked by SEC. Share configs as URLs.</>
        } />
        <Note>
          Beginners only need the first tab. Come back for the others once you're comfortable.
        </Note>
      </div>
    ),
  },
  {
    id: 'config',
    label: 'Drone configurator',
    icon: Sliders,
    body: () => (
      <div>
        <P>The configurator sits on the left of the Simulation tab. It controls the physics.</P>
        <H>Drone Type</H>
        <ul className="text-ink text-[12px] space-y-1.5 list-disc list-inside leading-relaxed">
          <li><span className="text-ink">Bicopter</span> — 2 motors with tilting nacelles. Hard to balance, fun to watch.</li>
          <li><span className="text-ink">Quadcopter</span> — 4 motors, X-configuration. The standard. What DJI sells.</li>
          <li><span className="text-ink">Hexacopter</span> — 6 motors. Survives a single motor failure.</li>
        </ul>
        <H>Quick Presets</H>
        <Row left="Nano (Crazyflie)" right="27 g, 1.5″ props, 3.7 V — try the smallest drone in the world." />
        <Row left="Micro Racer"    right="2.5 kg, 8″ props — fast quadcopter." />
        <Row left="Research Bi"    right="5 kg, 15″ — well-mannered bicopter for first flights." />
        <Row left="Cargo Quad"     right="8 kg, 18″ — heavy-lift quad." />
        <Row left="Heavy Hex"      right="15 kg, 22″ — six-rotor cargo platform." />
        <H>Sliders</H>
        <Row left="Mass"      right="Total weight in kg. Heavier needs more thrust to hover. Range 0.02–20 kg." />
        <Row left="Prop Ø"    right="Propeller diameter in inches. Bigger = more thrust per RPM, but slower spin-up." />
        <Row left="Battery V" right="Pack voltage. 3.7 V (1S nano) → 44.4 V (12S heavy). Higher V → more peak thrust." />
        <Row left="Arm length" right="Motor-to-centre distance. Bigger = more roll/pitch authority but more inertia." />
        <Note>
          The defaults next to each slider show typical ranges. Stay inside them for realistic
          behaviour; venture outside to see what breaks.
        </Note>
      </div>
    ),
  },
  {
    id: 'tests',
    label: 'Test modules (stress tests)',
    icon: AlertTriangle,
    body: () => (
      <div>
        <P>Toggle these in the configurator to see how your drone copes with disturbances.</P>
        <Row left="Wind & Turbulence" right="Stochastic gusts (0–40 mph) using a Dryden turbulence model in high-fidelity mode. Drone sways, controller fights back." />
        <Row left="Payload Dynamics"  right="Centre-of-gravity shifts ±10 % during flight. Simulates a swinging cargo." />
        <Row left="Battery Endurance" right="Voltage drops as the pack drains. Thrust authority decreases over time." />
        <Row left="Failure Mode"      right="Kills one motor. Quads fight to recover (often crash). Hexes stay airborne." />
        <Row left="Sensor Noise"      right="Adds Gaussian noise to IMU and GPS readings. Tests the controller against imperfect data." />
        <H>Mission Presets</H>
        <Row left="None"           right="Hover at 1 m." />
        <Row left="Long-Range"     right="Commanded to fly 10 km forward with steady headwind." />
        <Row left="High-Speed"     right="Commanded to fly 1 km forward as fast as possible." />
        <Row left="Precision-Drop" right="Hover with a swinging payload simulating a delivery release." />
      </div>
    ),
  },
  {
    id: 'aether',
    label: 'Aether AI panel',
    icon: Bot,
    body: () => (
      <div>
        <P>
          Aether is an AI sim-operator on the right of the Simulation tab. Type plain English and
          it configures the simulator for you. It always shows what it interpreted in an
          <Code>Approval Required</Code> dialog before touching anything.
        </P>
        <H>Things you can ask</H>
        <ul className="text-ink text-[12px] space-y-1.5 list-disc list-inside leading-relaxed">
          <li><em>"Hover at 2 meters with a 7 kg bicopter."</em></li>
          <li><em>"Run a 50-episode benchmark on a quad with wind enabled."</em></li>
          <li><em>"Fly forward at 5 m/s for 10 seconds."</em></li>
          <li><em>"Train an RL policy for a 9 kg cargo quad."</em></li>
          <li><em>"Audit current SEC and SPT and suggest improvements."</em></li>
        </ul>
        <H>Toolbar buttons</H>
        <Row left="Export SB3"    right="Generates a Python Stable-Baselines3 starter script for your config." />
        <Row left="Colab Notebook" right="Downloads a Jupyter notebook pre-wired for Google Colab GPU training." />
        <Row left="Copy Notebook"  right="Copies the same notebook JSON to your clipboard — paste it directly into Colab." />
        <Row left="Forensics"     right="Opens a crash post-mortem with full state trace (only after a crash)." />
        <Row left="Audit"         right="Asks Aether to grade your current run on energy and stability." />
        <Row left="Reward Fn"     right="Asks Aether to write an RL reward function for your goal." />
        <Note>
          If the cloud AI is offline, Aether falls back to a local parser that still understands
          basic commands like "hover", "fly forward", "run wind test". You'll never be locked out.
        </Note>
      </div>
    ),
  },
  {
    id: 'rl',
    label: 'Training your own RL policy',
    icon: Rocket,
    body: () => (
      <div>
        <P>
          Out of the box, the simulator flies with a tuned heuristic PD/PID controller. To train a
          neural network policy that flies your specific drone, follow this loop:
        </P>
        <Step n={1} title="Generate a Colab notebook">
          In the Aether toolbar, click <Code>Colab Notebook</Code> (downloads) or
          <Code>Copy Notebook</Code> (clipboard). It includes your exact mass / prop / voltage
          baked into the training config.
        </Step>
        <Step n={2} title="Run it in Google Colab">
          Open <Code>colab.research.google.com</Code> → <Code>File → Upload Notebook</Code> →
          select the <Code>.ipynb</Code>. Run all cells. Training takes ~15 min on the free GPU
          tier and trains a Stable-Baselines3 PPO policy for 50 000 steps.
        </Step>
        <Step n={3} title="Download cargo_policy.zip">
          The notebook auto-downloads a zip when training completes. It contains
          <Code>model.json</Code> and <Code>weights.bin</Code>.
        </Step>
        <Step n={4} title="Load it in the simulator">
          Drag the two files into the <Code>Load RL Model</Code> dropzone in the bottom-left of
          the Simulation tab. The status changes from "Heuristic PD" to "Loaded RL Agent".
        </Step>
        <Step n={5} title="Benchmark it">
          Switch to the Benchmark tab and run 50–100 episodes. Compare crash rate, mean SEC, and
          stability against the heuristic baseline.
        </Step>
      </div>
    ),
  },
  {
    id: 'glossary',
    label: 'Glossary',
    icon: BookOpen,
    body: () => (
      <div>
        <Row left="BET"      right="Blade Element Theory — a physics model that computes propeller thrust from blade geometry, pitch, and rotor speed." />
        <Row left="RK4"      right="Runge-Kutta 4 — a numerical method for integrating differential equations accurately. Used to step the rigid-body state forward in time." />
        <Row left="ISA"      right="International Standard Atmosphere — gives air density at any altitude. Affects thrust at altitude." />
        <Row left="Dryden"   right="A spectral turbulence model from MIL-HDBK-1797B used to simulate realistic wind gusts." />
        <Row left="SEC"      right="Specific Energy Consumption — Joules per gram of payload per kilometre. Lower is better. The leaderboard ranks by SEC." />
        <Row left="SPT"      right="Servo-Per-Tilt — measure of how much the controller is twitching to hold attitude. Lower = smoother flight." />
        <Row left="PD / PID" right="Proportional-Derivative / -Integral-Derivative — feedback control algorithms. PID adds an integral term to eliminate steady-state error." />
        <Row left="T/W"      right="Thrust-to-Weight ratio. T/W = 1 means it can just hover. T/W > 2 is normal for stable control." />
        <Row left="FoM"      right="Figure of Merit — efficiency factor for hovering rotors. Real multirotors are ~0.55 (vs an ideal disk of 1.0)." />
        <Row left="Domain randomization" right="During benchmark, mass, wind, and sensor-noise are jittered per episode to test robustness." />
      </div>
    ),
  },
  {
    id: 'troubleshoot',
    label: 'Troubleshooting',
    icon: AlertTriangle,
    body: () => (
      <div>
        <Row left="Drone won't lift off" right="Mass is too heavy for the props/voltage. Pick a quick preset or lower mass / increase prop diameter." />
        <Row left="Drone crashes immediately" right="Initial conditions or aggressive disturbance overwhelmed the controller. Disable Failure Mode and Wind, then re-enable one at a time." />
        <Row left="Hover drifts in altitude" right="Controller is fighting external disturbance. Toggle off Wind / Payload Shift to verify hover is stable in calm." />
        <Row left="Aether says 'cloud AI unavailable'" right="The Gemini integration isn't configured in this build. Local commands like 'hover at 2 m' still work." />
        <Row left="3D viewport is blank" right="Browser is missing WebGL. Try a different browser (Chrome, Edge, or Firefox)." />
        <Row left="Want to start the tour again" right={
          <>Click the <Code>Replay tour</Code> button below — it'll re-trigger the guided walkthrough.</>
        } />
      </div>
    ),
  },
];

// ── Main component ──────────────────────────────────────────────────────────

export const UserGuide = ({ onClose }: UserGuideProps) => {
  const [active, setActive] = useState<string>(sections[0].id);
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close on backdrop click
  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) onClose();
  };

  // Filter sections by query (matches label OR section body keywords)
  const q = query.trim().toLowerCase();
  const visible = q
    ? sections.filter(s => s.id.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
    : sections;

  const current = sections.find(s => s.id === active) ?? sections[0];

  const replayTour = () => {
    localStorage.removeItem(STORAGE_KEY_TOUR);
    onClose();
    // Force reload so OnboardingTour useEffect re-fires
    setTimeout(() => window.location.reload(), 100);
  };

  return (
    <div
      ref={dialogRef}
      onClick={onBackdropClick}
      className="fixed inset-0 z-[200] bg-scrim/45 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-5xl h-[85vh] bg-surface border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-700" />
            <div className="font-bold text-ink text-sm">Beginner's Guide</div>
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Copter Studios</div>
          </div>
          <button onClick={onClose}
            className="p-1.5 hover:bg-canvas rounded-lg text-muted hover:text-ink transition-colors"
            title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — sidebar + content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-60 shrink-0 border-r border-line bg-surface/60 flex flex-col">
            <div className="p-2 border-b border-line">
              <div className="relative">
                <Search className="w-3 h-3 text-muted absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search guide…"
                  className="w-full pl-7 pr-2 py-1.5 bg-surface border border-line rounded-md text-[11px] text-ink placeholder:text-muted focus:outline-none focus:border-emerald-500/40"
                />
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {visible.length === 0 && (
                <div className="px-2 py-3 text-[11px] text-muted italic">No sections match "{query}"</div>
              )}
              {visible.map(s => {
                const Icon = s.icon;
                const isActive = s.id === active;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[12px] transition-colors ${
                      isActive
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-700'
                        : 'border border-transparent text-muted hover:bg-surface hover:text-ink'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-700' : 'text-muted'}`} />
                    <span className="flex-1 truncate">{s.label}</span>
                    {isActive && <ChevronRight className="w-3 h-3 text-emerald-700" />}
                  </button>
                );
              })}
            </nav>
            <div className="p-2 border-t border-line shrink-0">
              <button
                onClick={replayTour}
                title="Re-trigger the first-visit guided walkthrough"
                className="w-full px-2 py-1.5 bg-surface hover:bg-canvas border border-line hover:border-emerald-500/40 rounded-md text-[10px] text-muted hover:text-emerald-700 transition-colors"
              >
                Replay onboarding tour
              </button>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <article className="px-7 py-6 max-w-3xl">
              <div className="flex items-center gap-2 mb-4">
                <current.icon className="w-5 h-5 text-emerald-700" />
                <h2 className="text-lg font-bold text-ink">{current.label}</h2>
              </div>
              {current.body()}
            </article>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-line shrink-0 flex items-center justify-between text-[10px] text-muted">
          <span>Press <Code>Esc</Code> to close · Click outside the panel to dismiss</span>
          <span className="font-mono">Copter Studios · Beginner's Guide</span>
        </div>
      </div>
    </div>
  );
};

