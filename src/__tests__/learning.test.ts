import { describe,it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { measuredTrainingReport as report,rlTrainingReport as rl,predictMeasured,propellerSupport,learningEvidenceContext } from '../learning/MeasuredPrediction';
import { stateIndex,greedyAction,applyResidual } from '../learning/ResidualPolicy';
const data=JSON.parse(readFileSync('data/training/reference-measurements.json','utf8'));
describe('Measured learning evidence boundaries',()=>{
 it('pins dataset and keeps every held-out row out of training',()=>{
  expect(createHash('sha256').update(readFileSync('data/training/reference-measurements.json')).digest('hex')).toBe(report.datasetSha256);
  expect(report.trainIndices.filter(i=>report.testIndices.includes(i))).toEqual([]);
  expect(new Set([...report.trainIndices,...report.testIndices]).size).toBe(16);
  expect(report.independentValidation).toBe(false);
 });
 it('recomputes held-out errors from source measurements, not report claims',()=>{
  for(const model of report.supervised){
   const bench=model.id==='bitcraze-2015-bench';
   const rows=bench?data.bitcraze.rows:data.propellers.find(p=>p.id===model.id).rows;
   for(const [target,fit] of Object.entries(model.targets)){
    if(!fit)continue;
    const errors=report.testIndices.map(i=>{
     const row=rows[i];const truth=bench?(target==='thrustN'?row[1]*.00981:row[0]*row[2]):row[target==='Ct'?1:2];
     return Math.abs(predictMeasured(model.id,row[bench?3:0]).values[target]-truth);
    });
    expect(errors.reduce((a,b)=>a+b,0)/errors.length).toBeCloseTo(fit.heldOut.mae,12);
   }
  }
 });
 it('rejects another aircraft, gust conditions, NaN and extrapolation',()=>{
  for(const v of [-1,100,NaN,Infinity])expect(()=>predictMeasured('bitcraze-2015-bench',v)).toThrow();
  expect(()=>predictMeasured('dji-mini',50)).toThrow();
  expect(()=>predictMeasured('bitcraze-2015-bench',50,2)).toThrow();
  expect(()=>predictMeasured('bitcraze-2015-bench',50,NaN)).toThrow();
 });
 it('flags remote operating points without calling the distance confidence',()=>{
  expect(propellerSupport(33,12,30000).outsideTrainingSupport).toBe(true);
  expect(()=>propellerSupport(0,1,10)).toThrow();
  expect(report.unsupervised.trainingRows).toBe(48);
 });
 it('keeps predictions physical within each trained interval',()=>{
  for(const model of report.supervised)for(let i=0;i<=100;i++){
   const p=predictMeasured(model.id,model.range[0]+i/100*(model.range[1]-model.range[0]));
   expect(Object.values(p.values).every(v=>Number.isFinite(v)&&v>=0)).toBe(true);
  }
 });
 it('does not promote failed RL or claim Aether fine-tuning',()=>{
  expect(rl.promoted).toBe(false);expect(rl.physicalValidation).toBe(false);
  expect(rl.evaluationSeedRanges.every(([start])=>start>rl.trainSeedRange[1])).toBe(true);
  const policy=JSON.parse(readFileSync('public/learning/residual-policy.json','utf8'));
  expect(policy.visits.flat().reduce((a,b)=>a+b,0)).toBeGreaterThan(0);
  expect(policy.q.flat().some(v=>v!==0)).toBe(true);
  for(const result of policy.results)for(const mode of ['baseline','policy']){
   const eps=policy.evaluations.filter(e=>e[mode].wind===result.wind).map(e=>e[mode]);
   expect(eps.filter(e=>e.successful).length).toBe(result[mode].successes);
   expect(eps.length).toBe(50);
  }
  expect(learningEvidenceContext()).toContain('weights were not fine-tuned');
 });
 it('bounds residual actions and falls back to no correction on unvisited states',()=>{
  expect(greedyAction([0,0,0,0,0])).toBe(0);
  expect(applyResidual([1,-1,0,0,0,0],4)).toEqual([1,-.96,.04,.04,0,0]);
  expect(()=>stateIndex(NaN,0)).toThrow();
  expect(()=>applyResidual([0,0,0,0],9)).toThrow();
 });
});

import { energyTrainingReport as energy,predictCruisePower } from '../learning/EnergyPrediction';
describe('Neural power experiment integrity',()=>{
 it('holds out whole flights and checks backpropagation numerically',()=>{
  const groups=Object.values(energy.splitFlightIds);const ids=groups.flat();
  expect(new Set(ids).size).toBe(ids.length);expect(ids.length).toBe(187);
  expect(energy.gradientCheckMaxAbsoluteError).toBeLessThan(1e-6);
  expect(energy.weightChangeL2).toBeGreaterThan(0);
  expect(energy.bestValidationEpoch).toBeLessThanOrEqual(energy.epochsRun);
 });
 it('reproduces exported neural predictions in TypeScript and enforces domain limits',()=>{
  const summaries=JSON.parse(readFileSync('data/training/energy-flight-summaries.json','utf8'));
  let supported=0;
  for(const row of energy.testPredictions){
   const f=summaries.records.find(r=>r.flightId===row.flightId).features;
   const outOfRange=f.some((v,i)=>v<energy.trainingFeatureRanges[i][0]||v>energy.trainingFeatureRanges[i][1]);
   if(row.outsideTrainingSupport||outOfRange){expect(()=>predictCruisePower('matrice-100-author-cruise',f,'neural')).toThrow();continue;}
   supported++;
   expect(predictCruisePower('matrice-100-author-cruise',f,'neural').watts).toBeCloseTo(row.predictedW,8);
   expect(predictCruisePower('matrice-100-author-cruise',f).watts).toBeCloseTo(row.baselineW,8);
  }
  expect(supported).toBeGreaterThan(0);
  expect(()=>predictCruisePower('dji-mini',energy.featureMean)).toThrow();
  expect(()=>predictCruisePower('matrice-100-author-cruise',[NaN,1,1,1,1,1])).toThrow();
 });
 it('recomputes reported error and interval coverage including poor outcomes',()=>{
  const rows=energy.testPredictions;
  expect(rows.reduce((s,r)=>s+Math.abs(r.predictedW-r.observedW),0)/rows.length).toBeCloseTo(energy.test.maeW,10);
  expect(rows.filter(r=>Math.abs(r.predictedW-r.observedW)<=energy.uncertainty.absoluteRadiusW).length/rows.length).toBe(energy.uncertainty.testCoverage);
  expect(energy.promoted).toBe(false);
 });
});
