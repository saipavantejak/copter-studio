/** No simulator execution: reconstruct summaries, CIs, selection and gate from recorded rows. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { aggregate,summarize } from './study/statistics';
import { CANDIDATES,STUDY } from './study/protocol';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
// Generated JSON omits undefined pooled-binomial CI fields by design.
const same=(a:unknown,b:unknown,msg:string)=>{if(!isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b))))throw new Error(msg);};
const qualification=load('reports/study/qualification.json'),validation=load('reports/study/validation.json'),selection=load('reports/study/selection.json'),final=load('reports/study/final.json');
for(const report of [qualification,validation,selection,final])for(const [path,expectedHash] of Object.entries(report.provenance.sourceHashes)){
 const bytes=execFileSync('git',['show',`${report.provenance.sourceCommit}:${path}`]);
 if(createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw new Error('Committed execution source hash mismatch: '+path);
}
same(aggregate(qualification.episodes),qualification.result,'Qualification aggregation');
if(validation.candidates.length!==6)throw new Error('Dropped registered candidate');
for(const [i,c] of validation.candidates.entries()){
 same(c.candidate,CANDIDATES[i],'Candidate diverges from registration');
 const expected=summarize(c.evaluations,i,validation.includeWind);
 for(const key of Object.keys(expected))same(c[key],expected[key],'Validation summary/CI mismatch '+c.candidate.id+' '+key);
}
const eligible=validation.candidates.filter(c=>c.eligible),pool=eligible.length?eligible:validation.candidates;
const selected=[...pool].sort((a,b)=>b.selectionScore-a.selectionScore)[0];
if(selected.candidate.id!==selection.selectedId||selection.diagnosticOnly!==(eligible.length===0))throw new Error('Selection diverges from registration');
const expected=summarize(final.evaluations,selected.index,validation.includeWind,true);
same(expected.results,final.results,'Final aggregate/CI mismatch');same(expected.runResults,final.runResults,'Final per-run gate mismatch');
if(final.passesSimulationGate!==expected.passesOriginalGate||final.statisticalSupport!==expected.statisticalSupport)throw new Error('Gate claim mismatch');
if(final.conclusion!==(expected.passesOriginalGate&&expected.statisticalSupport?'A':'B')||final.promoted||final.physicalValidation)throw new Error('Unsupported final claim');
same(final,load('public/learning/residual-policy.json'),'Public artifact mismatch');
const {q,visits,runs,evaluations,...compact}=final;same(compact,load('src/learning/rl-summary.json'),'Summary mismatch');
for(const pair of final.evaluations)for(const mode of ['baseline','policy']){
 const r=pair[mode],d=r.diagnostics;
 if(Math.abs(r.reward+d.altitudeCost+d.velocityCost+d.actionCost+d.failureCost)>1e-8)throw new Error('Original reward accounting mismatch');
}
const planHash=createHash('sha256').update(readFileSync(STUDY.planPath)).digest('hex');
if(final.provenance.planSha256!==planHash)throw new Error('Registration changed');
console.log('Verified all six validation candidates, crossed CIs, frozen selection, final gate, original reward and artifact parity; no controller episodes executed.');
