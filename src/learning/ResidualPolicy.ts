/** Experimental tabular residual policy. Not automatically installed in RLAgent. */
export const RESIDUAL_ACTIONS = [0, -.04, -.02, .02, .04] as const;
const CUTS = [-.5,-.25,-.1,-.03,.03,.1,.25,.5];
export const STATE_COUNT = 81;
export function stateIndex(z: number, verticalSpeed: number): number {
  if (!Number.isFinite(z) || !Number.isFinite(verticalSpeed)) throw new Error('Invalid policy state');
  const bin=(v:number)=>{const i=CUTS.findIndex(c=>v<c);return i<0?8:i;};
  return bin(1-z)*9+bin(verticalSpeed);
}
export function greedyAction(row: readonly number[]): number {
  if(row.length!==RESIDUAL_ACTIONS.length || !row.every(Number.isFinite)) throw new Error('Invalid Q row');
  // Unvisited states prefer the unchanged engineering controller.
  return row.reduce((best,v,i)=>v>row[best]?i:best,0);
}
export function applyResidual(base: number[], action: number): number[] {
  if(!Number.isInteger(action)||action<0||action>=RESIDUAL_ACTIONS.length)throw new Error('Invalid residual');
  return base.map((v,i)=>i<4?Math.max(-1,Math.min(1,v+RESIDUAL_ACTIONS[action])):v);
}
