// OptimizationHook.ts
// Session-scoped flight history + best-flight retrieval for Leaderboard.
// Uses in-memory state only (no localStorage — not supported in this environment).

import { useState, useCallback } from 'react';
import { MissionMetrics } from './MissionLogic';

export interface FlightSession {
  id: string;
  timestamp: number;
  duration: number;
  metrics: MissionMetrics;
  controller: 'Heuristic PD' | 'Loaded RL Agent';
  missionType: string;
}

interface SaveFlightArgs {
  duration: number;
  metrics: MissionMetrics;
  controller: 'Heuristic PD' | 'Loaded RL Agent';
  missionType: string;
}

export function useOptimization() {
  const [history, setHistory] = useState<FlightSession[]>([]);

  const saveFlight = useCallback((args: SaveFlightArgs) => {
    const session: FlightSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...args,
    };
    setHistory(prev => [session, ...prev].slice(0, 100)); // keep last 100
  }, []);

  const getBestFlight = useCallback(
    (metric: keyof MissionMetrics): FlightSession | null => {
      const valid = history.filter(s => (s.metrics[metric] as number) > 0);
      if (!valid.length) return null;
      // For SEC and SPT, lower is better; for others, higher is better
      const lowerIsBetter = metric === 'sec' || metric === 'spt';
      return valid.reduce((best, cur) =>
        lowerIsBetter
          ? (cur.metrics[metric] as number) < (best.metrics[metric] as number) ? cur : best
          : (cur.metrics[metric] as number) > (best.metrics[metric] as number) ? cur : best
      );
    },
    [history]
  );

  const clearHistory = useCallback(() => setHistory([]), []);

  return { saveFlight, getBestFlight, history, clearHistory };
}
