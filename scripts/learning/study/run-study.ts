import {readTuningInput,selectValidation,type ValidationInput,type ValidationCandidate} from './integrity';
import { readFileSync,writeFileSync,readdirSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { STUDY_WIND } from '../../../src/physics/studyWind';
import { STUDY,CANDIDATES,REFERENCE } from './protocol';
import { episode,train,evaluate,restore,config,type Run } from './experiment';
import { aggregate,summarize } from './statistics';
const args=process.argv.slice(2),stage=args.find(a=>a.startsWith('--stage='))?.slice(8);
if(!['qualify','validation','select','final'].includes(stage??''))throw new Error('Use --stage=qualify|validation|select|final');
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const paths=['package-lock.json',STUDY.planPath,'reports/study/wind-calibration.md',
 ...readdirSync('src',{recursive:true}).map(String).filter(p=>p.endsWith('.ts')&&!p.includes('__tests__')).map(p=>'src/'+p),
 ...readdirSync('scripts/learning/study').filter(p=>p.endsWith('.ts')).map(p=>'scripts/learning/study/'+p)].sort();
const sourceHashes=Object.fromEntries(paths.map(p=>[p,sha(readFileSync(p))]));
const provenance={command:`node --import tsx scripts/learning/study/run-study.ts --stage=${stage}`,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 planCommit:STUDY.planCommit,calibrationCommit:STUDY.calibrationCommit,planSha256:sha(readFileSync(STUDY.planPath)),sourceHashes,node:process.version};
// Every experiment must execute committed source. Output/document-only changes are allowed.
for(const path of paths){const committed=execFileSync('git',['show',`HEAD:${path}`]);if(sha(committed)!==sourceHashes[path])throw new Error(`Uncommitted source: ${path}`);}
const write=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const load=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const sameSources=(report:any)=>{if(JSON.stringify(report.provenance.sourceHashes)!==JSON.stringify(sourceHashes))throw new Error('Source changed between study stages');};
const finalMarker='reports/study/final-attempt.json';
if(stage!=='final'&&existsSync(finalMarker))throw new Error('Final test consumed; no further study stages allowed');
if(stage==='qualify'){
 if(existsSync('reports/study/qualification.json'))throw new Error('Qualification already consumed; no severity iteration allowed');
 const episodes=Array.from({length:STUDY.qualification[1]-STUDY.qualification[0]+1},(_,i)=>episode(STUDY.qualification[0]+i,true,'baseline'));
 const result=aggregate(episodes),finite=episodes.every(r=>[r.reward,r.meanAltitudeErrorM,r.energyJ].every(Number.isFinite));
 const accepted=finite&&result.successes/result.episodes>=STUDY.qualificationMinSuccess&&result.failures/result.episodes<=STUDY.qualificationMaxEngineFailure;
 write('reports/study/qualification.json',{physicalValidation:false,provenance,windModel:STUDY_WIND,seeds:STUDY.qualification,result,accepted,episodes});
 console.log(JSON.stringify({stage,result,accepted}));
}else if(stage==='validation'){
 if(existsSync('reports/study/validation.json'))throw new Error('Validation already executed; no unregistered candidate iteration');
 const qualification=readTuningInput('reports/study/qualification.json') as ReturnType<typeof load>;sameSources(qualification);const includeWind=qualification.accepted;
 const candidates=[];
 for(const [index,candidate] of CANDIDATES.entries()){
  console.log(`Training registered candidate ${candidate.id}`);
  const runs=STUDY.training.map(r=>train(candidate,r.explorationSeed,r.startSeed));
  const evaluations=evaluate(candidate,runs,STUDY.validation,includeWind),summary=summarize(evaluations,index,includeWind);
  candidates.push({candidate,index,runs,evaluations,...summary});
  console.log(JSON.stringify({candidate:candidate.id,results:summary.results,eligible:summary.eligible}));
 }
 const referenceRuns=STUDY.training.map(r=>train(REFERENCE,r.explorationSeed,r.startSeed));
 const referenceEvaluations=evaluate(REFERENCE,referenceRuns,STUDY.validation,includeWind);
 // Reference is descriptive only; not a seventh candidate or candidate-selection option.
 const reference={candidate:REFERENCE,runs:referenceRuns,evaluations:referenceEvaluations,
  runResults:STUDY.training.map(r=>({explorationSeed:r.explorationSeed,results:(includeWind?[false,true]:[false]).map(wind=>{
   const eps=referenceEvaluations.filter(e=>e.explorationSeed===r.explorationSeed&&e.baseline.wind===wind);return {wind,baseline:aggregate(eps.map(e=>e.baseline)),policy:aggregate(eps.map(e=>e.policy))};})}))};
 write('reports/study/validation.json',{schemaVersion:1,physicalValidation:false,provenance,protocol:STUDY,includeWind,candidates,reference});
}else if(stage==='select'){
 if(existsSync('reports/study/selection.json'))throw new Error('Selection already frozen');
 const validation=readTuningInput('reports/study/validation.json') as ValidationInput;sameSources(validation);
 const eligible=validation.candidates.filter(c=>c.eligible),pool=eligible.length?eligible:validation.candidates;
 // Stable sort retains preregistered listed order on exact ties.
 const selected=selectValidation(validation);
 write('reports/study/selection.json',{provenance,validationSha256:sha(readFileSync('reports/study/validation.json')),
 selectedId:selected.candidate.id,eligibleIds:eligible.map(c=>c.candidate.id),diagnosticOnly:eligible.length===0,
 selectionScore:selected.selectionScore,includeWind:validation.includeWind,rule:STUDY.selection});
 console.log(JSON.stringify({selectedId:selected.candidate.id,eligibleIds:eligible.map(c=>c.candidate.id),diagnosticOnly:eligible.length===0}));
}else{
 if(existsSync(finalMarker))throw new Error('Final test already attempted; no rerun or iteration permitted by this study');
 const selection=load('reports/study/selection.json'),validation=load('reports/study/validation.json') as ValidationInput;sameSources(selection);sameSources(validation);
 const committed=execFileSync('git',['show','HEAD:reports/study/selection.json']);if(sha(committed)!==sha(readFileSync('reports/study/selection.json')))throw new Error('Selection must be committed before test');
 if(selection.validationSha256!==sha(readFileSync('reports/study/validation.json')))throw new Error('Validation changed after selection');
 const selected=validation.candidates.find(c=>c.candidate.id===selection.selectedId);if(!selected)throw Error('Selected candidate absent');const candidate=selected.candidate;
 // Write an irreversible study marker BEFORE any final seed is accessed.
 write(finalMarker,{provenance,selectedId:candidate.id,seedRanges:STUDY.final,selectionSha256:sha(readFileSync('reports/study/selection.json')),note:'Final test attempted; no further tuning or final evaluation allowed.'});
 const runs:Run[]=selected.runs.map(r=>restore(candidate,r));
 const evaluations=evaluate(candidate,runs,STUDY.final,selection.includeWind),summary=summarize(evaluations,selected.index,selection.includeWind,true);
 const conclusion=summary.passesOriginalGate&&summary.statisticalSupport?'A':'B';
 const artifact={schemaVersion:3,method:'Tabular Q-learning residual collective controller',scope:'Preregistered six-factor study; Crazyflie 2.1 simulator reference only',
 physicalValidation:false,trainingEpisodes:candidate.episodes,trainingEpisodesTotal:candidate.episodes*runs.length,trainingSeedCount:runs.length,
 trainSeedRange:runs[0].trainSeedRange,evaluationSeedRanges:STUDY.final,validationSeedRanges:STUDY.validation,
 stepsPerEpisode:STUDY.steps,decisionEverySteps:candidate.hold,alpha:STUDY.alpha,gamma:STUDY.gammaPerDecision,epsilon:STUDY.epsilon,
 config,windModel:STUDY_WIND,candidate,stateDefinition:{errorCuts:candidate.errorCuts,verticalSpeedCuts:REFERENCE.errorCuts,tiltCuts:candidate.tilt?[.05,.15]:[]},
 actions:candidate.actions,q:runs[0].q,visits:runs[0].visits,runs,protocol:STUDY,provenance:{...provenance,
 trainingCommand:'node --import tsx scripts/learning/study/run-study.ts --stage=validation',qualificationCommand:'node --import tsx scripts/learning/study/run-study.ts --stage=qualify',
 validationSha256:sha(readFileSync('reports/study/validation.json')),selectionSha256:sha(readFileSync('reports/study/selection.json'))},
 results:summary.results,runResults:summary.runResults,passesSimulationGate:summary.passesOriginalGate,statisticalSupport:summary.statisticalSupport,
 conclusion,promoted:false,promotionReason:conclusion==='A'?'Passed simulation study; physical validation still required':'No supported unchanged-gate pass on fresh final data; existing controller retained',
 limitations:['Simulation only; physicalValidation=false.','Geometry-based flat-plate drag proxy, not measured aircraft drag calibration.','Mild synthetic sinusoidal wind, not measured severe gusts.',
 'Only three training seeds; percentile crossed-bootstrap coverage is approximate.','Altitude error is conditional on executed steps; inspect failures and non-successes.',
 'No physical-flight, wind robustness or endurance guarantee.','Reference Q-table is the first predeclared training run, not a seed-selected winner.'],evaluations};
 write('reports/study/final.json',artifact);write('public/learning/residual-policy.json',artifact);
 const {q:_q,visits:_v,runs:_r,evaluations:_e,...compact}=artifact;write('src/learning/rl-summary.json',compact);
 console.log(JSON.stringify({selectedId:candidate.id,conclusion,passesSimulationGate:summary.passesOriginalGate,results:summary.results}));
}
