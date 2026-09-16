// RobustnessPanel.tsx
// Tier upgrade: Reality Stress Test — shows robustness stats across
// domain-randomized episodes. Identifies worst-case failure modes.

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine
} from 'recharts';
import { Shield, AlertTriangle, Wind, Cpu } from 'lucide-react';
import { BatchStats, EpisodeResult } from './EpisodeRunner';

interface RobustnessPanelProps {
  stats: BatchStats | null;
  isDomainRandEnabled: boolean;
}

function classifyFailureMode(r: EpisodeResult): string {
  if (r.outcome) return r.outcome;
  if (!r.crashed) return 'Unverified survival';
  if (r.maxRoll > 0.8 && r.maxPitch < 0.4) return 'Roll Divergence';
  if (r.maxPitch > 0.8 && r.maxRoll < 0.4) return 'Pitch Divergence';
  if (r.maxRoll > 0.5 && r.maxPitch > 0.5) return 'Total Attitude Failure';
  if (r.survivalTime < 1.0) return 'Early Crash (<1s)';
  return 'Late Crash';
}

const FAILURE_COLORS: Record<string,string> = {
  'Success': '#34a840',
  'Roll Divergence': '#f87171',
  'Pitch Divergence': '#fb923c',
  'Total Attitude Failure': '#dc2626',
  'Early Crash (<1s)': '#f43f5e',
  'Late Crash': '#fbbf24',
};

