// AppContext.tsx — Centralized state management for Copter Studio
// Extracted from App.tsx to enable tab-level component decomposition.

import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { RLAgent } from '../RLAgent';
import { PhysicsConfig, TestModules, DroneState } from '../PhysicsEngine';
import { SensorConfig } from '../SensorNoise';
import { MissionMetrics, TelemetryHistory } from '../MissionLogic';
import { DomainRandomConfig, DEFAULT_DOMAIN_RAND } from '../DomainRandomizer';
import { useEpisodeWorker } from '../useEpisodeWorker';
import { useOptimization, type FlightSession } from '../OptimizationHook';
import type { EpisodeBenchmarkConfig, EpisodeResult, BatchStats } from '../EpisodeRunner';
import type { SimulationIntent } from '../SimulationParser';

// ── URL hash config — versioned so stale hashes degrade gracefully ────────────

const HASH_VERSION = 11;

interface VersionedHashPayload {
  v:      number;
  config: PhysicsConfig;
  tests:  TestModules;
}

function loadConfigFromHash(): Partial<{ config: PhysicsConfig; tests: TestModules }> {
  try {
    const match = window.location.hash.match(/cfg=([^&]+)/);
    if (!match) return {};
    const payload: VersionedHashPayload = JSON.parse(atob(decodeURIComponent(match[1])));
    if (!payload.v || payload.v < 9) return {};
    const config: Partial<PhysicsConfig> = payload.config ?? {};
    const tests:  Partial<TestModules>   = payload.tests  ?? {};
    return { config: config as PhysicsConfig, tests: tests as TestModules };
  } catch {
    return {};
  }
}

