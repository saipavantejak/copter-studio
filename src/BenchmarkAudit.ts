import type { BatchStats } from './EpisodeRunner';

/** Numerical assessment is executable code, never model-generated statistics. */
export function benchmarkAudit(s: BatchStats): string {
  const percent=(v:number)=>(v*100).toFixed(1)+'%';
  const sec=s.efficiencySampleCount && Number.isFinite(s.meanSEC) && s.meanSEC!=null ? s.meanSEC.toFixed(5)+' J/(g payload·km)' : 'N/A — no applicable successful samples';
  const sd=s.efficiencySampleCount>=2 && Number.isFinite(s.stdSEC) && s.stdSEC!=null ? s.stdSEC.toFixed(5) : 'N/A — fewer than two applicable samples';
  return `**Recorded benchmark assessment**\n\n`+
    `- Completed episodes: ${s.numEpisodes}; mission success: ${percent(s.successRate??0)}; crashes: ${percent(s.crashRate)}. Duration: ${s.durationSeconds??'unknown'} s.\n`+
    `- Mean altitude error: ${s.meanAltError.toFixed(5)} m. Conditional SEC: ${sec}; SEC standard deviation: ${sd}.\n`+
    `- Legacy SPT mean: ${s.meanSPT.toFixed(5)}; sample standard deviation: ${s.stdSPT.toFixed(5)}. SPT is dimensionless and has no validated quality threshold.\n\n`+
    (s.successRate95CI ? `95% Wilson interval for simulated success: **${s.successRate95CI.map(percent).join('–')}**. An upper endpoint of 100% does not establish certainty.\n\n` : 'No success interval is available.\n\n')+
    `These observations apply only to the recorded configuration and conditions. They do not establish real-flight reliability or explain a failure's cause. Missing SEC data cannot support conclusions about energy consistency or SPT.\n\n`+
    `Next validation step: compare the recorded dynamics and energy against independent measurements; test additional conditions separately.`;
}
