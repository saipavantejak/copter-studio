import { SeededRandom } from '../../../src/SeededRandom';
import { wilson } from '../residual-experiment';
import { STUDY } from './protocol';
import type { Pair, Episode } from './experiment';
export const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
export function aggregate(rows:Episode[]){
 const successes=rows.filter(r=>r.successful).length,failures=rows.filter(r=>r.failed).length;
 const outcomeCounts:Record<string,number>={};for(const r of rows)outcomeCounts[r.outcome]=(outcomeCounts[r.outcome]??0)+1;
 return {episodes:rows.length,successes,failures,nonSuccesses:rows.length-successes,meanReward:mean(rows.map(r=>r.reward)),meanAltitudeErrorM:mean(rows.map(r=>r.meanAltitudeErrorM)),
 meanSteps:mean(rows.map(r=>r.steps)),successRate95CI:wilson(successes,rows.length),failureRate95CI:wilson(failures,rows.length),outcomeCounts};
}
export type Metric='reward'|'meanAltitudeErrorM'|'successful'|'failed';
export function crossedCI(pairs:Pair[],wind:boolean,key:Metric,seed:number,adjustedAlpha:number){
 const rows=pairs.filter(r=>r.baseline.wind===wind),runs=[...new Set(rows.map(r=>r.explorationSeed))],seeds=[...new Set(rows.map(r=>r.baseline.seed))];
 if(runs.length!==3)throw new Error('Exactly three predeclared runs required');
 const byKey=new Map(rows.map(r=>[`${r.explorationSeed}:${r.baseline.seed}`,r]));
 const matrix=runs.map(id=>Float64Array.from(seeds.map(s=>{const row=byKey.get(`${id}:${s}`)!;return Number(row.policy[key])-Number(row.baseline[key]);})));
 const estimate=mean(matrix.map(row=>mean(Array.from(row)))),rng=new SeededRandom(seed),samples:number[]=[];
 const n=seeds.length;
 for(let b=0;b<STUDY.bootstrapReplicates;b++){
  const r0=Math.floor(rng.next()*3),r1=Math.floor(rng.next()*3),r2=Math.floor(rng.next()*3);let total=0;
  for(let i=0;i<n;i++){const s=Math.floor(rng.next()*n);total+=matrix[r0][s]+matrix[r1][s]+matrix[r2][s];}
  samples.push(total/(3*n));
 }
 samples.sort((a,b)=>a-b);
 const quantile=(p:number)=>{const x=(samples.length-1)*p,lo=Math.floor(x),t=x-lo;return samples[lo]*(1-t)+samples[Math.min(lo+1,samples.length-1)]*t;};
 return {estimate,ci95:[quantile(.025),quantile(.975)],adjustedCI:[quantile(adjustedAlpha/2),quantile(1-adjustedAlpha/2)],
 adjustedConfidence:1-adjustedAlpha,bootstrapSeed:seed,bootstrapReplicates:STUDY.bootstrapReplicates,trainingRunMeans:matrix.map(row=>mean(Array.from(row)))};
}
export function originalGate(results:Array<{baseline:ReturnType<typeof aggregate>;policy:ReturnType<typeof aggregate>}>){
 return results.length===2&&results.every(r=>r.policy.successes>=r.baseline.successes&&r.policy.failures<=r.baseline.failures&&r.policy.meanReward>=r.baseline.meanReward)&&results.some(r=>r.policy.meanReward>r.baseline.meanReward);
}
export function summarize(pairs:Pair[],candidateIndex:number,includeWind:boolean,final=false){
 const ids=[...new Set(pairs.map(p=>p.explorationSeed))];
 const runResults=ids.map(explorationSeed=>{const results=(includeWind?[false,true]:[false]).map(wind=>{const eps=pairs.filter(e=>e.explorationSeed===explorationSeed&&e.baseline.wind===wind);return {wind,baseline:aggregate(eps.map(e=>e.baseline)),policy:aggregate(eps.map(e=>e.policy))};});return {explorationSeed,results,passesOriginalGate:originalGate(results)};});
 const results=(includeWind?[false,true]:[false]).map(wind=>{
  const eps=pairs.filter(e=>e.baseline.wind===wind),baseline=aggregate(eps.filter(e=>e.explorationSeed===ids[0]).map(e=>e.baseline)),all=aggregate(eps.map(e=>e.policy));
  const policy={...all,successRate95CI:undefined,failureRate95CI:undefined,intervalNote:'Shared episode seeds and three training runs; pooled episodes are not IID. Per-run Wilson intervals and paired crossed bootstrap reported separately.'};
  const adjustedAlpha=final?.05/2:.05/(6*2);
  const metrics:Metric[]=['reward','meanAltitudeErrorM','successful','failed'];
  const comparisons=Object.fromEntries(metrics.map((key,metricIndex)=>[key,crossedCI(pairs,wind,key,900001+100*candidateIndex+10*Number(wind)+metricIndex,key==='reward'?adjustedAlpha:.05)]));
  return {wind,baseline,policy,comparisons};
 });
 const passesOriginalGate=includeWind&&runResults.every(r=>r.passesOriginalGate);
 const statisticalSupport=includeWind&&results.every(r=>r.comparisons.reward.adjustedCI[0]>=0)&&results.some(r=>r.comparisons.reward.adjustedCI[0]>0);
 return {results,runResults,passesOriginalGate,statisticalSupport,eligible:passesOriginalGate&&statisticalSupport,selectionScore:Math.min(...results.map(r=>r.comparisons.reward.estimate))};
}