function writeConfigToHash(config: PhysicsConfig, tests: TestModules): void {
  const payload: VersionedHashPayload = { v: HASH_VERSION, config, tests };
  const hash = encodeURIComponent(btoa(JSON.stringify(payload)));
  window.history.replaceState(null, '', `#cfg=${hash}`);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppTab = 'simulation' | 'benchmark' | 'policy-xray' | 'digital-twin' | 'gym-bridge' | 'leaderboard';

export interface AppContextType {
  // Navigation / flow
  isStarted: boolean;
  isExiting: boolean;
  simStarted: boolean;
  activeTab: AppTab;
  rightTab: 'aether' | 'obs';
  metricsTrayOpen: boolean;

  // Config
  config: PhysicsConfig;
  tests: TestModules;
  sensorCfg: SensorConfig;
  domainRandCfg: DomainRandomConfig;
  masterSeed: number;

  // Simulation state
  telemetry: DroneState | null;
  noisyState: DroneState | null;
  lastAction: number[];
  crashData: any;
  metrics: MissionMetrics | null;
  historyData: { time: number; sec: number; spt: number }[];
  fullHistory: TelemetryHistory[];

  // Model state
  modelLoadTrigger: number;
  modelErrorTrigger: { count: number; error: string } | null;
  controllerStatus: 'Heuristic PD' | 'Loaded RL Agent';

  // UI toggles
  showForensics: boolean;
  showReplay: boolean;
  comparisonMode: boolean;
  simResetTrigger: number;

  // Refs
  agentRef: React.MutableRefObject<RLAgent>;
  pdAgentRef: React.MutableRefObject<RLAgent>;
  epNumEpisodes: React.MutableRefObject<number>;

  // Worker state
  epRunning: boolean;
  epProgress: number;
  epTotal: number;
  epResults: EpisodeResult[];
  batchStats: BatchStats | null;
  benchController: 'RL Policy' | 'Heuristic PD' | null;

  // Optimization
  bestFlight: FlightSession | null;
  sessionHistory: FlightSession[];

  // Setters
  setActiveTab: React.Dispatch<React.SetStateAction<AppTab>>;
  setRightTab: React.Dispatch<React.SetStateAction<'aether' | 'obs'>>;
  setMetricsTrayOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSimStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setConfig: React.Dispatch<React.SetStateAction<PhysicsConfig>>;
  setTests: React.Dispatch<React.SetStateAction<TestModules>>;
  setSensorCfg: React.Dispatch<React.SetStateAction<SensorConfig>>;
  setDomainRandCfg: React.Dispatch<React.SetStateAction<DomainRandomConfig>>;
  setMasterSeed: React.Dispatch<React.SetStateAction<number>>;
  setTelemetry: React.Dispatch<React.SetStateAction<DroneState | null>>;
  setNoisyState: React.Dispatch<React.SetStateAction<DroneState | null>>;
  setLastAction: React.Dispatch<React.SetStateAction<number[]>>;
  setCrashData: React.Dispatch<React.SetStateAction<any>>;
  setShowForensics: React.Dispatch<React.SetStateAction<boolean>>;
  setShowReplay: React.Dispatch<React.SetStateAction<boolean>>;
  setComparisonMode: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  handleStartMission: () => void;
  handleModelLoaded: () => void;
  handleModelError: (e: string) => void;
  handleMetricsUpdate: (m: MissionMetrics, h: { time: number; sec: number; spt: number }[], full: TelemetryHistory[]) => void;
  handleReset: () => void;
  handleRunSimulation: (intent: SimulationIntent) => void;
  runBenchmark: () => Promise<void>;
  stopWorker: () => void;
  clearHistory: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const savedCfg = useMemo(() => loadConfigFromHash(), []);

  const [isStarted, setIsStarted] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [simStarted, setSimStarted] = useState(false);

  const handleStartMission = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsStarted(true);
      setIsExiting(false);
    }, 1200);
  }, []);

  const [telemetry, setTelemetry]     = useState<DroneState | null>(null);
  const [noisyState, setNoisyState]   = useState<DroneState | null>(null);
  const [lastAction, setLastAction]   = useState<number[]>([]);
  const [crashData, setCrashData]     = useState<any>(null);
  const [modelLoadTrigger, setModelLoadTrigger] = useState(0);
  const [modelErrorTrigger, setModelErrorTrigger] = useState<{ count: number; error: string } | null>(null);
  const [controllerStatus, setControllerStatus] = useState<'Heuristic PD' | 'Loaded RL Agent'>('Heuristic PD');
  const [metrics, setMetrics]         = useState<MissionMetrics | null>(null);
  const [historyData, setHistoryData] = useState<{ time: number; sec: number; spt: number }[]>([]);
  const [fullHistory, setFullHistory] = useState<TelemetryHistory[]>([]);
  const [showForensics, setShowForensics] = useState(false);
  const [showReplay, setShowReplay]   = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [activeTab, setActiveTab]     = useState<AppTab>('simulation');
  const [rightTab, setRightTab]       = useState<'aether' | 'obs'>('aether');
  const [metricsTrayOpen, setMetricsTrayOpen] = useState(true);

  const [masterSeed, setMasterSeed]   = useState(42);
  const epNumEpisodes = useRef(50);

  const [config, setConfig] = useState<PhysicsConfig>(
    savedCfg.config ?? { droneType: 'bicopter', mass: 5.0, propDiameter: 15, batteryVoltage: 22.2, armLength: 0.5 }
  );
  const [tests, setTests] = useState<TestModules>(
    savedCfg.tests ?? { windEnabled: false, payloadShiftEnabled: false, batterySagEnabled: false, motorOutEnabled: false, missionPreset: 'none' }
  );
  const [sensorCfg, setSensorCfg] = useState<SensorConfig>({ enableNoise: false, imuNoiseLevel: 0.5, gpsNoiseLevel: 0.5 });
  const [domainRandCfg, setDomainRandCfg] = useState<DomainRandomConfig>(DEFAULT_DOMAIN_RAND);

  const [simResetTrigger, setSimResetTrigger] = useState(0);

  const agentRef   = useRef(new RLAgent());
  const pdAgentRef = useRef(new RLAgent());

  // ── Worker-based benchmark ──────────────────────────────────────────────
  const {
    runWorker, stopWorker,
    running:          epRunning,
    progress:         epProgress,
    total:            epTotal,
    results:          epResults,
    stats:            batchStats,
    activeController: benchController,
  } = useEpisodeWorker();

  const { saveFlight, getBestFlight, history: sessionHistory, clearHistory } = useOptimization();
  const latestMetrics   = useRef<MissionMetrics | null>(null);
  const latestTelemetry = useRef<DroneState | null>(null);

  useEffect(() => { latestMetrics.current  = metrics;   }, [metrics]);
  useEffect(() => { latestTelemetry.current = telemetry; }, [telemetry]);
  useEffect(() => { writeConfigToHash(config, tests); }, [config, tests]);

  const handleModelLoaded = useCallback(() => {
    setModelLoadTrigger(p => p + 1);
    setControllerStatus('Loaded RL Agent');
  }, []);

  const handleModelError = useCallback((e: string) => {
    setModelErrorTrigger(p => ({ count: (p?.count || 0) + 1, error: e }));
  }, []);

  const handleMetricsUpdate = useCallback((m: MissionMetrics, h: { time: number; sec: number; spt: number }[], full: TelemetryHistory[]) => {
    setMetrics(m);
    setHistoryData(h);
    setFullHistory(full);
  }, []);

  const handleReset = useCallback(() => {
    setCrashData(null);
    setMetrics(null);
    setHistoryData([]);
    setFullHistory([]);
  }, []);

  useEffect(() => {
    if (crashData && latestMetrics.current)
      saveFlight({
        duration: latestTelemetry.current?.time || 0,
        metrics: latestMetrics.current,
        controller: controllerStatus,
        missionType: tests.missionPreset,
      });
  }, [crashData, controllerStatus, tests.missionPreset, saveFlight]);

  const runBenchmark = useCallback(async () => {
    const serializedModel = await agentRef.current.serializeForWorker(config.droneType);
    const cfg: EpisodeBenchmarkConfig = {
      numEpisodes:         epNumEpisodes.current,
      maxStepsPerEpisode:  1000,
      randomizeIC:         true,
      icAltRange:          [0.5, 1.5],
      icAttRange:          [-0.2, 0.2],
      physicsConfig:       config,
      testModules:         tests,
      masterSeed,
      domainRandConfig:    domainRandCfg,
      serializedModel,
    };
    runWorker(cfg);
  }, [config, tests, masterSeed, domainRandCfg, runWorker]);

  const handleRunSimulation = useCallback(async (intent: SimulationIntent) => {
    setConfig(intent.config);
    setTests(intent.tests);
    if (intent.sensorCfg) setSensorCfg(intent.sensorCfg);

    if (intent.type === 'live') {
      setActiveTab('simulation');
      setSimStarted(true);
      setTimeout(() => setSimResetTrigger(t => t + 1), 150);
    } else {
      if (intent.numEpisodes) epNumEpisodes.current = intent.numEpisodes;
      if (intent.masterSeed !== undefined) setMasterSeed(intent.masterSeed);
      if (intent.domainRandEnabled !== undefined)
        setDomainRandCfg(c => ({ ...c, enabled: intent.domainRandEnabled }));
      setActiveTab('benchmark');
      setTimeout(async () => {
        const serializedModel = await agentRef.current.serializeForWorker(intent.config.droneType);
        const cfg: EpisodeBenchmarkConfig = {
          numEpisodes:        intent.numEpisodes ?? 50,
          maxStepsPerEpisode: 1000,
          randomizeIC:        true,
          icAltRange:         [0.5, 1.5],
          icAttRange:         [-0.2, 0.2],
          physicsConfig:      intent.config,
          testModules:        intent.tests,
          masterSeed:         intent.masterSeed ?? 42,
          domainRandConfig:   { ...domainRandCfg, enabled: intent.domainRandEnabled ?? false },
          serializedModel,
        };
        runWorker(cfg);
      }, 150);
    }
  }, [runWorker, domainRandCfg]);

  const bestFlight = getBestFlight('sec');

  const value: AppContextType = {
    isStarted, isExiting, simStarted, activeTab, rightTab, metricsTrayOpen,
    config, tests, sensorCfg, domainRandCfg, masterSeed,
    telemetry, noisyState, lastAction, crashData,
    metrics, historyData, fullHistory,
    modelLoadTrigger, modelErrorTrigger, controllerStatus,
    showForensics, showReplay, comparisonMode, simResetTrigger,
    agentRef, pdAgentRef, epNumEpisodes,
    epRunning, epProgress, epTotal, epResults, batchStats, benchController,
    bestFlight, sessionHistory,
    setActiveTab, setRightTab, setMetricsTrayOpen, setSimStarted,
    setConfig, setTests, setSensorCfg, setDomainRandCfg, setMasterSeed,
    setTelemetry, setNoisyState, setLastAction, setCrashData,
    setShowForensics, setShowReplay, setComparisonMode,
    handleStartMission, handleModelLoaded, handleModelError,
    handleMetricsUpdate, handleReset, handleRunSimulation,
    runBenchmark, stopWorker, clearHistory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
