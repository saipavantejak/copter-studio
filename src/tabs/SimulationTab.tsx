// SimulationTab.tsx — Extracted from App.tsx
// Contains: 3-panel layout (config | 3D viewport | Aether AI)

import { useAppContext } from '../context/AppContext';
import { DroneSim } from '../DroneSim';
import { AetherInterface } from '../AetherInterface';
import { ModelLoader } from '../ModelLoader';
import { TestDashboard } from '../TestDashboard';
import { SplitPane } from '../SplitPane';
import { EfficiencyUI } from '../EfficiencyUI';
import { ObsActionViz } from '../ObsActionViz';
import { PanelErrorBoundary } from '../ErrorBoundary';
import { exportCSV, exportROSBag } from '../TelemetryExport';
import { GitCompare, Play, Square, ChevronDown, ChevronUp, Layers, Terminal, Download } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';

export function SimulationTab() {
  const {
    config, setConfig, tests, setTests, sensorCfg, setSensorCfg,
    telemetry, setTelemetry, noisyState, setNoisyState,
    lastAction, setLastAction, crashData, setCrashData,
    metrics, historyData, fullHistory,
    handleMetricsUpdate, handleReset,
    modelLoadTrigger, modelErrorTrigger, controllerStatus,
    handleModelLoaded, handleModelError,
    simStarted, setSimStarted, simResetTrigger, setSimResetTrigger,
    comparisonMode, setComparisonMode,
    rightTab, setRightTab, metricsTrayOpen, setMetricsTrayOpen,
    agentRef, pdAgentRef,
    epRunning, batchStats, activeTab,
    showForensics, setShowForensics, showReplay, setShowReplay,
    handleRunSimulation,
  } = useAppContext();

  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  // ── Start / Stop handlers ───────────────────────────────────────────────
  // Both prompt the user with window.confirm before mutating sim state, so an
  // accidental click while editing config doesn't kick off / kill a run.
  const handleStartSimulation = () => {
    const ok = window.confirm(
      `Start simulation with this configuration?\n\n` +
      `  • Drone:   ${config.droneType}\n` +
      `  • Mass:    ${config.mass} kg\n` +
      `  • Prop Ø:  ${config.propDiameter}″\n` +
      `  • Battery: ${config.batteryVoltage} V`
    );
    if (!ok) return;
    setSimStarted(true);
    // Hard reset so each launch begins from a known state
    setTimeout(() => setSimResetTrigger(t => t + 1), 50);
  };

  const handleStopSimulation = () => {
    const ok = window.confirm(
      'Stop the simulation?\n\nThe drone will halt and the scene will reset to the launch overlay.'
    );
    if (!ok) return;
    setSimStarted(false);
    setTimeout(() => setSimResetTrigger(t => t + 1), 50);
  };

  // ── 3D Viewport + Start / Stop Buttons ──────────────────────────────────
  const viewport = (
    <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
      {/* Top-right control cluster: Stop (only while running) + Compare */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        {simStarted && (
          <button onClick={handleStopSimulation}
            title="Stop the simulation"
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg border bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25 hover:text-red-200 transition-colors">
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        )}
        <button onClick={() => setComparisonMode(c => !c)}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors ${comparisonMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
          <GitCompare className="w-3 h-3" /> {comparisonMode ? 'PD vs RL' : 'Compare'}
        </button>
      </div>
      <div className="absolute inset-0">
        <PanelErrorBoundary name="3D Simulation">
          <DroneSim agentRef={agentRef} pdAgentRef={pdAgentRef}
            onTelemetryUpdate={setTelemetry} onCrash={setCrashData}
            onMetricsUpdate={handleMetricsUpdate} onReset={handleReset}
            onActionUpdate={setLastAction} onNoisyStateUpdate={setNoisyState}
            config={config} tests={tests} sensorCfg={sensorCfg}
            comparisonMode={comparisonMode} resetTrigger={simResetTrigger}
            paused={!simStarted || activeTab !== 'simulation'} />
        </PanelErrorBoundary>
      </div>
      {!simStarted && (
        <div id="start-sim-area" className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button onClick={handleStartSimulation}
            className="group flex flex-col items-center gap-3 px-8 py-5 bg-emerald-600/90 hover:bg-emerald-500 rounded-2xl shadow-2xl shadow-emerald-500/20 transition-all hover:scale-105">
            <Play className="w-10 h-10 text-white group-hover:scale-110 transition-transform" />
            <span className="text-white font-bold text-sm tracking-wide">Start Simulation</span>
            <span className="text-emerald-200/70 text-[10px] font-mono">{config.droneType} · {config.mass}kg · {config.propDiameter}″</span>
          </button>
        </div>
      )}
      {telemetry && (
        <div className="absolute bottom-3 left-3 z-20 bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-2xl">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[10px] font-mono">
            <div><span className="text-zinc-500">ALT</span> <span className="text-zinc-200 ml-1">{telemetry.z.toFixed(2)}m</span></div>
            <div><span className="text-zinc-500">ROLL</span> <span className="text-zinc-200 ml-1">{(telemetry.phi * 180 / Math.PI).toFixed(1)}°</span></div>
            <div><span className="text-zinc-500">PITCH</span> <span className="text-zinc-200 ml-1">{(telemetry.theta * 180 / Math.PI).toFixed(1)}°</span></div>
            <div><span className="text-zinc-500">Vz</span> <span className="text-zinc-200 ml-1">{telemetry.z_dot.toFixed(2)}</span></div>
            <div><span className="text-zinc-500">BAT</span> <span className={`ml-1 ${telemetry.battery < 0.3 ? 'text-red-400' : 'text-emerald-400'}`}>{(telemetry.battery * 100).toFixed(0)}%</span></div>
            <div><span className="text-zinc-500">T</span> <span className="text-zinc-200 ml-1">{telemetry.time.toFixed(1)}s</span></div>
          </div>
        </div>
      )}
      {metricsTrayOpen && metrics ? (
        <button onClick={() => setMetricsTrayOpen(false)}
          className="absolute bottom-3 right-3 z-20 p-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Collapse metrics">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      ) : metrics ? (
        <button onClick={() => setMetricsTrayOpen(true)}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 text-[10px] font-mono transition-colors"
          title="Expand metrics">
          <ChevronUp className="w-3.5 h-3.5" /> Metrics
        </button>
      ) : null}
    </div>
  );

  // ── Metrics tray ────────────────────────────────────────────────────────
  const metricsTray = metricsTrayOpen && metrics ? (
    <div className="h-[30%] min-h-[120px] shrink-0 mt-1 overflow-y-auto">
      <PanelErrorBoundary name="Efficiency UI" compact>
        <EfficiencyUI metrics={metrics} historyData={historyData} />
      </PanelErrorBoundary>
    </div>
  ) : null;

  // ── Right column: Aether / Obs tab ──────────────────────────────────────
  const rightColumn = (
    <div id="aether-panel" className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 mb-2 shrink-0">
        <button onClick={() => setRightTab('aether')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${rightTab === 'aether' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
          <Terminal className="w-3 h-3" /> Aether AI
        </button>
        <button onClick={() => setRightTab('obs')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${rightTab === 'obs' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
          <Layers className="w-3 h-3" /> Obs / Export
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div hidden={rightTab !== 'aether'} className="h-full">
          <PanelErrorBoundary name="Aether AI">
            <AetherInterface telemetry={telemetry} crashData={crashData}
              modelLoadTrigger={modelLoadTrigger} modelErrorTrigger={modelErrorTrigger}
              activeTests={tests} config={config} metrics={metrics} episodeStats={batchStats}
              onShowForensics={() => setShowForensics(true)}
              onRunSimulation={handleRunSimulation} />
          </PanelErrorBoundary>
        </div>
        {rightTab !== 'aether' && (
          <div className="flex flex-col gap-2 h-full overflow-y-auto">
            <PanelErrorBoundary name="Obs/Action Viz" compact>
              <ObsActionViz state={telemetry} action={lastAction} noisy={sensorCfg.enableNoise ? noisyState : null} />
            </PanelErrorBoundary>
            {fullHistory.length > 10 && (
              <div className="flex flex-col gap-1.5 px-1">
                <button onClick={() => exportCSV(fullHistory)}
                  className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-[10px] font-mono flex items-center justify-center gap-1 transition-colors">
                  <Download className="w-3 h-3" /> Export CSV
                </button>
                <button onClick={() => exportROSBag(fullHistory)}
                  className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-[10px] font-mono flex items-center justify-center gap-1 transition-colors">
                  <Download className="w-3 h-3" /> Export ROS Bag
                </button>
                {crashData && (
                  <button onClick={() => setShowReplay(true)}
                    className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-[10px] font-mono flex items-center justify-center gap-1 transition-colors">
                    ▶ Replay Crash
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Mobile stacked layout ───────────────────────────────────────────────
  if (isMobile) {
    return (
      <main className="p-2 flex flex-col gap-2 overflow-y-auto" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <div className="min-h-[300px]">{viewport}</div>
        {metricsTray}
        <details className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <summary className="px-3 py-2 text-xs font-bold text-zinc-300 cursor-pointer">⚙ Config & Model</summary>
          <div className="p-2 space-y-2">
            <div id="config-panel"><PanelErrorBoundary name="Config Panel"><TestDashboard config={config} setConfig={setConfig} tests={tests} setTests={setTests} sensorCfg={sensorCfg} setSensorCfg={setSensorCfg} telemetry={telemetry} /></PanelErrorBoundary></div>
            <div id="model-loader"><PanelErrorBoundary name="Model Loader" compact><ModelLoader agentRef={agentRef} onModelLoaded={handleModelLoaded} onModelError={handleModelError} droneType={config.droneType} benchmarkActive={epRunning} /></PanelErrorBoundary></div>
          </div>
        </details>
        <div className="min-h-[400px]">{rightColumn}</div>
      </main>
    );
  }

  // ── Desktop / Tablet layout ─────────────────────────────────────────────
  return (
    <main className="p-2 h-[calc(100vh-3.5rem)]">
      <SplitPane direction="vertical" defaultSplit={isTablet ? 25 : 18} minA={200} minB={500}>
        {/* Left column: Config + Model */}
        <div className="flex flex-col gap-2 h-full min-h-0">
          <div id="config-panel" className="flex-1 min-h-0 overflow-hidden">
            <PanelErrorBoundary name="Config Panel">
              <TestDashboard config={config} setConfig={setConfig} tests={tests} setTests={setTests}
                sensorCfg={sensorCfg} setSensorCfg={setSensorCfg} telemetry={telemetry} />
            </PanelErrorBoundary>
          </div>
          <div id="model-loader" className="flex-[0_0_auto] max-h-[45%] min-h-[180px] overflow-y-auto">
            <PanelErrorBoundary name="Model Loader" compact>
              <ModelLoader agentRef={agentRef} onModelLoaded={handleModelLoaded}
                onModelError={handleModelError} droneType={config.droneType}
                benchmarkActive={epRunning} />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* Inner split: Center viewport | Right intelligence */}
        <SplitPane direction="vertical" defaultSplit={isTablet ? 60 : 72} minA={400} minB={260}>
          {/* Center column: 3D Sim + Metrics Tray */}
          <div className="h-full flex flex-col min-h-0">
            {viewport}
            {metricsTray}
          </div>
          {/* Right column */}
          {rightColumn}
        </SplitPane>
      </SplitPane>
    </main>
  );
}
