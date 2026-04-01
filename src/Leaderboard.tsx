// Leaderboard.tsx
// Tier 2+4: Session leaderboard sorted by SEC score + URL sharing

import React, { useMemo } from 'react';
import { Trophy, Share2, Download, RefreshCw, Clock, Zap, Target } from 'lucide-react';
import { FlightSession } from './OptimizationHook';

interface LeaderboardProps {
  sessions: FlightSession[];
  currentConfig: object;
  currentTests: object;
  onClearHistory: () => void;
}

function medal(rank: number): string {
  if (rank === 0) return '🥇';
  if (rank === 1) return '🥈';
  if (rank === 2) return '🥉';
  return `#${rank+1}`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  sessions, currentConfig, currentTests, onClearHistory
}) => {
  const ranked = useMemo(() => {
    return [...sessions]
      .filter(s => s.metrics.sec > 0)
      .sort((a,b) => a.metrics.sec - b.metrics.sec); // lower SEC = better
  }, [sessions]);

  const all = useMemo(() => {
    return [...sessions].sort((a,b) => b.timestamp - a.timestamp);
  }, [sessions]);

  const handleShare = () => {
    const hash = btoa(JSON.stringify({
      config: currentConfig,
      tests:  currentTests,
    }));
    const url = `${window.location.origin}${window.location.pathname}#cfg=${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Session URL copied to clipboard!\n\nAnyone opening this link will load your exact drone configuration.');
    }).catch(() => {
      prompt('Copy this URL to share your config:', url);
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-zinc-100">Leaderboard</span>
          <span className="text-xs text-zinc-500 font-mono">({sessions.length} sessions)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
            title="Copy shareable URL"
          >
            <Share2 className="w-3 h-3" /> Share config
          </button>
          <button
            onClick={onClearHistory}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-500 rounded border border-zinc-700 transition-colors"
            title="Clear session history"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Top 3 SEC podium */}
        {ranked.length > 0 && (
          <div className="p-4 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3">Best SEC (J/g·km)</div>
            <div className="space-y-2">
              {ranked.slice(0,3).map((s,i) => (
                <div key={s.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                  i===0 ? 'bg-amber-500/10 border-amber-500/30' :
                  i===1 ? 'bg-zinc-400/10 border-zinc-500/30' :
                          'bg-orange-900/10 border-orange-800/30'
                }`}>
                  <span className="text-lg w-6 text-center">{medal(i)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">{s.controller}</span>
                      <span className="text-xs text-zinc-600">·</span>
                      <span className="text-xs text-zinc-500">{s.missionType}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-base font-mono font-bold ${
                      i===0 ? 'text-amber-300' : 'text-zinc-300'
                    }`}>{s.metrics.sec.toFixed(3)}</div>
                    <div className="text-xs text-zinc-600">{fmtTime(s.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full history table */}
        <div className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3">All Sessions</div>
          {all.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm">
              No sessions yet. Run the simulation to record flights.
            </div>
          ) : (
            <div className="space-y-1.5">
              {all.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 bg-zinc-800/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        s.controller === 'Loaded RL Agent'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>{s.controller === 'Loaded RL Agent' ? 'RL' : 'PD'}</span>
                      <span className="text-xs text-zinc-500">{s.missionType || 'free-flight'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Clock className="w-2.5 h-2.5" />{s.duration.toFixed(1)}s
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Zap className="w-2.5 h-2.5" />SEC: {s.metrics.sec > 0 ? s.metrics.sec.toFixed(3) : '—'}
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Target className="w-2.5 h-2.5" />{s.metrics.targetDeviation.toFixed(1)}cm
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600 shrink-0">{fmtTime(s.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
