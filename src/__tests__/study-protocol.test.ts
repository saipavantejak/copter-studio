import { describe,it,expect } from 'vitest';
import { CANDIDATES,REFERENCE,STUDY,stateCount,stateIndex } from '../../scripts/learning/study/protocol';
import { crossedCI } from '../../scripts/learning/study/statistics';
import type { Episode } from '../../scripts/learning/study/experiment';

describe('Pre-registered study invariants (no simulator/controller execution)',()=>{
 it('has exactly six listed one-factor changes',()=>{
  expect(CANDIDATES.map(c=>c.id)).toEqual(['a','b','c','d','e','f']);
  const expected=[['errorCuts'],['tilt'],['actions'],['hold'],['separate'],['episodes','decay']];
  CANDIDATES.forEach((c,i)=>{
   const changed=(Object.keys(REFERENCE) as (keyof typeof REFERENCE)[]).filter(k=>!['id','label'].includes(k)&&JSON.stringify(c[k])!==JSON.stringify(REFERENCE[k]));
   expect(changed).toEqual(expected[i]);
  });
 });
 it('keeps qualification, validation and final banks disjoint from training and consumed banks',()=>{
  const reserved=[STUDY.qualification,...STUDY.validation,...STUDY.final];
  const training=STUDY.training.map(r=>[r.startSeed,r.startSeed+2999]);
  for(const [i,[lo,hi]] of reserved.entries())for(const [a,b] of [...reserved.slice(i+1),...training,...STUDY.consumed])expect(hi<a||lo>b).toBe(true);
 });
 it('uses the exact state/action/hold definitions',()=>{
  expect(CANDIDATES.map(stateCount)).toEqual([135,243,81,81,81,81]);
  expect(CANDIDATES[2].actions).toEqual([0,-.01,-.005,.005,.01]);expect(CANDIDATES[3].hold).toBe(2);
  const s={z:1,z_dot:0,phi:0,theta:0};expect(stateIndex(REFERENCE,s)).toBe(40);
  expect(stateIndex(CANDIDATES[1],s)).toBe(120);
 });
 it('preserves crossed pairing and deterministic differences under bootstrap',()=>{
  const base={seed:500001,wind:false,reward:-20,meanAltitudeErrorM:.02,successful:true,failed:false} as Episode;
  const pairs=[1,2,3].flatMap(explorationSeed=>[500001,500002].map(seed=>({explorationSeed,
   baseline:{...base,seed},policy:{...base,seed,reward:-22}})));
  const ci=crossedCI(pairs,false,'reward',900001,.05/12);
  expect(ci.estimate).toBe(-2);expect(ci.ci95).toEqual([-2,-2]);expect(ci.adjustedCI).toEqual([-2,-2]);
  expect(ci.bootstrapReplicates).toBe(50000);
 });
});
