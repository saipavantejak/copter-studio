export const ORIGINAL_CUTS = [-.5,-.25,-.1,-.03,.03,.1,.25,.5];
export const ORIGINAL_ACTIONS = [0,-.04,-.02,.02,.04];
export interface Candidate { id: string; label: string; errorCuts: number[]; tilt: boolean; actions: number[]; hold: number; separate: boolean; episodes: number; decay: boolean }
const reference: Candidate = { id: 'reference', label: 'Unchanged Q-learning, calibrated physics', errorCuts: ORIGINAL_CUTS, tilt: false, actions: ORIGINAL_ACTIONS, hold: 8, separate: false, episodes: 600, decay: false };
export const REFERENCE = reference;
export const CANDIDATES: Candidate[] = [
 { ...reference, id: 'a', label: 'Fine/nonuniform altitude bins', errorCuts: [-.5,-.25,-.1,-.05,-.02,-.01,-.005,.005,.01,.02,.05,.1,.25,.5] },
 { ...reference, id: 'b', label: 'Add three tilt bins', tilt: true },
 { ...reference, id: 'c', label: 'Smaller residual commands', actions: [0,-.01,-.005,.005,.01] },
 { ...reference, id: 'd', label: 'Hold two physics steps', hold: 2 },
 { ...reference, id: 'e', label: 'Separate calm/wind Q-tables', separate: true },
 { ...reference, id: 'f', label: '3000 episodes and visit-decaying alpha', episodes: 3000, decay: true },
];
export const STUDY = {
 planPath: 'reports/study/preregistration.md', planCommit: 'bf89608', calibrationCommit: '57fe174',
 training: [ { explorationSeed: 424001, startSeed: 710001 }, { explorationSeed: 424002, startSeed: 720001 }, { explorationSeed: 424003, startSeed: 730001 } ],
 qualification: [510001,510100], validation: [[500001,500100],[501001,501100]], final: [[600001,600200],[601001,601200]],
 consumed: [[100001,100050],[101001,101050],[200001,200050],[201001,201050],[300001,300050],[301001,301050]],
 steps: 1000, alpha: .1, gammaPerDecision: .97, epsilon: [.3,.03], bootstrapReplicates: 50000,
 qualificationMinSuccess: .2, qualificationMaxEngineFailure: .2,
 selection: 'Eligible: each run original gate, adjusted reward lower bounds >=0 in each scenario and >0 in one; maximize worst-scenario mean reward difference; if none eligible select same score diagnostically; ties listed order. No training-seed winner selection.',
};
export function stateCount(c: Candidate) { return (c.errorCuts.length+1)*9*(c.tilt?3:1); }
export function stateIndex(c: Candidate,s: { z:number; z_dot:number; phi:number; theta:number }) {
 const bin=(v:number,cuts:number[])=>{ const i=cuts.findIndex(x=>v<x);return i<0?cuts.length:i; };
 const base=bin(1-s.z,c.errorCuts)*9+bin(s.z_dot,ORIGINAL_CUTS);
 return c.tilt?base*3+bin(Math.max(Math.abs(s.phi),Math.abs(s.theta)),[.05,.15]):base;
}
