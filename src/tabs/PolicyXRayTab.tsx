// PolicyXRayTab.tsx — Extracted from App.tsx (lines 552-589)

import { useAppContext } from '../context/AppContext';
import { PolicyXRay } from '../PolicyXRay';

export function PolicyXRayTab() {
  const { telemetry, agentRef, controllerStatus } = useAppContext();

  return (
    <main className="max-w-[900px] mx-auto p-5 space-y-5">
      <div>
        <h2 className="text-xl font-bold">Policy X-Ray</h2>
        <p className="text-sm text-muted mt-0.5">Real-time numerical Jacobian feature importance — see which observations drive control decisions. Go to the Simulation tab and fly, then return here to watch live.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PolicyXRay agentRef={agentRef} state={telemetry} isUsingModel={controllerStatus === 'Loaded RL Agent'} />
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-sm font-bold text-ink mb-3">How Policy X-Ray works</h3>
            <div className="text-xs text-muted space-y-2 leading-relaxed">
              <p>Every 500ms, the system perturbs each of the 12 observation dimensions by a small per-dimension ε and measures how much the policy's action output changes.</p>
              <p className="font-mono bg-surface p-2 rounded text-ink">
                importance_i = ‖∂action / ∂obs_i‖₂ / ε_i
              </p>
              <p>Wide bar = policy is sensitive to this measurement. Narrow bar = policy largely ignores it.</p>
              <p className="text-amber-700">⚠ Wide bar on noisy sensors (gyro) = policy may be overfitting to sensor noise → reduce IMU noise level in training.</p>
              <p className="text-emerald-700">✓ Dominant altitude sensitivity with low gyro sensitivity = well-regularised policy.</p>
            </div>
          </div>
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Current flight state</h3>
            {telemetry ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {[['Alt', telemetry.z.toFixed(3) + 'm'], ['Roll', (telemetry.phi * 180 / Math.PI).toFixed(1) + '°'], ['Pitch', (telemetry.theta * 180 / Math.PI).toFixed(1) + '°'], ['Z-vel', telemetry.z_dot.toFixed(3) + 'm/s'], ['Battery', (telemetry.battery * 100).toFixed(1) + '%'], ['Time', telemetry.time.toFixed(2) + 's']].map(([k, v]) => (
                  <div key={k as string} className="bg-surface border border-line rounded p-2">
                    <div className="text-muted text-[9px]">{k as string}</div>
                    <div className="text-ink">{v as string}</div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted">No telemetry — start simulation first.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

