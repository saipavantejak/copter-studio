// SimulationApprovalDialog.tsx
// Full-screen modal that surfaces every parsed parameter + every ambiguity
// before touching the simulator. The user approves, edits the suggested prompt,
// or cancels. No simulation fires without explicit sign-off.

import React, { useState } from 'react';
import {
  CheckCircle, XCircle, AlertTriangle, Info, ChevronRight,
  RefreshCw, Play, X, Cpu, Wind, Battery, Box, Wifi, Shield
} from 'lucide-react';
import type { SimulationIntent, Ambiguity } from './SimulationParser';

interface Props {
  intent: SimulationIntent;
  originalPrompt: string;
  onApprove: (intent: SimulationIntent) => void;
  onEdit:    (newPrompt: string) => void;
  onCancel:  () => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<Ambiguity['level'], string> = {
  info:    'text-blue-700  border-blue-500/30  bg-blue-500/5',
  warning: 'text-amber-700 border-amber-500/30 bg-amber-500/5',
  error:   'text-red-700   border-red-500/30   bg-red-500/5',
};
const LEVEL_ICON: Record<Ambiguity['level'], React.FC<{ className?: string }>> = {
  info:    Info,
  warning: AlertTriangle,
  error:   XCircle,
};

function AmbiguityRow({ a }: { a: Ambiguity }) {
  const Icon = LEVEL_ICON[a.level];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${LEVEL_COLOR[a.level]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="font-bold font-mono">{a.field}</span>
        <span className="text-muted"> — {a.issue}</span>
        <div className="text-muted mt-0.5">Assumed: <span className="text-ink">{a.assumed}</span></div>
        {a.suggestion && (
          <div className="text-muted mt-0.5 flex items-center gap-1">
            <ChevronRight className="w-3 h-3 shrink-0" />
            {a.suggestion}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigCard({ label, value, icon: Icon, highlight }: {
  label: string; value: string; icon?: React.FC<{ className?: string }>; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-2.5 flex flex-col gap-0.5 ${highlight ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line-strong bg-surface'}`}>
      <div className="flex items-center gap-1 text-[10px] text-muted uppercase">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`text-sm font-mono font-bold ${highlight ? 'text-emerald-700' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

const CONFIDENCE_COLOR = { high: 'text-emerald-700', medium: 'text-amber-700', low: 'text-red-700' };
const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Medium confidence — review warnings', low: 'Low confidence — errors must be resolved' };

// ── component ─────────────────────────────────────────────────────────────────

export const SimulationApprovalDialog: React.FC<Props> = ({
  intent, originalPrompt, onApprove, onEdit, onCancel,
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing,  setIsEditing]  = useState(false);

  const hasErrors   = intent.ambiguities.some(a => a.level === 'error');
  const hasWarnings = intent.ambiguities.some(a => a.level === 'warning');
  const blockApprove = hasErrors;

  const { config, tests, type } = intent;

  const activeTests = [
    tests.windEnabled          && { label: 'Wind',          Icon: Wind      },
    tests.payloadShiftEnabled  && { label: 'Payload Shift', Icon: Box       },
    tests.batterySagEnabled    && { label: 'Battery Sag',   Icon: Battery   },
    tests.motorOutEnabled      && { label: 'Motor-Out',     Icon: AlertTriangle },
    intent.sensorCfg.enableNoise && { label: 'Sensor Noise', Icon: Wifi    },
    intent.domainRandEnabled   && { label: 'Domain Rand',   Icon: Shield    },
  ].filter(Boolean) as { label: string; Icon: React.FC<{className?:string}> }[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 backdrop-blur-sm p-4">
      <div className="bg-surface border border-line-strong rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h2 className="font-bold text-ink text-sm">{intent.type === 'autotrain' ? 'Colab Auto-RL Training — Approval Required' : 'Simulation Request — Approval Required'}</h2>
              <p className={`text-[10px] font-mono ${CONFIDENCE_COLOR[intent.confidence]}`}>
                {CONFIDENCE_LABEL[intent.confidence]}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-muted hover:text-ink transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto">

          {/* ── Original prompt ─────────────────────────────────────────── */}
          <div className="bg-surface border border-line rounded-xl p-3">
            <div className="text-[10px] text-muted mb-1 uppercase">Your request</div>
            <p className="text-sm text-ink italic">"{originalPrompt}"</p>
          </div>

          {/* ── Interpreted config ──────────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
              Interpreted Configuration — {type === 'autotrain' ? 'Auto-RL Colab Planner' : (type === 'benchmark' ? `${intent.numEpisodes}-Episode Benchmark` : 'Live Simulation')}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <ConfigCard label="Drone Type" value={config.droneType} highlight />
              <ConfigCard label="Mass"        value={`${config.mass} kg`} />
              <ConfigCard label="Prop Ø"      value={`${config.propDiameter}"`} />
              <ConfigCard label="Battery"     value={`${config.batteryVoltage}V`} />
              <ConfigCard label="Arm Length"  value={`${config.armLength}m`} />
            </div>
            {tests.mission && <div className="mt-2 text-xs text-ink">
              Mission: {tests.mission.mode} · target {tests.mission.targetAltitudeM} m · forward {tests.mission.forwardVelocityMps} m/s · duration {tests.mission.durationSeconds} s
            </div>}
            {tests.missionPreset !== 'none' && (
              <div className="mt-2">
                <ConfigCard label="Mission Preset" value={tests.missionPreset} icon={Play} highlight />
              </div>
            )}
            {activeTests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activeTests.map(({ label, Icon }) => (
                  <span key={label} className="flex items-center gap-1 px-2 py-1 bg-canvas border border-line-strong rounded-lg text-[11px] text-ink">
                    <Icon className="w-3 h-3 text-emerald-700" /> {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Suggested clean prompt ──────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
              How Aether interpreted this
            </div>
            <div className="bg-surface border border-line-strong rounded-xl p-3">
              <p className="text-xs text-ink font-mono leading-relaxed">{intent.suggestedPrompt}</p>
            </div>
          </div>

          {/* ── Ambiguities ─────────────────────────────────────────────── */}
          {intent.ambiguities.length > 0 && (
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                Assumptions &amp; Ambiguities
                {hasErrors   && <span className="text-red-700 text-[10px]">({intent.ambiguities.filter(a=>a.level==='error').length} error{intent.ambiguities.filter(a=>a.level==='error').length!==1?'s':''})</span>}
                {hasWarnings && <span className="text-amber-700 text-[10px]">({intent.ambiguities.filter(a=>a.level==='warning').length} warning{intent.ambiguities.filter(a=>a.level==='warning').length!==1?'s':''})</span>}
              </div>
              <div className="flex flex-col gap-2">
                {intent.ambiguities.map((a, i) => <AmbiguityRow key={i} a={a} />)}
              </div>
            </div>
          )}

          {/* ── Edit prompt ─────────────────────────────────────────────── */}
          {isEditing ? (
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                Rewrite your request
              </div>
              <textarea
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                className="w-full bg-surface border border-emerald-500/50 rounded-xl px-3 py-2 text-sm text-ink font-mono resize-none focus:outline-none focus:border-emerald-400"
                rows={3}
                placeholder="e.g. Run 100-episode benchmark with a 7kg bicopter, 18&quot; props, wind enabled, motor-out"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => onEdit(editPrompt)}
                  disabled={!editPrompt.trim()}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-canvas disabled:text-muted text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> Re-parse &amp; Review
                </button>
                <button onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-canvas hover:bg-selected text-ink text-sm rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setEditPrompt(intent.suggestedPrompt); setIsEditing(true); }}
              className="w-full py-2 bg-surface hover:bg-canvas border border-line-strong text-muted hover:text-ink text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Edit &amp; Re-parse
            </button>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-line shrink-0">
          <button onClick={onCancel}
            className="px-4 py-2.5 bg-surface hover:bg-canvas border border-line-strong text-muted rounded-xl text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onApprove(intent)}
            disabled={blockApprove}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2
              ${blockApprove
                ? 'bg-canvas text-muted cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'}`}>
            {blockApprove
              ? <><XCircle className="w-4 h-4" /> Fix errors before running</>
              : <><CheckCircle className="w-4 h-4" /> Approve &amp; {type === 'autotrain' ? 'Download Colab Notebook' : (type === 'benchmark' ? 'Run Benchmark' : 'Start Simulation')}</>}
          </button>
        </div>
      </div>
    </div>
  );
};
