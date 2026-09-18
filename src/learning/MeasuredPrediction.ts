import report from './measured-models.json';
import rl from './rl-summary.json';
import { energyTrainingReport as energy } from './EnergyPrediction';
export { report as measuredTrainingReport, rl as rlTrainingReport };
export function predictMeasured(id:string,input:number,windMps=0) {
  const model=report.supervised.find(m=>m.id===id);
  if(!model)throw new Error('Unknown measured configuration');
  if(!Number.isFinite(input)||!Number.isFinite(windMps)||windMps!==0)throw new Error('Only static bench conditions are supported');
  if(input<model.range[0]||input>model.range[1])throw new Error('Outside measured operating range; extrapolation refused');
  const x=input/model.inputScale;
  const values:Record<string,number>={};
  for(const [target,fit] of Object.entries(model.targets)) {
    if(!fit)continue;
    const c=fit.coefficients;values[target]=c[0]+c[1]*x+c[2]*x*x;
    if(!Number.isFinite(values[target])||values[target]<0)throw new Error('Invalid model prediction');
  }
  return {values,scope:model.scope,independentlyValidated:false,source:model.source};
}
/** Unsupervised support distance, never a confidence probability. */
export function propellerSupport(diameterIn:number,pitchIn:number,rpm:number) {
  if(![diameterIn,pitchIn,rpm].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid propeller point');
  const m=report.unsupervised;
  const x=[diameterIn,pitchIn/diameterIn,rpm/10000].map((v,i)=>(v-m.mean[i])/m.scale[i]);
  const distances=m.centers.map(c=>Math.hypot(...c.map((v,i)=>v-x[i])));
  const distance=Math.min(...distances);
  return {cluster:distances.indexOf(distance),distance,outsideTrainingSupport:distance>m.distanceThreshold};
}
export function learningEvidenceContext():string {
  return `Measured-data training: ${report.measuredRows} rows across one Crazyflie 2.x 2015 bench sweep and four isolated propeller sweeps. ${report.heldOutRows} within-sweep held-out rows; no independent aircraft validation. Thrust/power regression and operating-point K-means trained. Measured gust-endurance samples: ${report.gustEnduranceSamples}. RL: ${rl.trainingEpisodes} synthetic training episodes; simulation gate passed=${rl.passesSimulationGate}; promoted=${rl.promoted}. These models do not change the active simulator physics. Cruise energy research: ${energy.sourceSamples} author-processed samples reduced to ${energy.flightRecords} Matrice 100 flight summaries. Neural backpropagation best epoch ${energy.bestValidationEpoch}; test MAE ${energy.test.maeW.toFixed(2)} W vs ridge ${energy.ridgeBaseline.maeW.toFixed(2)} W. Onboard airflow is not ambient wind; no maximum endurance labels. Research models only, no automatic physics promotion. Aether language-model weights were not fine-tuned. Do not infer battery endurance from shaft power or static PWM curves. Sources: ${report.supervised.map(m=>m.source).join(' ')}`;
}

export function trainingAudit():string {
 return `**Measured-data training status**\n\n- Propulsion: ${report.measuredRows} bench measurements; ${report.heldOutRows} within-sweep holdouts. No independent flight validation.\n- Cruise power: ${energy.sourceSamples.toLocaleString()} author-processed rows from ${energy.flightRecords} Matrice 100 flights; ${energy.splitFlightIds.test.length} whole flights held out for testing.\n- Neural backpropagation: ${energy.epochsRun} epochs, restored validation checkpoint ${energy.bestValidationEpoch}. Mean test error: ${energy.initialUntrainedTest.maeW.toFixed(2)} W before training → ${energy.test.maeW.toFixed(2)} W after. Simpler regression: ${energy.ridgeBaseline.maeW.toFixed(2)} W.\n- Uncertainty: nominal 90% interval covered ${(energy.uncertainty.testCoverage*100).toFixed(1)}% of test flights.\n- RL: ${rl.trainingEpisodes} simulated training episodes; candidate not promoted because it failed the comparison gate.\n\nOnboard airflow is not ambient gust speed. No battery-to-empty gust endurance model or universal aircraft validation exists. Active simulator physics and controller remain unchanged. Aether's language-model weights were not fine-tuned. See Benchmark → Measured-data learning for source links and artifacts.`;
}
