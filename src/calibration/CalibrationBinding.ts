import type { PhysicsConfig } from '../PhysicsEngine';
export interface CalibrationRecord {
 aircraftId:string;hardwareRevision:string;sourceUrl:string;
 configurationKey:string; fittingSessions:string[];validationSessions:string[];
 thrustNormalizedMAE:number;powerNormalizedMAE:number;
 scope:'static propulsion only';independentlyVerified:false;
}
export const BOUND_FIELDS=['droneType','mass','propDiameter','batteryVoltage','armLength','batteryCapacity'] as const;
/** Integrity binding to editor values, not an authentication/signature mechanism. */
export function calibrationKey(c:PhysicsConfig):string {
 return JSON.stringify([...BOUND_FIELDS.map(k=>c[k]??null),c.electronicsPowerW??null,c.propulsionCurve??null]);
}
export function calibrationBindingErrors(c:PhysicsConfig):string[]{
 const r=c.propulsionCalibration;
 if(r===undefined)return [];
 if(!r||typeof r!=='object'||!['aircraftId','hardwareRevision','sourceUrl','configurationKey'].every(k=>typeof r[k]==='string'&&r[k].length>0)||!Array.isArray(r.fittingSessions)||!Array.isArray(r.validationSessions)||!r.fittingSessions.length||!r.validationSessions.length||![...r.fittingSessions,...r.validationSessions].every(s=>typeof s==='string'&&s.length>0)||r.validationSessions.some(s=>r.fittingSessions.includes(s))||![r.thrustNormalizedMAE,r.powerNormalizedMAE].every(v=>Number.isFinite(v)&&v>=0)||r.thrustNormalizedMAE>.05||r.powerNormalizedMAE>.10||r.independentlyVerified!==false||r.scope!=='static propulsion only')return ['Invalid calibration evidence record'];
 return typeof r!=='object'||r.configurationKey!==calibrationKey(c)?['Calibration no longer matches the aircraft or propulsion curve; re-import calibration']:[];
}
