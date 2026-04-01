// LeaderboardTab.tsx — Extracted from App.tsx (lines 703-707)

import { useAppContext } from '../context/AppContext';
import { Leaderboard } from '../Leaderboard';

export function LeaderboardTab() {
  const { sessionHistory, config, tests, clearHistory } = useAppContext();

  return (
    <main className="max-w-[900px] mx-auto p-5">
      <Leaderboard sessions={sessionHistory} currentConfig={config} currentTests={tests} onClearHistory={clearHistory} />
    </main>
  );
}
