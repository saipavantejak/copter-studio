// DigitalTwinTab.tsx — Extracted from App.tsx (lines 592-631)

import { useAppContext } from '../context/AppContext';
import { DigitalTwinCalibrator } from '../DigitalTwinCalibrator';

export function DigitalTwinTab() {
  const { config, setConfig, setActiveTab } = useAppContext();

  return (
    <main className="max-w-[1000px] mx-auto p-5 space-y-5">
      <div>
        <h2 className="text-xl font-bold">Digital Twin Calibrator</h2>
        <p className="text-sm text-muted mt-0.5">Upload a real drone flight CSV (from hardware) and automatically fit physics parameters. Calibrated simulator will match your real drone's behaviour.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DigitalTwinCalibrator currentConfig={config} onCalibrated={(newCfg) => { setConfig(newCfg); setActiveTab('simulation'); }} />
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-sm font-bold text-ink mb-3">What the calibrator fits</h3>
            <div className="space-y-2 text-xs text-muted">
              {[
                ['Mass', 'Total drone mass including payload'],
                ['Propeller Ø', 'Effective aerodynamic diameter'],
                ['Battery voltage', 'Actual voltage under load'],
                ['Motor τ', 'ESC+motor first-order lag (50ms typical)'],
                ['Drag Cd', 'Aerodynamic drag coefficient'],
              ].map(([p, d]) => (
                <div key={p as string} className="flex gap-3">
                  <span className="text-teal-700 font-bold w-28 shrink-0">{p as string}</span>
                  <span>{d as string}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-sm font-bold text-ink mb-3">How to get your flight CSV</h3>
            <ol className="text-xs text-muted space-y-1 list-decimal list-inside">
              <li>Fly your real drone and log telemetry (PX4 / ArduPilot logs)</li>
              <li>Convert to CSV with columns: time_s, z_m, roll_rad, pitch_rad</li>
              <li>Or use a sim flight: Export CSV from the Simulation tab</li>
              <li>Upload here — the optimizer runs in ~10 seconds</li>
              <li>Click "Apply" to load the calibrated params into the simulator</li>
            </ol>
          </div>
        </div>
      </div>
    </main>
  );
}