export const RobustnessPanel: React.FC<RobustnessPanelProps> = ({ stats, isDomainRandEnabled }) => {
  const failureCounts = useMemo(() => {
    if (!stats) return [];
    const counts: Record<string,number> = {};
    for (const r of stats.episodes) {
      const mode = classifyFailureMode(r);
      counts[mode] = (counts[mode]||0) + 1;
    }
    return Object.entries(counts).map(([mode,count])=>({
      mode, count,
      pct: (count/stats.numEpisodes*100).toFixed(1),
      color: FAILURE_COLORS[mode]||'#71717a'
    }));
  }, [stats]);

  const altErrorHist = useMemo(() => {
    if (!stats) return [];
    const bins = new Array(10).fill(0);
    const max = 1.0;
    for (const r of stats.episodes) {
      const bin = Math.min(9, Math.floor(r.meanAltError / max * 10));
      bins[bin]++;
    }
    return bins.map((count,i)=>({ range:`${(i*max/10).toFixed(2)}-${((i+1)*max/10).toFixed(2)}m`, count }));
  }, [stats]);

  const survivalHist = useMemo(() => {
    if (!stats) return [];
    const maxT = stats.durationSeconds ?? 16;
    const bins = new Array(8).fill(0);
    for (const r of stats.episodes) {
      const bin = Math.min(7, Math.floor(r.survivalTime/maxT*8));
      bins[bin]++;
    }
    return bins.map((count,i)=>({ range:`${(i*maxT/8).toFixed(0)}-${((i+1)*maxT/8).toFixed(0)}s`, count }));
  }, [stats]);

  if (!stats) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col items-center gap-3">
        <Shield className="w-10 h-10 text-zinc-700" />
        <div className="text-center">
          <p className="text-sm font-bold text-zinc-400">No benchmark data yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Run the Episode Benchmark tab to generate robustness stats.
            {!isDomainRandEnabled && <span className="text-amber-400 block mt-1">Enable Domain Randomization for realistic robustness testing.</span>}
          </p>
        </div>
      </div>
    );
  }

  const robustnessScore = Math.round((stats.successRate ?? 0)*100);
  const scoreColor = robustnessScore >= 80 ? '#34a840' : robustnessScore >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-zinc-100">Reality Stress Test Results</h2>
          {isDomainRandEnabled && (
            <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full font-mono">
              Domain Rand ON
            </span>
          )}
        </div>
        <div className="text-2xl font-mono font-bold" style={{color:scoreColor}}>
          {robustnessScore}%
          <span className="text-xs text-zinc-500 ml-1 font-normal">mission success</span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Episodes',     stats.numEpisodes.toString(),                   'zinc'],
            ['Crash Rate',   `${(stats.crashRate*100).toFixed(1)}%`,          stats.crashRate>0.3?'red':'emerald'],
            ['Mean Alt Err', `${stats.meanAltError.toFixed(3)}m`,             'zinc'],
            ['Mean Survival',`${stats.meanSurvivalTime.toFixed(1)}s`,         'zinc'],
            ['Conditional SEC',     stats.meanSEC!=null?`${stats.meanSEC.toFixed(3)}`:'N/A','amber'],
            ['Std SEC',      stats.stdSEC!=null?`±${stats.stdSEC.toFixed(3)}`:'N/A','zinc'],
            ['Best SEC',     stats.bestSEC!=null?`${stats.bestSEC.toFixed(3)}`:'N/A','emerald'],
            ['Worst SEC',    stats.worstSEC!=null?`${stats.worstSEC.toFixed(3)}`:'N/A','red'],
          ].map(([l,v,c])=>(
            <div key={l as string} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-[10px] text-zinc-500 mb-0.5">{l as string}</div>
              <div className={`text-sm font-mono font-bold text-${c as string}-300`}>{v as string}</div>
            </div>
          ))}
        </div>

        {/* Failure mode breakdown */}
        <div>
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Failure mode breakdown
          </div>
          <div className="space-y-1.5">
            {failureCounts.sort((a,b)=>b.count-a.count).map(({mode,count,pct,color})=>(
              <div key={mode} className="flex items-center gap-3 text-xs font-mono">
                <div className="w-32 text-zinc-400 shrink-0">{mode}</div>
                <div className="flex-1 h-3 bg-zinc-800 rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm"
                    style={{width:`${pct}%`, background:color}} />
                </div>
                <div className="w-16 text-right" style={{color}}>
                  {count} ({pct}%)
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Alt error histogram */}
          <div>
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Alt error distribution</div>
            <div style={{height:140}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={altErrorHist} margin={{left:0,right:0}}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                  <XAxis dataKey="range" fontSize={8} stroke="#52525b" tick={{fontSize:8}} />
                  <YAxis fontSize={9} stroke="#52525b" width={25} />
                  <Tooltip contentStyle={{background:'#18181b',border:'1px solid #27272a',fontSize:10,fontFamily:'monospace'}} />
                  <Bar dataKey="count" fill="#34a840" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Survival time histogram */}
          <div>
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Survival time distribution</div>
            <div style={{height:140}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={survivalHist} margin={{left:0,right:0}}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                  <XAxis dataKey="range" fontSize={8} stroke="#52525b" tick={{fontSize:8}} />
                  <YAxis fontSize={9} stroke="#52525b" width={25} />
                  <Tooltip contentStyle={{background:'#18181b',border:'1px solid #27272a',fontSize:10,fontFamily:'monospace'}} />
                  <Bar dataKey="count" fill="#60a5fa" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Interpretation */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-400 space-y-1">
          <div className="font-bold text-zinc-300 mb-2">Interpretation</div>
          {stats.crashRate > 0.9 && <div className="text-red-400">⚠ Crash rate {'>'}90% — the heuristic PD controller cannot stabilize this configuration. <span className="text-zinc-400">Try: (1) Load a trained RL model via the Model Loader, (2) Reduce mass or increase prop diameter, (3) Disable fault modules (motor-out, wind) to establish a baseline.</span></div>}
          {stats.crashRate > 0.5 && stats.crashRate <= 0.9 && <div className="text-red-400">⚠ Crash rate {'>'}50% — simulation failures require diagnosis. <span className="text-zinc-400">Check executed inputs, propulsion/inertia calibration, controller compatibility and recorded failure events before tuning or RL training.</span></div>}
          {stats.stdSEC > stats.meanSEC * 0.5 && stats.meanSEC > 0 && <div className="text-amber-400">⚠ High SEC variance (±{(stats.stdSEC/stats.meanSEC*100).toFixed(0)}%) — policy is inconsistent across conditions.</div>}
          {stats.crashRate >= 0.1 && stats.crashRate <= 0.5 && <div className="text-amber-400">Moderate crash rate — consider enabling domain randomization or training a dedicated RL policy for better robustness.</div>}
          {stats.crashRate < 0.1 && <div className="text-emerald-400">✓ Low crash rate — consider more aggressive domain randomization to stress-test further.</div>}
          {!isDomainRandEnabled && <div className="text-zinc-500 italic">Domain randomization explores assumed variation; it does not establish real-world robustness. Without it, all episodes use identical physics parameters.</div>}
        </div>
      </div>
    </div>
  );
};
