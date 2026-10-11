import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {rk4Step,qNorm} from '../../src/physics/core';
import {SeededRandom} from '../../src/SeededRandom';
const root=process.argv[2];if(!root)throw Error('Usage: node --import tsx scripts/physics/compare-flight.ts DATASET_CHECKOUT');
const pinned='2d921b57d166fe2debe08a5d39bd07297c5abc39';
if(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pinned)throw Error('Wrong dataset revision');
if(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Dataset checkout is dirty');
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourcePaths=['scripts/physics/compare-flight.ts','reports/physics/preregistration.md','src/physics/core.ts','src/physics/constants.ts','src/SeededRandom.ts'];
const sourceHashes=Object.fromEntries(sourcePaths.map(path=>{const b=readFileSync(path);if(sha(b)!==sha(execFileSync('git',['show',`HEAD:${path}`])))throw Error('Commit source first: '+path);return [path,sha(b)];}));
const columns=['x','y','z','vx','vy','vz','qw','qx','qy','qz','wx','wy','wz'];
type Prediction={startRow:number;horizonSteps:number;predicted:number[];reference:number[];errors:number[]};
type Flight={filename:string;inputSha256:string;rows:number;records:Prediction[];metrics:{horizonSteps:number;windows:number;rmse:number[]}[]};
const flights:Flight[]=[];
const vectorError=(a:number[],b:number[],offset:number,count:number)=>Math.hypot(...a.slice(offset,offset+count).map((v,i)=>v-b[offset+i]));
const errors=(a:number[],b:number[])=>{const aq=a.slice(6,10),bq=b.slice(6,10);qNorm(aq);qNorm(bq);const dot=aq.reduce((s,v,i)=>s+v*bq[i],0);return [vectorError(a,b,0,3),vectorError(a,b,3,3),2*Math.acos(Math.min(1,Math.abs(dot))),vectorError(a,b,10,3)];};
for(const run of [1,2,3]){
 const filename=`data/test/melon_20251017_run${run}.csv`,bytes=readFileSync(resolve(root,filename));
 const lines=bytes.toString().trim().split(/\r?\n/),header=lines.shift()!.split(',');
 const rows=lines.map(line=>{const v=line.split(',').map(Number);return Object.fromEntries(header.map((k,i)=>[k,v[i]]));});
 for(let i=0;i<rows.length;i++){
  if(!['t',...columns,'m1_rads','m2_rads','m3_rads','m4_rads'].every(k=>Number.isFinite(rows[i][k])))throw Error('Nonfinite/missing input: '+filename+' row '+i);
  if(i&&Math.abs(rows[i].t-rows[i-1].t-.01)>1e-7)throw Error('Unregistered time spacing: '+filename+' row '+i);
  if(Math.hypot(...columns.slice(6,10).map(k=>rows[i][k]))<1e-8)throw Error('Degenerate quaternion');
 }
 const records:Prediction[]=[];
 for(let start=0;start+50<rows.length;start+=50){
  let state=columns.map(k=>rows[start][k]);
  for(let j=0;j<50;j++){
   const u=[1,2,3,4].map(k=>rows[start+j][`m${k}_rads`]**2),Kt=3.72e-8,arm=.0353,Kc=7.74e-12;
   state=rk4Step(state,{Fz:Kt*u.reduce((s,v)=>s+v,0),L:Kt*arm*(u[2]+u[3]-u[0]-u[1]),M:Kt*arm*(u[1]+u[2]-u[0]-u[3]),N:Kc*(u[0]+u[2]-u[1]-u[3])},{fx:0,fy:0},.045,2.3951e-5,2.3951e-5,3.2347e-6,.01);
   const quaternion=state.slice(6,10);qNorm(quaternion);state.splice(6,4,...quaternion);
   if(!state.every(Number.isFinite))throw Error('Nonfinite prediction '+filename+' row '+start+' step '+j);
   if(j===0||j===49){const reference=columns.map(k=>rows[start+j+1][k]);records.push({startRow:start,horizonSteps:j+1,predicted:[...state],reference,errors:errors(state,reference)});}
  }
 }
 const metrics=[1,50].map(horizonSteps=>{const selected=records.filter(r=>r.horizonSteps===horizonSteps);return {horizonSteps,windows:selected.length,rmse:[0,1,2,3].map(i=>Math.sqrt(selected.reduce((s,r)=>s+r.errors[i]**2,0)/selected.length))};});
 flights.push({filename,inputSha256:sha(bytes),rows:rows.length,records,metrics});
}
const summary=[1,50].map((horizonSteps,h)=>({horizonSteps,independentFlightUnits:flights.length,metrics:['positionM','velocityMps','attitudeRad','bodyRateRadps'].map((metric,m)=>{
 const values=flights.map(f=>f.metrics[h].rmse[m]),estimate=values.reduce((s,v)=>s+v,0)/values.length,seed=940001+h*10+m,rng=new SeededRandom(seed),samples:number[]=[];
 for(let b=0;b<10000;b++)samples.push((values[Math.floor(rng.next()*3)]+values[Math.floor(rng.next()*3)]+values[Math.floor(rng.next()*3)])/3);
 samples.sort((a,b)=>a-b);const quantile=(p:number)=>{const x=(samples.length-1)*p,i=Math.floor(x),t=x-i;return samples[i]*(1-t)+samples[Math.min(i+1,samples.length-1)]*t;};
 return {metric,estimate,ci95:[quantile(.025),quantile(.975)],bootstrapSeed:seed,bootstrapReplicates:10000};
})}));
const report={physicalValidation:false,scope:'Production rigid-body RK4 subsystem only; externally supplied force conversion and mass/inertia; different Brushless aircraft; not a full PhysicsEngine validation.',provenance:{command:'node --import tsx scripts/physics/compare-flight.ts DATASET_CHECKOUT',sourceCommit,sourceHashes,datasetUrl:'https://github.com/idsia-robotics/nanodrone-sysid-benchmark',datasetCommit:pinned,node:process.version},flights,summary};
writeFileSync('reports/physics/flight-comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
