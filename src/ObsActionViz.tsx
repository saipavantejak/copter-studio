// ObsActionViz.tsx
// Tier 2: Live observation space (12-DOF state) and action space (servo commands) visualiser

import React from 'react';
import { DroneState } from './PhysicsEngine';

interface ObsActionVizProps {
  state: DroneState | null;
  action: number[];
  noisy?: DroneState | null; // noisy observation actually fed to policy
}

function Bar({ value, min = -1, max = 1, color, label, unit, noisy }: {
  value: number; min?: number; max?: number;
  color: string; label: string; unit: string; noisy?: number;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const noisyPct = noisy !== undefined
    ? Math.max(0, Math.min(100, ((noisy - min) / (max - min)) * 100))
    : undefined;

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <div className="w-14 text-muted shrink-0 text-right">{label}</div>
      <div className="flex-1 h-3 bg-canvas rounded-sm relative overflow-hidden">
        {/* Noisy observation (what policy sees) */}
        {noisyPct !== undefined && (
          <div
            className="absolute top-0 h-full rounded-sm opacity-30"
            style={{ width: `${noisyPct}%`, background: '#B91C1C' }}
          />
        )}
        {/* True value */}
        <div
          className="absolute top-0 h-full rounded-sm"
          style={{ width: `${pct}%`, background: color }}
        />
        {/* Centre line */}
        <div className="absolute top-0 bottom-0 w-px bg-selected" style={{ left: `${((0-min)/(max-min))*100}%` }} />
      </div>
      <div className="w-16 text-right" style={{ color }}>
        {value.toFixed(3)}<span className="text-muted text-[9px]"> {unit}</span>
      </div>
    </div>
  );
}

export const ObsActionViz: React.FC<ObsActionVizProps> = ({ state, action, noisy }) => {
  if (!state) return null;

  const r2d = (r: number) => r * 180 / Math.PI;

  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-4 text-xs">
      <div className="font-bold text-muted uppercase tracking-wider text-[10px]">
        Obs / Action Space
      </div>

      {/* Observation — position */}
      <div>
        <div className="text-[10px] text-muted uppercase mb-1.5">Position</div>
        <div className="space-y-1">
          <Bar label="x" value={state.x} min={-5} max={5} color="#2563EB" unit="m" noisy={noisy?.x} />
          <Bar label="y" value={state.y} min={-5} max={5} color="#2563EB" unit="m" noisy={noisy?.y} />
          <Bar label="z" value={state.z} min={0} max={3}  color="#556B2F" unit="m" noisy={noisy?.z} />
        </div>
      </div>

      {/* Observation — velocity */}
      <div>
        <div className="text-[10px] text-muted uppercase mb-1.5">Velocity</div>
        <div className="space-y-1">
          <Bar label="ẋ" value={state.x_dot} min={-5} max={5} color="#a78bfa" unit="m/s" noisy={noisy?.x_dot} />
          <Bar label="ẏ" value={state.y_dot} min={-5} max={5} color="#a78bfa" unit="m/s" noisy={noisy?.y_dot} />
          <Bar label="ż" value={state.z_dot} min={-5} max={5} color="#a78bfa" unit="m/s" noisy={noisy?.z_dot} />
        </div>
      </div>

      {/* Observation — attitude */}
      <div>
        <div className="text-[10px] text-muted uppercase mb-1.5">Attitude</div>
        <div className="space-y-1">
          <Bar label="φ" value={r2d(state.phi)}   min={-90} max={90} color="#C2410C" unit="°" noisy={noisy ? r2d(noisy.phi)   : undefined} />
          <Bar label="θ" value={r2d(state.theta)} min={-90} max={90} color="#C2410C" unit="°" noisy={noisy ? r2d(noisy.theta) : undefined} />
          <Bar label="ψ" value={r2d(state.psi)}   min={-180} max={180} color="#C2410C" unit="°" noisy={noisy ? r2d(noisy.psi) : undefined} />
        </div>
      </div>

      {/* Observation — angular rates */}
      <div>
        <div className="text-[10px] text-muted uppercase mb-1.5">Angular rates</div>
        <div className="space-y-1">
          <Bar label="p" value={state.p} min={-5} max={5} color="#f472b6" unit="r/s" noisy={noisy?.p} />
          <Bar label="q" value={state.q} min={-5} max={5} color="#f472b6" unit="r/s" noisy={noisy?.q} />
          <Bar label="r" value={state.r} min={-5} max={5} color="#f472b6" unit="r/s" noisy={noisy?.r} />
        </div>
      </div>

      {/* Action space */}
      <div>
        <div className="text-[10px] text-muted uppercase mb-1.5">
          Action (servos)
          {noisy && <span className="text-red-700 ml-1">· red = noisy obs</span>}
        </div>
        <div className="space-y-1">
          {['col_L','lat_L','lon_L','col_R','lat_R','lon_R'].map((lbl,i) => (
            <Bar key={lbl} label={lbl} value={action[i]??0} min={-1} max={1} color="#2dd4bf" unit="" />
          ))}
        </div>
      </div>

      {/* Motor RPMs */}
      {state.motorOmegas && state.motorOmegas.length > 0 && (
        <div>
          <div className="text-[10px] text-muted uppercase mb-1.5">Motor ω (rad/s)</div>
          <div className="space-y-1">
            {state.motorOmegas.slice(0, state.droneType==='bicopter' ? 2 : state.droneType==='quadcopter' ? 4 : 6).map((omega,i) => (
              <Bar key={i} label={`M${i+1}`} value={omega} min={0} max={1200} color="#A16207" unit="r/s" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

