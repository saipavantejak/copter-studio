import type { PhysicsConfig } from '../PhysicsEngine';
import { configErrors } from '../configValidation';
import { interpolatePropulsion, type PropulsionPoint } from '../physics/propulsion';

export interface BenchSample extends PropulsionPoint { sessionId:string; voltageV:number }
export interface CalibrationPacket {
 schemaVersion:1;
 aircraftId:string;
 hardwareRevision:string;
 sourceUrl:string;
 evidenceKind:'measured';
 powerScope:'per-motor-electrical';
 config:Pick<PhysicsConfig,'droneType'|'mass'|'propDiameter'|'batteryVoltage'|'armLength'|'batteryCapacity'>;
 electronicsPowerW:number;
 fitting:BenchSample[];
 validation:BenchSample[];
}
import { BOUND_FIELDS, calibrationKey, type CalibrationRecord } from './CalibrationBinding';
export { BOUND_FIELDS, calibrationKey, calibrationBindingErrors, type CalibrationRecord } from './CalibrationBinding';
const fail=(message:string):never=>{throw new Error(message);};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=500;

export function reviewCalibration(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Calibration must be an object');
 const p=input as CalibrationPacket;
 if(p.schemaVersion!==1||p.evidenceKind!=='measured')fail('Only schema 1 with declared measured evidence is accepted');
 if(!text(p.aircraftId)||!text(p.hardwareRevision))fail('Exact aircraft ID and hardware revision are required');
 try{if(!text(p.sourceUrl)||new URL(p.sourceUrl).protocol!=='https:')fail('Source URL must use HTTPS');}catch{fail('Source URL must use HTTPS');}
 if(p.powerScope!=='per-motor-electrical')fail('Use per-motor electrical power; whole-aircraft and shaft power cannot be silently converted');
 if(!p.config||typeof p.config!=='object')fail('Aircraft configuration required');
 // Reconstruct only supported inputs; ignore extra objects from the uploaded file.
 const config=Object.fromEntries(BOUND_FIELDS.map(k=>[k,p.config[k]])) as unknown as PhysicsConfig;
 const errors=configErrors(config);if(errors.length)fail(errors.join('; '));
 if(!finite(p.electronicsPowerW)||p.electronicsPowerW<0||p.electronicsPowerW>10000)fail('Measured electronics power must be finite and nonnegative');
 for(const key of ['fitting','validation'] as const){
  const rows=p[key];if(!Array.isArray(rows)||rows.length<3||rows.length>2000)fail(`${key} needs 3–2000 measured points`);
  for(const r of rows){
   if(!r||![r.command,r.thrustN,r.powerW,r.voltageV].every(finite)||!text(r.sessionId))fail(`Invalid ${key} point or missing session ID`);
   if(r.command< -1||r.command>1||r.thrustN<0||r.powerW<0||(r.thrustN>0&&r.powerW<=0))fail(`Invalid ${key} units or electrical power`);
   if(Math.abs(r.voltageV-config.batteryVoltage)>config.batteryVoltage*.01)fail('Supply voltage differs by over 1% from nominal; a voltage-dependent model is required');
  }
 }
 const fittingSessions=[...new Set(p.fitting.map(r=>r.sessionId))];
 const validationSessions=[...new Set(p.validation.map(r=>r.sessionId))];
 if(validationSessions.some(id=>fittingSessions.includes(id)))fail('Fitting and validation must use separate measurement sessions');
 const groups=new Map<number,BenchSample[]>();
 for(const row of p.fitting)groups.set(row.command,[...(groups.get(row.command)??[]),row]);
 const curve=[...groups].sort(([a],[b])=>a-b).map(([command,rows])=>({command,thrustN:rows.reduce((s,r)=>s+r.thrustN,0)/rows.length,powerW:rows.reduce((s,r)=>s+r.powerW,0)/rows.length}));
 const next:PhysicsConfig={...config,electronicsPowerW:p.electronicsPowerW,propulsionCurve:curve};
 const curveErrors=configErrors(next);if(curveErrors.length)fail(curveErrors.join('; '));
 const commands=new Set(p.validation.map(r=>r.command));
 if(commands.size<3||![...commands].some(c=>Math.abs(c)<=.3)||Math.min(...commands)>-.8||Math.max(...commands)<.8)fail('Validation must cover low, middle and high commands (including ≤ -0.8 and ≥ 0.8)');
 const errorsByPoint=p.validation.map(r=>{const predicted=interpolatePropulsion(curve,r.command);return {sessionId:r.sessionId,command:r.command,observedThrustN:r.thrustN,predictedThrustN:predicted.thrustN,observedPowerW:r.powerW,predictedPowerW:predicted.powerW};});
 const mean=(values:number[])=>values.reduce((s,v)=>s+v,0)/values.length;
 const thrustMean=mean(p.validation.map(r=>r.thrustN)),powerMean=mean(p.validation.map(r=>r.powerW));
 if(thrustMean<=0||powerMean<=0)fail('Validation needs positive measured thrust and electrical power');
 const thrustNormalizedMAE=mean(errorsByPoint.map(r=>Math.abs(r.predictedThrustN-r.observedThrustN)))/thrustMean;
 const powerNormalizedMAE=mean(errorsByPoint.map(r=>Math.abs(r.predictedPowerW-r.observedPowerW)))/powerMean;
 // Engineering release targets, not industry standards or statistical confidence.
 const passes=thrustNormalizedMAE<=.05&&powerNormalizedMAE<=.10;
 const record:CalibrationRecord={aircraftId:p.aircraftId,hardwareRevision:p.hardwareRevision,sourceUrl:p.sourceUrl,configurationKey:calibrationKey(next),fittingSessions,validationSessions,thrustNormalizedMAE,powerNormalizedMAE,scope:'static propulsion only',independentlyVerified:false};
 return {passes,config:{...next,propulsionCalibration:record},errorsByPoint,record,limits:{thrustNormalizedMAE:.05,powerNormalizedMAE:.10},unvalidated:['battery discharge and cutoff','gust response','inertia and drag','controller dynamics','full-aircraft endurance']};
}
export function parseCalibration(raw:string){
 if(new TextEncoder().encode(raw).length>256000)fail('Calibration file exceeds 256 kB');
 return reviewCalibration(JSON.parse(raw));
}
export function applyCalibration(review:ReturnType<typeof reviewCalibration>):PhysicsConfig {
 // Recheck all computed bounds even if a caller bypasses the UI's disabled button.
 if(!review.passes||review.record.thrustNormalizedMAE>.05||review.record.powerNormalizedMAE>.10)fail('Calibration did not pass held-out bench targets');
 const errors=configErrors(review.config);if(errors.length)fail(errors.join('; '));
 return structuredClone(review.config);
}
