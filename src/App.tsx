// App.tsx — v12 refactored
// Reduced from 724 lines to ~85 lines.
// All state management → AppContext.tsx
// All tab rendering → individual tab components in src/tabs/

import { AppProvider, useAppContext, type AppTab } from './context/AppContext';
import { SimulationTab } from './tabs/SimulationTab';
import { BenchmarkTab } from './tabs/BenchmarkTab';
import { PolicyXRayTab } from './tabs/PolicyXRayTab';
import { DigitalTwinTab } from './tabs/DigitalTwinTab';
import { GymBridgeTab } from './tabs/GymBridgeTab';
import { LeaderboardTab } from './tabs/LeaderboardTab';
import { WelcomeOverlay } from './WelcomeOverlay';
import { CrashForensics } from './CrashForensics';
import { CrashReplay } from './CrashReplay';
import { OnboardingTour } from './OnboardingTour';
import { Activity, Wind, Trophy, BarChart2, Eye, Settings, Terminal } from 'lucide-react';

const TABS: { id: AppTab; label: string; icon: any }[] = [
  { id: 'simulation',   label: 'Simulation',   icon: Wind      },
  { id: 'benchmark',    label: 'Benchmark',    icon: BarChart2 },
  { id: 'policy-xray',  label: 'Policy X-Ray', icon: Eye       },
  { id: 'digital-twin', label: 'Digital Twin', icon: Settings  },
  { id: 'gym-bridge',   label: 'Gym Bridge',   icon: Terminal  },
  { id: 'leaderboard',  label: 'Leaderboard',  icon: Trophy    },
];

function AppContent() {
  const {
    isStarted, isExiting, handleStartMission,
    activeTab, setActiveTab,
    bestFlight, controllerStatus, crashData,
    showForensics, setShowForensics,
    showReplay, setShowReplay, fullHistory,
  } = useAppContext();

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* ── MAIN APPLICATION UI ──────────────────────────────────────── */}
      <div className={`flex flex-col h-screen transition-opacity duration-1000 ${(isStarted || isExiting) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-[1800px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <img src="/logo-dark.png" className="h-8 w-auto object-contain" alt="Copter Studios" />
              <div>
                <h1 className="font-bold text-sm tracking-tight text-white">COPTER STUDIOS</h1>
                <p className="text-[9px] text-zinc-400 font-mono">The Premier Digital Twin for Autonomous Flight &amp; RL Research</p>
              </div>
            </div>
            {/* Tabs */}
            <div id="tab-bar" className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg p-1 overflow-x-auto responsive-tab-bar">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${activeTab === t.id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  <t.icon className="w-3 h-3" /> {t.label}
                </button>
              ))}
            </div>
            {/* Status */}
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 shrink-0">
              {bestFlight && (
                <div className="hidden lg:flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-300 font-bold">{bestFlight.metrics.sec === 0 && bestFlight.metrics.hoverPowerW > 0
                    ? `Hover: ${bestFlight.metrics.hoverPowerW.toFixed(0)} W`
                    : bestFlight.metrics.sec.toFixed(3)}</span>
                </div>
              )}
              <span className="hidden md:inline">CTRL: <span className={controllerStatus === 'Loaded RL Agent' ? 'text-emerald-400' : 'text-amber-400'}>{controllerStatus}</span></span>
              <div className="flex items-center gap-1" title={crashData ? 'System Fault — the drone has crashed or exceeded safe flight limits' : 'System Nominal — all sensors and motors are functioning normally'}>
                <Activity className={`w-3 h-3 ${crashData ? 'text-red-500' : 'text-emerald-500 animate-pulse'}`} />
                <span className={crashData ? 'text-red-400 font-bold' : 'text-emerald-400'}>{crashData ? 'SYS_FAULT' : 'SYS_NOMINAL'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Tab Content ────────────────────────────────────────────── */}
        {activeTab === 'simulation'   && <SimulationTab />}
        {activeTab === 'benchmark'    && <BenchmarkTab />}
        {activeTab === 'policy-xray'  && <PolicyXRayTab />}
        {activeTab === 'digital-twin' && <DigitalTwinTab />}
        {activeTab === 'gym-bridge'   && <GymBridgeTab />}
        {activeTab === 'leaderboard'  && <LeaderboardTab />}

        {/* Modals */}
        {showForensics && <CrashForensics crashData={crashData} fullHistory={fullHistory} onClose={() => setShowForensics(false)} />}
        {showReplay    && <CrashReplay    history={fullHistory}                            onClose={() => setShowReplay(false)} />}

        {/* Onboarding Tour */}
        {isStarted && <OnboardingTour />}
      </div>

      {/* ── WELCOME OVERLAY ──────────────────────────────────────────── */}
      {!isStarted && (
        <WelcomeOverlay
          isExiting={isExiting}
          onStart={handleStartMission}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
