import energy from './energy-model.json';
export { energy as energyTrainingReport };
/** Research estimate conditional on measured cruise summaries from the source setup. */
export function predictCruisePower(setupId:string,features:readonly number[],method:'ridge'|'neural'='ridge') {
 if(setupId!=='matrice-100-author-cruise')throw new Error('No measured model for this aircraft/setup');
 if(features.length!==energy.features.length||!features.every(Number.isFinite))throw new Error('Expected six finite cruise features');
 if(method!=='ridge'&&method!=='neural')throw new Error('Unknown model');
 if(features.some((v,i)=>v<energy.trainingFeatureRanges[i][0]||v>energy.trainingFeatureRanges[i][1]))throw new Error('Outside training range; no extrapolation');
 const z=features.map((v,i)=>(v-energy.featureMean[i])/energy.featureScale[i]);
 const distance=Math.min(...energy.unsupervised.centers.map(c=>Math.hypot(...c.map((v,i)=>v-z[i]))));
 if(distance>energy.unsupervised.supportDistance95thPercentile)throw new Error('Operating point outside learned training support');
 let watts:number;
 if(method==='ridge')watts=energy.ridgeModel.interceptW+z.reduce((sum,v,i)=>sum+v*energy.ridgeModel.coefficients[i],0);
 else {
  const p=energy.weights;
  const hidden=p.b1.map((bias,j)=>Math.tanh(bias+z.reduce((sum,v,i)=>sum+v*p.w1[i][j],0)));
  watts=(p.b2[0]+hidden.reduce((sum,v,j)=>sum+v*p.w2[j][0],0))*energy.targetScaleW+energy.targetMeanW;
 }
 if(!Number.isFinite(watts)||watts<=0)throw new Error('Nonphysical model output');
 return {watts,method,scope:'Author Matrice 100 measured cruise summaries only; not maximum endurance or ambient-gust prediction',independentAircraftValidation:false};
}
