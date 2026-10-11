import {readFileSync} from 'node:fs';
import {STUDY,CANDIDATES,type Candidate} from './protocol';
import type {Run,Pair} from './experiment';
export function assertTrainingSeed(seed:number):void {
 const reserved=[STUDY.qualification,...STUDY.validation,...STUDY.final,...STUDY.consumed];
 if(!Number.isSafeInteger(seed)||reserved.some(([lo,hi])=>seed>=lo&&seed<=hi))throw Error('Training/evaluation seed leakage');
}
export function assertStudyBanks():void {
 const budget=Math.max(...CANDIDATES.map(c=>c.episodes));
 const banks=[...STUDY.training.map(r=>[r.startSeed,r.startSeed+budget-1]),...STUDY.training.map(r=>[r.explorationSeed,r.explorationSeed]),STUDY.qualification,...STUDY.validation,...STUDY.final,...STUDY.consumed];
 for(const [i,[lo,hi]] of banks.entries())for(const [a,b]of banks.slice(i+1))if(!(hi<a||lo>b))throw Error('Overlapping registered seed banks');
}
/** Training/selection gets no generic file reader; final artifacts are denied. */
export function readTuningInput(path:string):unknown {
 if(!['reports/study/qualification.json','reports/study/validation.json'].includes(path))throw Error('Final/unknown input forbidden to tuning');
 return JSON.parse(readFileSync(path,'utf8')) as unknown;
}
export type ValidationCandidate={candidate:Candidate;runs:Run[];index:number;eligible:boolean;selectionScore:number;evaluations:Pair[]};
export type ValidationInput={candidates:ValidationCandidate[];includeWind:boolean;provenance:{sourceHashes:Record<string,string>}};
export function selectValidation(input:ValidationInput):ValidationCandidate {
 if(input.candidates.length!==CANDIDATES.length)throw Error('Incomplete registered candidate set');
 for(const c of input.candidates){
  for(const e of c.evaluations)for(const mode of ['baseline','policy'] as const){
   const episode=e[mode],bank=STUDY.validation[Number(episode.wind)];
   if(episode.seed<bank[0]||episode.seed>bank[1])throw Error('Selection requires validation seeds, never final seeds');
  }
 }
 const eligible=input.candidates.filter(c=>c.eligible),pool=eligible.length?eligible:input.candidates;
 return [...pool].sort((a,b)=>b.selectionScore-a.selectionScore)[0];
}
assertStudyBanks();
