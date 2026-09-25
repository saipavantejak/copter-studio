import type {PhysicsConfig} from '../PhysicsEngine';
import type {MissionSpec} from '../MissionSpec';
import {VehicleController} from '../VehicleController';
import {assertPromotable,type TrainingState,HOLD} from './TrainingJob';
import {applyResidual,greedyAction,stateIndex} from './ResidualPolicy';
export const configFingerprint=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export class NativePolicy {
 readonly candidate:TrainingState;
 private base=new VehicleController();private step=0;private action=0;private binding:string;
 constructor(candidate:TrainingState){assertPromotable(candidate);this.candidate=structuredClone(candidate);this.binding=configFingerprint(candidate.config);}
 reset(){this.base.reset();this.step=0;this.action=0;}
 predict(s:number[],config:PhysicsConfig,mission:MissionSpec){
  if(configFingerprint(config)!==this.binding||mission.mode!=='hover'||mission.targetAltitudeM!==1||mission.durationSeconds!==16)throw new Error('Promoted residual policy requires its exact trained aircraft and 1 m / 16 s hover. Restore PD for other missions.');
  if(this.step++%HOLD===0)this.action=greedyAction(this.candidate.q[stateIndex(s[2],s[5])]);
  return applyResidual(this.base.action({x:s[0],y:s[1],z:s[2],x_dot:s[3],y_dot:s[4],z_dot:s[5],phi:s[6],theta:s[7],psi:s[8],p:s[9],q:s[10],r:s[11]},config,mission),this.action);
 }
}
