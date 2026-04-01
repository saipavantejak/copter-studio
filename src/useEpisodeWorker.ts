// src/useEpisodeWorker.ts — v11
// Exposes activeController so the Benchmark tab can show whether the run
// is using the RL Policy or Heuristic PD.

import { useRef, useState, useCallback, useEffect } from 'react';
import type { EpisodeBenchmarkConfig, EpisodeResult, BatchStats } from './EpisodeRunner';

export interface UseEpisodeWorkerReturn {
  runWorker:        (cfg: EpisodeBenchmarkConfig) => void;
  stopWorker:       () => void;
  running:          boolean;
  progress:         number;
  total:            number;
  results:          EpisodeResult[];
  stats:            BatchStats | null;
  /** Which controller is running — updated as soon as the worker reports it */
  activeController: 'RL Policy' | 'Heuristic PD' | null;
}

export function useEpisodeWorker(): UseEpisodeWorkerReturn {
  const workerRef = useRef<Worker | null>(null);

  const [running,          setRunning]          = useState(false);
  const [progress,         setProgress]         = useState(0);
  const [total,            setTotal]            = useState(0);
  const [results,          setResults]          = useState<EpisodeResult[]>([]);
  const [stats,            setStats]            = useState<BatchStats | null>(null);
  const [activeController, setActiveController] = useState<'RL Policy' | 'Heuristic PD' | null>(null);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  const ensureWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('./workers/episodeWorker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return workerRef.current;
  }, []);

  const stopWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'abort' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setRunning(false);
  }, []);

  const runWorker = useCallback((cfg: EpisodeBenchmarkConfig) => {
    stopWorker();

    setRunning(true);
    setProgress(0);
    setTotal(cfg.numEpisodes);
    setResults([]);
    setStats(null);
    setActiveController(null);

    const worker = ensureWorker();

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case 'controller':
          // Normalise — strip any suffix like "(model load failed)"
          setActiveController(
            msg.label.startsWith('RL') ? 'RL Policy' : 'Heuristic PD'
          );
          if (msg.warning) console.warn('[episodeWorker] Model load warning:', msg.warning);
          break;
        case 'progress':
          setProgress(msg.done);
          setResults(prev => [...prev, msg.result]);
          break;
        case 'done':
          setStats(msg.stats);
          setRunning(false);
          break;
        case 'aborted':
          setRunning(false);
          break;
        case 'error':
          console.error('[useEpisodeWorker]', msg.message);
          setRunning(false);
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('[useEpisodeWorker] Uncaught worker error:', err.message);
      setRunning(false);
    };

    // Transfer the weight ArrayBuffer (zero-copy) when an RL model is present.
    // The cfg object is structured-cloned; only the ArrayBuffer is transferred.
    if (cfg.serializedModel?.weightData instanceof ArrayBuffer) {
      worker.postMessage({ type: 'run', cfg }, [cfg.serializedModel.weightData]);
    } else {
      worker.postMessage({ type: 'run', cfg });
    }
  }, [ensureWorker, stopWorker]);

  return { runWorker, stopWorker, running, progress, total, results, stats, activeController };
}
