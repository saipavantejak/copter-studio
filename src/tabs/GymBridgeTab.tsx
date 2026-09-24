// GymBridgeTab.tsx — Extracted from App.tsx (lines 634-700)

import { useAppContext } from '../context/AppContext';
import { exportSB3Script } from '../TelemetryExport';
import { Terminal, Download } from 'lucide-react';

export function GymBridgeTab() {
  const { config } = useAppContext();

  return (
    <main className="max-w-[900px] mx-auto p-5 space-y-5">
      <div>
        <h2 className="text-xl font-bold">Gym Bridge</h2>
        <p className="text-sm text-muted mt-0.5">WebSocket server that exposes the simulator as an OpenAI Gymnasium environment. Train RL policies from Python and drive this simulator in real time.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-ink">Setup (30 seconds)</h3>
          </div>
          <div className="space-y-3 text-xs font-mono">
            {[
              ['1. Start the bridge server:', 'npm run gym-bridge'],
              ['2. Install Python client:', 'pip install websocket-client gymnasium numpy'],
              ['3. Copy gym_client.py:', 'server/gym_client.py → your project'],
            ].map(([label, cmd]) => (
              <div key={label as string}>
                <div className="text-muted mb-1">{label as string}</div>
                <div className="bg-surface border border-line rounded p-2 text-emerald-700">{cmd as string}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-xl p-5">
          <h3 className="text-sm font-bold text-ink mb-3">Python usage</h3>
          <pre className="text-xs bg-surface border border-line rounded p-3 text-emerald-700 overflow-x-auto leading-relaxed">{`from gym_client import DroneSimEnv
from stable_baselines3 import PPO

env = DroneSimEnv(host="localhost", port=8765)
obs, _ = env.reset(seed=42)

model = PPO("MlpPolicy", env, verbose=1)
model.learn(total_timesteps=500_000)
model.save("my_drone_policy")

obs, _ = env.reset()
for _ in range(1000):
    action, _ = model.predict(obs)
    obs, reward, done, _, info = env.step(action)
    if done:
        obs, _ = env.reset()`}</pre>
        </div>
      </div>
      <div className="bg-surface border border-line rounded-xl p-5">
        <h3 className="text-sm font-bold text-ink mb-3">Protocol specification</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            ['reset', '{"type":"reset","seed":42}', '{"type":"obs","obs":[12 floats]}'],
            ['step',  '{"type":"step","action":[6 floats]}', '{"type":"step_result","obs":[...],"reward":float,"done":bool,"info":{...}}'],
            ['ping',  '{"type":"ping"}', '{"type":"pong"}'],
          ].map(([cmd, req, resp]) => (
            <div key={cmd as string} className="bg-surface border border-line rounded-lg p-3 space-y-2">
              <div className="text-emerald-700 font-bold">{cmd as string}</div>
              <div><div className="text-muted text-[9px] mb-0.5">Request</div><div className="text-muted font-mono break-all">{req as string}</div></div>
              <div><div className="text-muted text-[9px] mb-0.5">Response</div><div className="text-muted font-mono break-all">{resp as string}</div></div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => exportSB3Script(config)}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
        <Download className="w-4 h-4" /> Download Complete SB3 Training Script
      </button>
    </main>
  );
}

