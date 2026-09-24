import { useState } from 'react';
import { energyTrainingReport as energy } from './EnergyPrediction';
import { measuredTrainingReport as report,rlTrainingReport as rl,predictMeasured } from './MeasuredPrediction';
export function LearningPanel(){
 const [id,setId]=useState(report.supervised[0].id);
 const [value,setValue]=useState('50');
 const model=report.supervised.find(m=>m.id===id)!;
 let prediction:ReturnType<typeof predictMeasured>|undefined,error='';
 try{if(!value.trim())throw new Error('Enter a measured operating point');prediction=predictMeasured(id,Number(value));}catch(e){error=(e as Error).message;}
 return <details className="rounded-xl border border-line-strong bg-surface p-4">
  <summary className="cursor-pointer font-semibold">Measured-data learning · experimental</summary>
  <p className="text-sm text-ink my-3">80 measured points: one Crazyflie bench sweep and four propeller sweeps. Supervised regression and unsupervised operating-point clustering trained. 20 points withheld for interpolation checks; independent flight validation pending.</p>
  <p className="text-sm text-amber-700 mb-3">No measured gust-endurance data. Predictions apply only to the selected static test setup. The active simulator retains its existing physics and controller.</p>
  <div className="flex flex-wrap gap-3">
   <label className="text-sm">Measured setup <select aria-label="Measured setup" value={id} onChange={e=>{setId(e.target.value);const m=report.supervised.find(x=>x.id===e.target.value)!;setValue(String((m.range[0]+m.range[1])/2));}} className="block bg-canvas p-2 max-w-full">{report.supervised.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
   <label className="text-sm">{model.input} ({model.range.join('–')})<input aria-label="Measured operating point" type="number" value={value} onChange={e=>setValue(e.target.value)} className="block bg-canvas p-2 w-36" /></label>
  </div>
  <p className="text-xs text-muted mt-2">{model.scope} <a href={model.source} target="_blank" rel="noreferrer" className="underline">Measurement source</a></p>
  <div role="status" className="my-3 text-sm">{error||Object.entries(prediction?.values??{}).map(([k,v])=>`${k}: ${v.toFixed(5)}`).join(' · ')}</div>
  <p className="text-xs text-muted">Ct and Cp are dimensionless thrust and shaft-power coefficients. Displayed errors below are held-out residuals, not confidence intervals.</p>
  <ul className="text-xs mt-2">{Object.entries(model.targets).filter(([,fit])=>!!fit).map(([name,fit])=><li key={name}>{name}: mean absolute error {fit!.heldOut.mae.toPrecision(3)} in the target’s units (4 held-out points).</li>)}</ul>
  <div className="mt-4 border-t border-line-strong pt-3">
   <h3 className="font-semibold">Matrice 100 cruise power research</h3>
   <p className="text-sm mt-2">{energy.sourceSamples.toLocaleString()} author-processed measurements → {energy.flightRecords} flight summaries. Separate whole flights for training, early stopping, interval calibration and testing.</p>
   <p className="text-sm mt-2">Backpropagation: {energy.epochsRun} epochs run; restored epoch {energy.bestValidationEpoch}. Held-out mean power error: untrained {energy.initialUntrainedTest.maeW.toFixed(1)} W → neural {energy.test.maeW.toFixed(1)} W. Simpler regression: {energy.ridgeBaseline.maeW.toFixed(1)} W.</p>
   <p className="text-xs text-amber-700 mt-2">Neural model did not beat the simpler regression. Nominal 90% interval covered {(energy.uncertainty.testCoverage*100).toFixed(1)}% of {energy.splitFlightIds.test.length} test flights. Onboard airflow is not ambient gust speed; cruise duration is not maximum endurance.</p>
   <a href="/learning/energy-model.json" download className="inline-block underline text-sm mt-2">Download power models, error analysis and training history</a>
  </div>
  <p className="text-sm mt-3">Reinforcement learning: {rl.trainingEpisodes} training episodes; 100 held-out scenarios, each tested with both controllers. Promotion: {rl.promoted?'enabled':'blocked'}. {rl.promotionReason}.</p>
  <div className="overflow-auto"><table className="text-xs w-full mt-2"><thead><tr><th className="text-left">Scenario</th><th>Baseline successes</th><th>Learned successes</th></tr></thead><tbody>{rl.results.map(r=><tr key={String(r.wind)}><td>{r.wind?'Synthetic wind':'Calm hover'}</td><td className="text-center">{r.baseline.successes}/{r.baseline.episodes}</td><td className="text-center">{r.policy.successes}/{r.policy.episodes}</td></tr>)}</tbody></table></div>
  <a href="/learning/residual-policy.json" download className="inline-block underline text-sm mt-3">Download experimental policy and evaluation records</a>
 </details>;
}
