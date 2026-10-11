import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertStudyBanks,assertTrainingSeed,readTuningInput,selectValidation,type ValidationInput} from '../../scripts/learning/study/integrity';
import {STUDY} from '../../scripts/learning/study/protocol';
it('runtime guard rejects all evaluation banks before training',()=>{
 expect(()=>assertStudyBanks()).not.toThrow();
 for(const [start,end] of [STUDY.qualification,...STUDY.validation,...STUDY.final,...STUDY.consumed])for(const seed of [start,end])expect(()=>assertTrainingSeed(seed)).toThrow('leakage');
 expect(()=>assertTrainingSeed(STUDY.training[0].startSeed)).not.toThrow();
});
it('tuning file capability denies final paths and traversal before file access',()=>{
 for(const path of ['reports/study/final.json','reports/study/final-attempt.json','reports/study/../study/final.json','public/learning/residual-policy.json'])expect(()=>readTuningInput(path)).toThrow('forbidden');
});
it('selection reproduces frozen choice using validation only and rejects injected final seeds',()=>{
 const validation=readTuningInput('reports/study/validation.json') as ValidationInput;
 const frozen=JSON.parse(readFileSync('reports/study/selection.json','utf8'));
 expect(selectValidation(validation).candidate.id).toBe(frozen.selectedId);
 const poisoned=structuredClone(validation);poisoned.candidates[0].evaluations[0].policy.seed=STUDY.final[0][0];
 expect(()=>selectValidation(poisoned)).toThrow('never final');
});

import {evaluate,emptyRun} from '../../scripts/learning/study/experiment';
import {REFERENCE} from '../../scripts/learning/study/protocol';
it('evaluation rejects actual training range before running any controller',()=>{
 const run=emptyRun(REFERENCE);run.trainSeedRange=[710001,710600];
 expect(()=>evaluate(REFERENCE,[run],[[710001,710002]],false)).toThrow('overlaps actual training');
});
