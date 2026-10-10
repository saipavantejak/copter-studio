/** Independent recorded-data audit. Imports no simulator or main analysis modules.
 * Does not train, evaluate controllers, modify result JSON, or read future seed banks.
 * Exit 1 means the hiring-manager integrity check is blocked, even if metrics pass.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const final=load('reports/study/final.json');
const validation=load('reports/study/validation.json');
const checks=[];
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
function check(claim,source,actual,reported){
 const eq=(a,b)=>typeof a==='number'&&typeof b==='number'
  ? Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b))
  : Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>eq(v,b[i])):a===b;
 checks.push({claim,source,recomputed:actual,reported,status:eq(actual,reported)?'PASS':'FAIL'});
}
// Separately implemented Mulberry32, including its specified unsigned operations.
function generator(seed){let state=(seed>>>0)||1;return()=>{
 state+=0x6d2b79f5;let x=Math.imul(state^(state>>>15),state|1);
 x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;
};}
function intervals(pairs,wind,key,record){
 const rows=pairs.filter(p=>p.baseline.wind===wind);
 const runs=[...new Set(rows.map(p=>p.explorationSeed))];
 const seeds=[...new Set(rows.map(p=>p.baseline.seed))];
 if(runs.length!==3||rows.length!==runs.length*seeds.length)throw Error('Incomplete crossed design');
 const lookup=new Map(rows.map(p=>[`${p.explorationSeed}:${p.baseline.seed}`,Number(p.policy[key])-Number(p.baseline[key])]));
 const matrix=runs.map(r=>seeds.map(s=>lookup.get(`${r}:${s}`)));
 const random=generator(record.bootstrapSeed),samples=[];
 for(let b=0;b<record.bootstrapReplicates;b++){
  const indices=Array.from({length:3},()=>Math.floor(random()*3));let total=0;
  for(let i=0;i<seeds.length;i++){const s=Math.floor(random()*seeds.length);total+=matrix[indices[0]][s]+matrix[indices[1]][s]+matrix[indices[2]][s];}
  samples.push(total/(3*seeds.length));
 }
 samples.sort((a,b)=>a-b);
 const q=p=>{const position=(samples.length-1)*p,i=Math.floor(position),fraction=position-i;return samples[i]*(1-fraction)+samples[Math.min(i+1,samples.length-1)]*fraction;};
 const alpha=1-record.adjustedConfidence;
 return {estimate:avg(matrix.map(avg)),ci95:[q(.025),q(.975)],adjustedCI:[q(alpha/2),q(1-alpha/2)],trainingRunMeans:matrix.map(avg)};
}
function aggregates(rows,report,path,pooled=false){
 for(const [key,value] of Object.entries({episodes:rows.length,successes:rows.filter(x=>x.successful).length,failures:rows.filter(x=>x.failed).length,nonSuccesses:rows.filter(x=>!x.successful).length,meanReward:avg(rows.map(x=>x.reward)),meanAltitudeErrorM:avg(rows.map(x=>x.meanAltitudeErrorM)),meanSteps:avg(rows.map(x=>x.steps))}))check(key,path+'/'+key,value,report[key]);
 const counts={};for(const r of rows)counts[r.outcome]=(counts[r.outcome]??0)+1;
 for(const [key,value] of Object.entries(counts))check('outcome count',path+'/outcomeCounts/'+key,value,report.outcomeCounts[key]);
 if(!pooled)for(const [field,key] of [['successRate95CI','successful'],['failureRate95CI','failed']]){
  const n=rows.length,p=rows.filter(x=>x[key]).length/n,z=1.959963984540054;
  const denominator=1+z*z/n,center=(p+z*z/(2*n))/denominator,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/denominator;
  check(field,path+'/'+field,[Math.max(0,center-half),Math.min(1,center+half)],report[field]);
 }
}
function study(pairs,results,runResults,path){
 for(const r of results){
  const rows=pairs.filter(p=>p.baseline.wind===r.wind),run=rows[0].explorationSeed;
  const location=path+'/results/'+Number(r.wind);
  aggregates(rows.filter(p=>p.explorationSeed===run).map(p=>p.baseline),r.baseline,location+'/baseline');
  aggregates(rows.map(p=>p.policy),r.policy,location+'/policy',true);
  for(const key of ['reward','meanAltitudeErrorM','successful','failed']){
   const computed=intervals(pairs,r.wind,key,r.comparisons[key]);
   for(const [field,value] of Object.entries(computed))check(key+' '+field,location+'/comparisons/'+key+'/'+field,value,r.comparisons[key][field]);
  }
 }
 const gates=[];
 for(const run of runResults){
  for(const r of run.results){const rows=pairs.filter(p=>p.explorationSeed===run.explorationSeed&&p.baseline.wind===r.wind);for(const mode of ['baseline','policy'])aggregates(rows.map(p=>p[mode]),r[mode],path+'/runResults/'+run.explorationSeed+'/'+Number(r.wind)+'/'+mode);}
  const gate=run.results.length===2&&run.results.every(r=>r.policy.successes>=r.baseline.successes&&r.policy.failures<=r.baseline.failures&&r.policy.meanReward>=r.baseline.meanReward)&&run.results.some(r=>r.policy.meanReward>r.baseline.meanReward);
  check('per-run unchanged gate',path+'/runResults/'+run.explorationSeed,gate,run.passesOriginalGate);gates.push(gate);
 }
 return gates.every(Boolean);
}
for(const c of validation.candidates)check('candidate unchanged gate','reports/study/validation.json#'+c.candidate.id,study(c.evaluations,c.results,c.runResults,'validation/'+c.candidate.id),c.passesOriginalGate);
check('final unchanged simulation gate','reports/study/final.json',study(final.evaluations,final.results,final.runResults,'final'),final.passesSimulationGate);
const resume=readFileSync('reports/ml-evaluation-audit.md','utf8').split('## Supported resume statement\n\n')[1]?.split('\n\n')[0].trim();
if(!resume)throw Error('Missing actual resume statement');
const percentages=[...resume.matchAll(/([\d.]+)%/g)].map(m=>Number(m[1]));
const reductions=final.results.map(r=>Number((100*(1-r.policy.meanAltitudeErrorM/r.baseline.meanAltitudeErrorM)).toFixed(1)));
check('actual resume altitude reduction (%)','reports/ml-evaluation-audit.md',reductions,percentages);
const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const count=resume.match(/with (\w+) training seeds/);
check('actual resume training seeds','reports/ml-evaluation-audit.md',final.trainingSeedCount,words[count?.[1]]??Number(count?.[1]));
check('actual resume episode budget','reports/ml-evaluation-audit.md',final.trainingEpisodes,Number(resume.match(/([\d,]+)-episode candidate/)?.[1].replaceAll(',','')));
check('actual resume simulation gate','reports/ml-evaluation-audit.md',final.passesSimulationGate,/passed the unchanged held-out simulation gate/.test(resume));
check('actual resume physical validation','reports/ml-evaluation-audit.md',final.physicalValidation,!/physical-flight validation was not performed/.test(resume));
// RFC4180-style parser: quoted commas and multi-line claims must remain intact.
function* csvRows(text){let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){
 const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
 else if(!quoted&&(c===','||c==='\n')){row.push(field);field='';if(c==='\n'){yield row;row=[];}}
 else field+=c;
}if(quoted)throw Error('Unclosed CSV quote');if(field||row.length){row.push(field);yield row;}}
const inventory=gunzipSync(readFileSync('reports/numeric-claims-final.csv.gz')).toString();
let header,resumeRows=[];for(const row of csvRows(inventory)){if(!header){header=row;continue;}const fields=Object.fromEntries(header.map((k,i)=>[k,row[i]]));if(fields.source_file==='reports/ml-evaluation-audit.md#supported-resume-statement')resumeRows.push(fields);}
check('exactly one resume inventory row','reports/numeric-claims-final.csv.gz',1,resumeRows.length);
const resumeRow=resumeRows[0];
check('inventory matches actual resume paragraph','reports/numeric-claims-final.csv.gz',resume,resumeRow?.claim);
let facts;try{facts=JSON.parse(resumeRow?.recomputed_value);}catch{facts={};}
for(const [key,value]of Object.entries({trainingSeedCount:final.trainingSeedCount,trainingEpisodes:final.trainingEpisodes,passesSimulationGate:final.passesSimulationGate,physicalValidation:final.physicalValidation,promoted:final.promoted,altitudeReductionPct:reductions}))check('resume inventory '+key,'reports/numeric-claims-final.csv.gz',value,facts[key]);
check('resume inventory MATCH is earned','reports/numeric-claims-final.csv.gz','MATCH',resumeRow?.match_or_mismatch);
// Verify all generated study claims in both READMEs and study/audit documents.
// This only renders/checks text; it does not perform statistical analysis.
let docsMatch=true;try{execFileSync('python',['scripts/learning/render-evaluation-report.py','--check'],{stdio:'pipe'});}catch(error){docsMatch=false;console.error(String(error.stderr));}
check('generated study claims match committed artifacts','README.md; scripts/learning/README.md; reports/study/improvement-study.md; reports/ml-evaluation-audit.md',true,docsMatch);
const failed=checks.filter(c=>c.status==='FAIL');
mkdirSync('reports/integrity',{recursive:true});
const report={scope:'Independent raw-episode recomputation of existing six-candidate validation and selected final study; not a whole-repository certification or simulator replay.',checks,passed:checks.length-failed.length,failed:failed.length};
writeFileSync('reports/integrity/independent-verifier.json',JSON.stringify(report,null,2)+'\n');
const csvCell=value=>'"'+String(typeof value==='string'?value:JSON.stringify(value)).replaceAll('"','""')+'"';
writeFileSync('reports/integrity/claim-to-source.csv',[['claim','source','recomputed','reported','status'].join(','),...checks.map(c=>[c.claim,c.source,c.recomputed,c.reported,c.status].map(csvCell).join(','))].join('\n')+'\n');
console.log(`Independent study audit: ${report.passed} PASS, ${report.failed} FAIL`);
for(const r of failed)console.error(JSON.stringify(r));
if(failed.length)process.exitCode=1;
