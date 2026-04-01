// CrashForensics.tsx
// Modal component: post-crash telemetry forensics panel.
// Classifies failure mode, shows final state, and plots attitude divergence.

import React, { useMemo } from 'react';
import { X, AlertTriangle, Activity, Zap, RotateCcw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { TelemetryHistory } from './MissionLogic';

interface CrashForensicsProps {
  crashData: { reason: string; telemetry: any } | null;
  fullHistory: TelemetryHistory[];
  onClose: () => void;
}

type FailureMode =
  | 'Battery Exhaustion'
  | 'Roll Divergence'
  | 'Pitch Divergence'
  | 'Motor-Out Cascade'
  | 'Collective Stall'
  | 'Total Attitude Failure';

function classifyFailure(
  crashData: { reason: string; telemetry: any } | null,
  history: TelemetryHistory[]
): FailureMode {
  if (!crashData) return 'Total Attitude Failure';
  const t = crashData.telemetry;
  if (t?.battery < 0.05) return 'Battery Exhaustion';
  const rollDeg  = Math.abs((t?.phi  ?? 0) * 180 / Math.PI);
  const pitchDeg = Math.abs((t?.theta ?? 0) * 180 / Math.PI);
  if (rollDeg > 35 && rollDeg > pitchDeg) return 'Roll Divergence';
  if (pitchDeg > 35) return 'Pitch Divergence';
  // Check if omega dropped to zero — motor-out
  const omegas: number[] = t?.motorOmegas ?? [];
  if (omegas.length > 0 && omegas.some((o: number) => o < 5)) return 'Motor-Out Cascade';
  if (t?.z_dot < -2.0) return 'Collective Stall';
  return 'Total Attitude Failure';
}

const FAILURE_COLOR: Record<FailureMode, string> = {
  'Battery Exhaustion':  '#f59e0b',
  'Roll Divergence':     '#ef4444',
  'Pitch Divergence':    '#f97316',
  'Motor-Out Cascade':   '#a855f7',
  'Collective Stall':    '#06b6d4',
  'Total Attitude Failure': '#ec4899',
};

const FAILURE_ADVICE: Record<FailureMode, string> = {
  'Battery Exhaustion':
    'Increase battery capacity or reduce mission range. Enable battery sag in training.',
  'Roll Divergence':
    'Lateral cyclic authority insufficient. Increase roll PD gains or check arm length parameter.',
  'Pitch Divergence':
    'Longitudinal cyclic stall. Check pitch PD gains and payload-shift interaction.',
  'Motor-Out Cascade':
    'Single motor failure caused unrecoverable yaw divergence. Policy needs motor-fault robustness training.',
  'Collective Stall':
    'Thrust margin too low for mass. Reduce payload, increase prop diameter, or raise battery voltage.',
  'Total Attitude Failure':
    'Combined instability. Review all PD tuning parameters and enable domain randomisation.',
};

export const CrashForensics: React.FC<CrashForensicsProps> = ({
  crashData, fullHistory, onClose,
}) => {
  const failure = useMemo(
    () => classifyFailure(crashData, fullHistory),
    [crashData, fullHistory]
  );
  const color = FAILURE_COLOR[failure];

  // Downsample history for chart (max 200 points)
  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(fullHistory.length / 200));
    return fullHistory
      .filter((_, i) => i % step === 0)
      .map(h => ({
        t:     parseFloat(h.time.toFixed(2)),
        roll:  parseFloat((h.phi   * 180 / Math.PI).toFixed(1)),
        pitch: parseFloat((h.theta * 180 / Math.PI).toFixed(1)),
        alt:   parseFloat(h.z.toFixed(3)),
      }));
  }, [fullHistory]);

  const t = crashData?.telemetry;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-900/20 border border-red-900/30">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight uppercase">Crash Forensics</h2>
              <p className="text-[10px] text-zinc-500 font-mono">{crashData?.reason?.toUpperCase() ?? 'FAULT'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-500 hover:text-white" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            <div className="space-y-6">
              {/* Failure classification */}
              <div className="bg-zinc-950 border-l-4 p-5 flex items-start gap-4 rounded-r-xl"
                style={{ borderLeftColor: color }}>
                <div className="shrink-0 p-2 rounded-lg bg-zinc-900 order border-zinc-800">
                  <RotateCcw className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color }}>{failure}</div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">{FAILURE_ADVICE[failure]}</div>
                </div>
              </div>

              {/* Attitude / altitude chart */}
              {chartData.length > 2 && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
                  <h3 className="text-[10px] font-bold text-zinc-600 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5" /> High-G Telemetry Replay
                  </h3>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.3} />
                        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#71717a' }} stroke="transparent" />
                        <YAxis tick={{ fontSize: 9, fill: '#71717a' }} stroke="transparent" />
                        <Tooltip
                          contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: 11 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: '10px' }} />
                        <Line type="monotone" dataKey="roll"  stroke="#ef4444" dot={false} strokeWidth={2} name="Roll (°)" />
                        <Line type="monotone" dataKey="pitch" stroke="#f97316" dot={false} strokeWidth={2} name="Pitch (°)" />
                        <Line type="monotone" dataKey="alt"   stroke="#237227" dot={false} strokeWidth={2} name="Alt (m)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Stats */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-1">Impact Telemetry</h3>
               <div className="grid grid-cols-1 gap-2">
                {[
                  ['Altitude',  t?.z?.toFixed(3) + ' m',                  <Activity className="w-3.5 h-3.5" />],
                  ['Roll',      (t?.phi  * 180 / Math.PI).toFixed(1) + '°', null],
                  ['Pitch',     (t?.theta * 180 / Math.PI).toFixed(1) + '°', null],
                  ['Battery',   (t?.battery * 100).toFixed(1) + '%',       <Zap className="w-3.5 h-3.5" />],
                  ['Z velocity', t?.z_dot?.toFixed(2) + ' m/s',            null],
                  ['Flight time', t?.time?.toFixed(2) + ' s',              null],
                ].map(([label, value, icon]) => (
                  <div key={label as string}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col gap-0.5">
                    <div className="text-[9px] text-zinc-600 uppercase font-bold flex items-center gap-2">
                      {icon as React.ReactNode}{label as string}
                    </div>
                    <div className="text-sm font-mono text-zinc-200 font-bold">{value as string}</div>
                  </div>
                ))}
              </div>
              <button 
                onClick={onClose}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all border border-zinc-700"
              >
                Dismiss Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
