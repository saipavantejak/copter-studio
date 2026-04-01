import { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, FileJson, FileCode, Cpu, AlertTriangle } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { RLAgent } from './RLAgent';

interface ModelLoaderProps {
  agentRef:       React.MutableRefObject<RLAgent>;
  onModelLoaded:  () => void;
  onModelError?:  (error: string) => void;
  droneType?:     'quadcopter' | 'bicopter' | 'hexacopter';
  /** True when a benchmark is actively running — prevents backend mutation */
  benchmarkActive?: boolean;
}

// ── Backend delta measurement ─────────────────────────────────────────────────
// Runs N random states through the model on WebGL then CPU to quantify
// any numerical difference. Called once after model load.
//
// Guard: only runs when benchmarkActive is false, so we never flip the
// backend underneath a running worker (worker uses its own tf instance
// but the main-thread backend switch could cause subtle state issues).

interface DeltaResult {
  maxDelta:  number;
  meanDelta: number;
  skipped:   boolean;
  skipReason?: string;
}

async function measureBackendDelta(
  model:   tf.LayersModel,
  stateDim = 12,
  n        = 50
): Promise<DeltaResult> {
  const currentBackend = tf.getBackend();

  // If already on CPU (no WebGL) there's nothing to compare
  if (currentBackend === 'cpu' || currentBackend === 'wasm') {
    return { maxDelta: 0, meanDelta: 0, skipped: true,
      skipReason: `Only ${currentBackend} available — no cross-backend delta to measure.` };
  }

  const states = Array.from({ length: n }, () =>
    Array.from({ length: stateDim }, () => (Math.random() - 0.5) * 2)
  );

  // WebGL outputs (current backend)
  const webglOutputs: number[] = tf.tidy(() => {
    const t   = tf.tensor2d(states);
    const out = model.predict(t) as tf.Tensor;
    return Array.from(out.dataSync());
  });

  // Switch to CPU
  await tf.setBackend('cpu');
  await tf.ready();

  const cpuOutputs: number[] = tf.tidy(() => {
    const t   = tf.tensor2d(states);
    const out = model.predict(t) as tf.Tensor;
    return Array.from(out.dataSync());
  });

  // Restore original backend
  await tf.setBackend(currentBackend);
  await tf.ready();

  const deltas   = webglOutputs.map((v, i) => Math.abs(v - cpuOutputs[i]));
  const maxDelta  = Math.max(...deltas);
  const meanDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  return { maxDelta, meanDelta, skipped: false };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ModelLoader = ({
  agentRef, onModelLoaded, onModelError,
  droneType = 'bicopter', benchmarkActive = false,
}: ModelLoaderProps) => {
  const [jsonFile,     setJsonFile]     = useState<File | null>(null);
  const [weightsFile,  setWeightsFile]  = useState<File | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [status,       setStatus]       = useState<'idle' | 'loading' | 'measuring' | 'success' | 'error'>('idle');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [deltaResult,  setDeltaResult]  = useState<DeltaResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Threshold: 0.005 = 0.5% control command error — detectable on a drone
  const DELTA_WARN_THRESHOLD = 0.005;

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const processFiles = (files: FileList | File[]) => {
    let newJson: File | null = null;
    let newWeights: File | null = null;
    Array.from(files).forEach(file => {
      if (file.name.endsWith('.json')) newJson    = file;
      else if (file.name.endsWith('.bin')) newWeights = file;
    });
    if (newJson)    setJsonFile(newJson);
    if (newWeights) setWeightsFile(newWeights);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) processFiles(e.target.files);
  };

  const handleLoadModel = async () => {
    if (!jsonFile || !weightsFile) return;
    setStatus('loading');
    setErrorMsg('');
    setDeltaResult(null);

    try {
      await agentRef.current.loadUserModel(jsonFile, weightsFile, droneType);

      // Run backend delta check — but only when no benchmark is running.
      // If benchmarkActive, skip the check and show the CPU badge unconditionally
      // so the user knows results may diverge.
      setStatus('measuring');
      if (benchmarkActive) {
        setDeltaResult({ maxDelta: 0, meanDelta: 0, skipped: true,
          skipReason: 'Benchmark active — backend check deferred to avoid state mutation.' });
      } else {
        try {
          // Access the internal model via the serialization surface
          const serialized = await agentRef.current.serializeForWorker(droneType);
          if (serialized) {
            const tempModel = await tf.loadLayersModel(
              tf.io.fromMemory(serialized.topology, serialized.weightSpecs, serialized.weightData)
            );
            const result = await measureBackendDelta(tempModel);
            tempModel.dispose();
            setDeltaResult(result);
          } else {
            setDeltaResult({ maxDelta: 0, meanDelta: 0, skipped: true,
              skipReason: 'Could not access model for delta measurement.' });
          }
        } catch (deltaErr) {
          // Delta check failure is non-fatal — model is still usable
          setDeltaResult({ maxDelta: 0, meanDelta: 0, skipped: true,
            skipReason: 'Delta measurement failed (non-fatal).' });
        }
      }

      setStatus('success');
      onModelLoaded();
    } catch (error: any) {
      setStatus('error');
      const msg = error.message || 'Failed to load model.';
      setErrorMsg(msg);
      onModelError?.(msg);
    }
  };

  const handleLoadDemo = async () => {
    setStatus('loading');
    setErrorMsg('');
    setDeltaResult(null);

    try {
      // Fetch official 5,252-parameter quadcopter model from public assets
      const jResp = await fetch('/demo_model/model.json');
      const wResp = await fetch('/demo_model/model.weights.bin');
      
      if (!jResp.ok || !wResp.ok) throw new Error('Demo model files not found in /demo_model/');

      const jBlob = await jResp.blob();
      const wBlob = await wResp.blob();

      const jFile = new File([jBlob], 'model.json', { type: 'application/json' });
      const wFile = new File([wBlob], 'model.weights.bin', { type: 'application/octet-stream' });

      await agentRef.current.loadUserModel(jFile, wFile, droneType);
      
      setStatus('success');
      onModelLoaded();
    } catch (error: any) {
      setStatus('error');
      const msg = error.message || 'Failed to load demo model.';
      setErrorMsg(msg);
      onModelError?.(msg);
    }
  };

  const deltaWarn = deltaResult && !deltaResult.skipped && deltaResult.maxDelta > DELTA_WARN_THRESHOLD;
  const deltaOk   = deltaResult && !deltaResult.skipped && deltaResult.maxDelta <= DELTA_WARN_THRESHOLD;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-emerald-400" />
          Load RL Model
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Upload TensorFlow.js model files to override the heuristic PD controller.
        </p>
        <div className="mt-2 text-[10px] text-zinc-600 bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono space-y-0.5">
          <div>Input: <span className="text-zinc-400">12-DOF state [x, y, z, vx, vy, vz, roll, pitch, yaw, p, q, r]</span></div>
          <div>Output: <span className="text-zinc-400">{droneType === 'bicopter' ? '2 dims' : droneType === 'quadcopter' ? '4 dims' : '6 dims'} (motor commands for {droneType})</span></div>
          <div>Format: <span className="text-zinc-400">model.json + model.weights.bin (TF.js LayersModel)</span></div>
        </div>
      </div>

      <div
        className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 transition-colors ${
          isDragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-950/50'
        }`}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      >
        <UploadCloud className={`w-10 h-10 mb-3 ${isDragging ? 'text-emerald-400' : 'text-zinc-500'}`} />
        <p className="text-sm text-zinc-300 text-center mb-1">
          Drag & drop <span className="font-mono text-emerald-400">model.json</span> and{' '}
          <span className="font-mono text-emerald-400">model.weights.bin</span>
        </p>
        <p className="text-xs text-zinc-500 mb-4">or click to browse</p>
        <input type="file" multiple accept=".json,.bin" className="hidden"
          ref={fileInputRef} onChange={handleFileSelect} />
        <button onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors">
          Select Files
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {[
          { file: jsonFile,    Icon: FileJson, placeholder: 'model.json'        },
          { file: weightsFile, Icon: FileCode, placeholder: 'model.weights.bin' },
        ].map(({ file, Icon, placeholder }) => (
          <div key={placeholder}
            className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${file ? 'text-emerald-400' : 'text-zinc-600'}`} />
              <span className={`text-sm font-mono ${file ? 'text-zinc-200' : 'text-zinc-600'}`}>
                {file ? file.name : placeholder}
              </span>
            </div>
            {file && <CheckCircle className="w-4 h-4 text-emerald-500" />}
          </div>
        ))}
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{errorMsg}</p>
        </div>
      )}

      {/* Success + delta result */}
      {status === 'success' && (
        <div className="mt-4 space-y-2">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-200">Model loaded and validated.</p>
          </div>

          {/* Backend delta badge */}
          {deltaResult && (
            <div className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
              deltaResult.skipped
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : deltaOk
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-orange-500/10 border-orange-500/20 text-orange-300'
            }`}>
              {deltaResult.skipped
                ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                : deltaOk
                  ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              }
              <div>
                {deltaResult.skipped ? (
                  <>
                    <span className="font-bold flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> CPU backend — unverified
                    </span>
                    <p className="text-[10px] mt-0.5 opacity-75">{deltaResult.skipReason}</p>
                    <p className="text-[10px] mt-0.5 opacity-75">
                      Benchmark results are valid but may differ from live WebGL execution. Reload without an active benchmark to measure the exact delta.
                    </p>
                  </>
                ) : deltaOk ? (
                  <>
                    <span className="font-bold">CPU/WebGL delta verified: {deltaResult.maxDelta.toExponential(2)}</span>
                    <p className="text-[10px] mt-0.5 opacity-75">
                      Max output deviation below threshold ({DELTA_WARN_THRESHOLD}). Benchmark results are directly comparable to live simulation.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="font-bold">
                      ⚠ CPU/WebGL delta: {deltaResult.maxDelta.toExponential(2)} (above {DELTA_WARN_THRESHOLD} threshold)
                    </span>
                    <p className="text-[10px] mt-0.5 opacity-75">
                      Worker uses CPU inference — results may not be directly comparable to live WebGL execution. Consider this when interpreting benchmark vs live performance gaps.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleLoadModel}
          disabled={!jsonFile || !weightsFile || status === 'loading' || status === 'measuring'}
          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Validating...</>
          ) : status === 'measuring' ? (
            <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> ...</>
          ) : (
            'Load Files'
          )}
        </button>

        <button
          onClick={handleLoadDemo}
          disabled={status === 'loading' || status === 'measuring'}
          className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          title="Load Official Demo Model (88% Crash Rate)"
        >
          {status === 'loading' ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Cpu className="w-4 h-4" />}
          Demo Model
        </button>
      </div>
    </div>
  );
};
