// BenchmarkTab.tsx — Extracted from App.tsx (lines 401-549)

import { useAppContext } from '../context/AppContext';
import { RobustnessPanel } from '../RobustnessPanel';
import { CloudHistory } from '../CloudHistory';
import { Cpu, Shield, Play, Bookmark, Download } from 'lucide-react';

export function BenchmarkTab() {
  const {
    config, tests, controllerStatus,
    masterSeed, setMasterSeed,
    setTests,
    epNumEpisodes, setEpNumEpisodes,
    domainRandCfg, setDomainRandCfg,
    epRunning, epProgress, epTotal, epResults,
    batchStats, benchController,
    runBenchmark, stopWorker,
  } = useAppContext();

  return (
    <main className="max-w-[1400px] mx-auto p-5 space-y-5">
      <CloudHistory />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Episode Benchmark</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Headless batch simulation in a Web Worker — canvas stays responsive.
            {controllerStatus === 'Loaded RL Agent'
              ? ' RL policy loaded — benchmark will use your neural network.'
              : ' No RL model loaded — benchmark uses heuristic PD controller.'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono
            ${controllerStatus === 'Loaded RL Agent'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
            <Cpu className="w-3 h-3" />
            {benchController ?? (controllerStatus === 'Loaded RL Agent' ? 'RL Policy' : 'Heuristic PD')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Seed:</span>
            <input aria-label="Benchmark seed" type="number" min={0} max={4294967295} step={1} value={masterSeed} onChange={e => { const n=e.target.valueAsNumber;if(Number.isSafeInteger(n)&&n>=0&&n<=4294967295)setMasterSeed(n); }}
              className="w-20 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 font-mono focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Episodes:</span>
            <select aria-label="Benchmark episodes" value={epNumEpisodes} onChange={e => setEpNumEpisodes(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500">
              {[...new Set([10,25,50,100,epNumEpisodes])].sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {epRunning
            ? <button onClick={stopWorker} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium">Stop</button>
            : <button onClick={runBenchmark} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <Play className="w-4 h-4" /> Run Benchmark
              </button>
          }
        </div>
      </div>

      <p className="text-xs text-amber-400">Experimental simulation—not a validated aircraft digital twin. SEC is conditional on successful missions with explicit payload; failures remain in success rate and total energy.</p>
      <label className="text-xs text-zinc-400">Benchmark duration (simulated seconds)
        <input type="number" min={1} max={3600} value={tests.mission?.durationSeconds ?? 16}
          onChange={e => {const value=Number(e.target.value);if(Number.isFinite(value)&&value>=1&&value<=3600)setTests(t=>({...t,mission:{mode:'hover',targetAltitudeM:1,forwardVelocityMps:0,...t.mission,durationSeconds:value}}));}}
          className="ml-2 w-24 bg-zinc-900 border border-zinc-700 p-1" />
      </label>
      {batchStats && <p className="text-xs text-zinc-300">Mission success: {((batchStats.successRate ?? 0)*100).toFixed(1)}% · Total energy across all attempts: {(batchStats.totalEnergyJ ?? 0).toFixed(1)} J · Valid SEC samples: {batchStats.efficiencySampleCount ?? 0}</p>}
      {batchStats?.successRate95CI && <p className="text-xs text-zinc-400">95% interval for simulated mission success: {batchStats.successRate95CI.map(v=>(100*v).toFixed(1)+'%').join('–')}. Conditional on these test settings; not a real-flight reliability estimate.</p>}
      {/* Quick presets */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bookmark className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-zinc-100">Quick Presets</h3>
          <span className="text-[10px] text-zinc-500">one-click benchmark configs</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Baseline (clean)', seed: 42, eps: 50, dr: false, desc: 'No faults, no randomization — pure controller test' },
            { label: 'Wind stress', seed: 42, eps: 50, dr: false, desc: 'Wind enabled, tests controller rejection' },
            { label: 'Full stress test', seed: 42, eps: 100, dr: true, desc: 'All faults + domain randomization — sim-to-real robustness' },
            { label: 'Reproducibility check', seed: 7, eps: 25, dr: false, desc: 'Different seed to verify determinism' },
          ].map(p => (
            <button key={p.label} onClick={() => {
              setTests(t => ({...t,missionPreset:'none',mission:undefined,windEnabled:p.label==='Wind stress'||p.dr,payloadShiftEnabled:p.dr,batterySagEnabled:p.dr,motorOutEnabled:p.dr}));
              setMasterSeed(p.seed);
              setEpNumEpisodes(p.eps);
              setDomainRandCfg(c => ({ ...c, enabled: p.dr }));
            }}
              title={p.desc}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-[11px] font-medium transition-colors">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Domain randomization controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-zinc-100">Domain Randomization</h3>
            <span className="text-[10px] text-zinc-500">for sim-to-real robustness</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-zinc-400">Enable</span>
            <input type="checkbox" checked={domainRandCfg.enabled}
              onChange={e => setDomainRandCfg(c => ({ ...c, enabled: e.target.checked }))}
              className="w-4 h-4 accent-purple-500" />
          </label>
        </div>
        {domainRandCfg.enabled && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
            {[
              ['Mass ±%',      'massVariationPct',   0, 0.5, 0.05],
              ['Prop eff ±%',  'propEffVariation',   0, 0.3, 0.05],
              ['Voltage ±%',   'voltageVariation',   0, 0.2, 0.05],
              ['IMU noise',    'imuNoiseRange_hi',   0, 1, 0.1],
              ['Wind prob',    'windProbability',    0, 1, 0.1],
              ['Payload prob', 'payloadProbability', 0, 1, 0.1],
            ].map(([lbl, key, mn, mx, st]) => (
              <div key={key as string}>
                <label className="text-zinc-500 mb-1 block">{lbl as string}: <span className="text-zinc-300">
                  {key === 'imuNoiseRange_hi'
                    ? domainRandCfg.imuNoiseRange[1].toFixed(2)
                    : ((domainRandCfg as any)[key as string] || 0).toFixed?.(2) ?? 0}
                </span></label>
                <input type="range" min={mn as number} max={mx as number} step={st as number}
                  value={key === 'imuNoiseRange_hi' ? domainRandCfg.imuNoiseRange[1] : (domainRandCfg as any)[key as string] || 0}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (key === 'imuNoiseRange_hi') setDomainRandCfg(c => ({ ...c, imuNoiseRange: [c.imuNoiseRange[0], v] }));
                    else setDomainRandCfg(c => ({ ...c, [key as string]: v }));
                  }}
                  className="w-full accent-purple-500" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress */}
      {epRunning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span>Running episodes in Worker (seed={masterSeed})…</span>
            <span className="font-mono text-zinc-400">{epProgress}/{epTotal}</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(epProgress / epTotal) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Export benchmark results with version metadata */}
      {batchStats && (
        <div className="flex gap-2">
          <button onClick={() => {
            const payload = {
              version: 'v12-pro',
              timestamp: new Date().toISOString(),
              config: { ...config, tests, domainRand: domainRandCfg },
              stats: { ...batchStats, episodes: undefined },
              episodeCount: batchStats.numEpisodes,
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `benchmark_${batchStats.masterSeed}_${Date.now()}.json`; a.click();
            URL.revokeObjectURL(url);
          }}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors">
            <Download className="w-3 h-3" /> Export Results (JSON)
          </button>
        </div>
      )}

      <RobustnessPanel stats={batchStats} isDomainRandEnabled={domainRandCfg.enabled} />

      {epResults.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-bold">Episode Log</h3>
            <span className="text-xs text-zinc-500">{epResults.length} episodes · seed={masterSeed}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  {['Ep', 'Seed', 'Ctrl', 'Status', 'Time', 'Alt Err', 'Roll', 'Pitch', 'SEC', 'SPT', 'Mass', 'Motor τ'].map(h => (
                    <th key={h} className="text-left px-2.5 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {epResults.slice(-25).reverse().map(r => (
                  <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-2.5 py-1.5 text-zinc-500">#{r.id + 1}</td>
                    <td className="px-2.5 py-1.5 text-zinc-600 text-[10px]">{r.seed.toString(16).slice(-6)}</td>
                    <td className="px-2.5 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.controller === 'RL Policy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {r.controller === 'RL Policy' ? 'RL' : 'PD'}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${!r.successful ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {r.outcome ?? (r.crashed ? 'CRASH' : 'UNVERIFIED')}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-zinc-300">{r.survivalTime.toFixed(1)}s</td>
                    <td className="px-2.5 py-1.5 text-zinc-300">{r.meanAltError.toFixed(3)}m</td>
                    <td className="px-2.5 py-1.5 text-zinc-300">{(r.maxRoll * 180 / Math.PI).toFixed(1)}°</td>
                    <td className="px-2.5 py-1.5 text-zinc-300">{(r.maxPitch * 180 / Math.PI).toFixed(1)}°</td>
                    <td className="px-2.5 py-1.5 text-amber-300">{r.successful && r.secApplicable ? r.sec.toFixed(4) : 'N/A'}</td>
                    <td className="px-2.5 py-1.5 text-blue-300">{r.spt.toFixed(4)}</td>
                    <td className="px-2.5 py-1.5 text-zinc-500">{r.domainParams?.mass.toFixed(2)}kg</td>
                    <td className="px-2.5 py-1.5 text-zinc-500">{r.domainParams?.motorTau ? (r.domainParams.motorTau * 1000).toFixed(0) + 'ms' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
