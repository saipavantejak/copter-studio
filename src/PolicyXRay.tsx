// PolicyXRay.tsx
// v9 fix: stateRef pattern — interval only re-creates when agentRef changes,
//         not on every 100ms telemetry tick. Eliminates ~10 teardown/recreate cycles/sec.

import React, { useEffect, useRef, useState } from 'react';
import { DroneState } from './PhysicsEngine';
import { RLAgent } from './RLAgent';
import { Eye, Cpu } from 'lucide-react';

interface PolicyXRayProps {
  agentRef: React.MutableRefObject<RLAgent>;
  state: DroneState | null;
  isUsingModel: boolean;
}

interface Importance {
  name: string;
  value: number;
  category: string;
}

const OBS_NAMES = [
  { name: 'x pos',     category: 'Position', color: '#60a5fa' },
  { name: 'y pos',     category: 'Position', color: '#60a5fa' },
  { name: 'z alt',     category: 'Position', color: '#34a840' },
  { name: 'ẋ vel',     category: 'Velocity', color: '#a78bfa' },
  { name: 'ẏ vel',     category: 'Velocity', color: '#a78bfa' },
  { name: 'ż vel',     category: 'Velocity', color: '#a78bfa' },
  { name: 'roll φ',    category: 'Attitude', color: '#fb923c' },
  { name: 'pitch θ',   category: 'Attitude', color: '#fb923c' },
  { name: 'yaw ψ',     category: 'Attitude', color: '#fb923c' },
  { name: 'roll rate', category: 'Angular',  color: '#f472b6' },
  { name: 'pitch rate',category: 'Angular',  color: '#f472b6' },
  { name: 'yaw rate',  category: 'Angular',  color: '#f472b6' },
];

// Per-dimension epsilon scales — each ε is ~1% of the typical range.
const OBS_SCALES = [
  0.05, 0.05, 0.03,
  0.05, 0.05, 0.05,
  0.03, 0.03, 0.06,
  0.05, 0.05, 0.05,
];

function stateToArray(s: DroneState): number[] {
  return [s.x, s.y, s.z, s.x_dot, s.y_dot, s.z_dot, s.phi, s.theta, s.psi, s.p, s.q, s.r];
}

function computeJacobianImportance(agent: RLAgent, state: DroneState, droneType: any): number[] {
  const base       = stateToArray(state);
  const baseAction = agent.predictAction(base, droneType, 'none');
  const importance = new Array(12).fill(0);

  for (let i = 0; i < 12; i++) {
    const eps      = OBS_SCALES[i];
    const perturbed = [...base];
    perturbed[i]   += eps;
    const perturbedAction = agent.predictAction(perturbed, droneType, 'none');
    const delta = perturbedAction.reduce((s, a, j) => s + (a - baseAction[j]) ** 2, 0);
    importance[i]  = Math.sqrt(delta) / eps;
  }

  const max = Math.max(...importance, 1e-10);
  return importance.map(v => v / max);
}

export const PolicyXRay: React.FC<PolicyXRayProps> = ({ agentRef, state, isUsingModel }) => {
  const [importances, setImportances] = useState<number[]>(new Array(12).fill(0));
  const [topFeature,  setTopFeature]  = useState('—');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fix 7: stateRef — interval reads from ref, so it doesn't need `state` in its dependency array.
  // This prevents the interval from being torn down and re-created on every telemetry update (100ms).
  // The interval re-creates only when agentRef changes (effectively never after mount).
  const stateRef = useRef<DroneState | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const s = stateRef.current;
      if (!s || !agentRef.current) return;
      try {
        const imp    = computeJacobianImportance(agentRef.current, s, s.droneType);
        const topIdx = imp.indexOf(Math.max(...imp));
        setImportances(imp);
        setTopFeature(OBS_NAMES[topIdx]?.name ?? '—');
      } catch { /* agent not yet initialised */ }
    }, 500); // 2 Hz

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [agentRef]); // ← only agentRef, not state

  const grouped = ['Position', 'Velocity', 'Attitude', 'Angular'];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Policy X-Ray</span>
        </div>
        <div className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
          isUsingModel ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {isUsingModel ? 'RL Model' : 'Heuristic PD'}
        </div>
      </div>

      {!isUsingModel && (
        <div className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-1">
          <div className="font-bold text-zinc-400">No RL model loaded — showing heuristic PD sensitivity</div>
          <div className="text-zinc-600">To see meaningful data: (1) Go to the <span className="text-emerald-400">Simulation</span> tab and click <span className="text-emerald-400">Start Simulation</span>, then return here to watch bars move live. (2) For RL policy analysis, load a model via the <span className="text-emerald-400">Model Loader</span> panel.</div>
          <div className="text-zinc-600">Bars at 0% means the sim hasn't started yet — the controller has no state to react to.</div>
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(cat => {
          const indices = OBS_NAMES
            .map((o, i) => ({ ...o, i, imp: importances[i] }))
            .filter(o => o.category === cat);

          return (
            <div key={cat}>
              <div className="text-[10px] text-zinc-600 uppercase font-bold mb-1.5">{cat}</div>
              <div className="space-y-1">
                {indices.map(({ name, color, i, imp }) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                    <div className="w-16 text-zinc-500 text-right shrink-0">{name}</div>
                    <div className="flex-1 h-3 bg-zinc-800 rounded-sm relative overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-sm transition-all duration-300"
                        style={{ width: `${imp * 100}%`, background: color }}
                      />
                    </div>
                    <div className="w-10 text-right shrink-0" style={{ color }}>
                      {(imp * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-zinc-800 pt-2 flex items-center justify-between text-[10px]">
        <div className="text-zinc-500">
          Top driver: <span className="text-purple-300 font-bold">{topFeature}</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-600">
          <Cpu className="w-2.5 h-2.5" /> 2Hz Jacobian
        </div>
      </div>

      {isUsingModel && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
          <div className="font-bold text-zinc-300 mb-1">How to read this</div>
          Bar width = how much this observation drives control output.
          Wide bar = policy is sensitive to this measurement.
          Very wide on noise-heavy sensors (gyro) = policy may overfit to sensor artifacts.
        </div>
      )}
    </div>
  );
};
