import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reviewCalibration,applyCalibration,parseCalibration,type CalibrationPacket } from '../calibration/PropulsionCalibration';
import { compareTrial,type TrialPair } from '../calibration/TrialValidation';
import { PhysicsEngine } from '../PhysicsEngine';
import { configErrors } from '../configValidation';
import { editHardware,propulsionEvidence } from '../AircraftProfiles';

// Software fixture only. These invented points are NEVER distributed as physical measurements.
function fixture():CalibrationPacket {
 const rows=(sessionId:string)=>[-1,0,1].map(command=>({sessionId,voltageV:3.7,command,thrustN:(command+1)*.08,powerW:.01+(command+1)*1.5}));
 return {schemaVersion:1,aircraftId:'test-only',hardwareRevision:'synthetic-unit-test',sourceUrl:'https://example.com/test-fixture',evidenceKind:'measured',powerScope:'per-motor-electrical',config:{droneType:'quadcopter',mass:.029,propDiameter:45/25.4,batteryVoltage:3.7,armLength:.046,batteryCapacity:250},electronicsPowerW:.5,fitting:rows('fit-session'),validation:rows('heldout-session')};
}
function pair(kind:TrialPair['kind']='battery-endurance'):TrialPair {
 const shared={configurationKey:'test-only exact battery and aircraft',protocolId:'test-only-protocol',durationSeconds:420,energyJ:3000,termination:'battery-cutoff' as const,ambientTemperatureC:20,payloadKg:0};
 return {schemaVersion:1,kind,measured:{...shared,sessionId:'measurement',sourceUrl:'https://example.com/test-only'},simulated:{...shared,engineCommit:'1'.repeat(40),seed:42}};
}
describe('Measured calibration application',()=>{
 it('applies reviewed curves and counts electronics power exactly once',()=>{
  const r=reviewCalibration(fixture());expect(r.passes).toBe(true);
  const engine=new PhysicsEngine();engine.config=applyCalibration(r);engine.reset();engine.setInitialConditions(1,0,0);
  const s=engine.step([-1,-1,-1,-1,0,0]);
  expect(engine.lastPowerW).toBeCloseTo(.5+4*.01,10);
  expect(s.energyConsumed).toBeCloseTo((.5+4*.01)*.016,10);
  expect(engine.currentBattery).toBeCloseTo(250-s.energyConsumed/(3.7*3.6),10);
  expect(propulsionEvidence(engine.config).physicallyValidated).toBe(false);
 });
 it('blocks overlap, unknown power scope and the historical voltage-sweep mismatch',()=>{
  let p=fixture();p.validation[0].sessionId='fit-session';expect(()=>reviewCalibration(p)).toThrow(/separate/);
  p=fixture();p.powerScope='whole-aircraft' as never;expect(()=>reviewCalibration(p)).toThrow(/per-motor/);
  p=fixture();p.fitting[0].voltageV=4.01;expect(()=>reviewCalibration(p)).toThrow(/voltage/);
 });
 it('refuses missing measurements, malformed JSON and unsafe sources',()=>{
  expect(()=>parseCalibration(readFileSync('public/calibration/crazyflie-bench-template.json','utf8'))).toThrow();
  expect(()=>parseCalibration('x'.repeat(256001))).toThrow(/256/);
  expect(()=>parseCalibration('{')).toThrow();
  const p=fixture();p.sourceUrl='javascript:alert(1)';expect(()=>reviewCalibration(p)).toThrow(/HTTPS/);
 });
 it('evaluates truly held-out errors and does not apply failed fits',()=>{
  const p=fixture();p.validation=p.validation.map(r=>({...r,thrustN:r.thrustN*2}));
  const r=reviewCalibration(p);expect(r.record.thrustNormalizedMAE).toBeCloseTo(.5);expect(r.passes).toBe(false);
  expect(()=>applyCalibration(r)).toThrow(/did not pass/);
 });
 it('requires command coverage and prevents missing endpoint extrapolation',()=>{
  const p=fixture();p.fitting[2].command=.875;expect(()=>reviewCalibration(p)).toThrow(/span/);
  const q=fixture();q.validation[1].command=-.9;expect(()=>reviewCalibration(q)).toThrow(/middle/);
 });
 it('invalidates calibration after hardware changes or direct curve tampering',()=>{
  const c=applyCalibration(reviewCalibration(fixture()));
  expect(configErrors(c)).toEqual([]);
  expect(configErrors({...c,propulsionCalibration:{configurationKey:c.propulsionCalibration!.configurationKey} as never})).toContain('Invalid calibration evidence record');
  expect(configErrors({...c,mass:.04})).toContain('Calibration no longer matches the aircraft or propulsion curve; re-import calibration');
  expect(editHardware(c,{mass:.04}).propulsionCalibration).toBeUndefined();
  expect(editHardware(c,{mass:.04}).propulsionCurve).toBeUndefined();
  expect(configErrors({...c,electronicsPowerW:2})).not.toEqual([]);
  expect(configErrors({...c,electronicsPowerW:NaN})).not.toEqual([]);
 });
});
describe('Physical performance comparisons',()=>{
 it('compares cutoff endurance with explicit errors and no full-aircraft badge',()=>{
  const p=pair();p.simulated.durationSeconds=450;const r=compareTrial(p);
  expect(r.comparable).toBe(true);expect(r.durationRelativeError).toBeCloseTo(30/420);
  expect(r.aircraftValidated).toBe(false);
 });
 it('rejects a short hover as endurance evidence and preserves failures',()=>{
  const p=pair();p.simulated.durationSeconds=16;p.simulated.termination='completed-mission';
  expect(compareTrial(p).comparable).toBe(false);expect(compareTrial(p).durationRelativeError).toBeNull();
  p.simulated.termination='crash';expect(compareTrial(p).passes).toBe(false);
 });
 it('rejects missing data, changed protocols and temperature mismatch',()=>{
  const p=pair();p.simulated.energyJ=NaN;expect(()=>compareTrial(p)).toThrow();
  const q=pair();q.simulated.ambientTemperatureC=30;expect(compareTrial(q).comparable).toBe(false);
  q.simulated.protocolId='different';expect(compareTrial(q).reasons).toContain('Different configuration or test protocol');
  expect(()=>compareTrial(JSON.parse(readFileSync('public/calibration/battery-trial-template.json','utf8')))).toThrow();
 });
 it('requires matched ambient gust traces and compares recovery time',()=>{
  const p=pair('gust-recovery');p.measured.termination=p.simulated.termination='completed-mission';
  expect(compareTrial(p).comparable).toBe(false);
  p.measured.wind={referenceFrame:'ambient-world',traceId:'same-trace',gustWindowSeconds:3,peakMps:4,recoverySeconds:2};
  p.simulated.wind={...p.measured.wind,recoverySeconds:2.4};
  expect(compareTrial(p).passes).toBe(true);
  p.simulated.wind.traceId='other';expect(compareTrial(p).comparable).toBe(false);
 });
});
