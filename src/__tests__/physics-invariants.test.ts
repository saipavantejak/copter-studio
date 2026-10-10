import {describe,it,expect} from 'vitest';
import {rk4Step} from '../physics/core';
import {GRAVITY,DT} from '../physics/constants';
import {PhysicsEngine} from '../PhysicsEngine';
import {AIRCRAFT_PROFILES} from '../AircraftProfiles';
import {VehicleController} from '../VehicleController';

const initial=[0,0,100,1,-2,3,1,0,0,0,0,0,0];
const zero={Fz:0,L:0,M:0,N:0},wind={fx:0,fy:0};
const step=(s:number[],h:number,Fz=0)=>rk4Step(s,{...zero,Fz},wind,.029,1,1,1,h);
describe('implemented RK4 and energy invariants',()=>{
 it('matches the analytic ballistic solution, including position and velocity',()=>{
  let s=[...initial];const h=.01,n=100,t=h*n;
  for(let i=0;i<n;i++)s=step(s,h);
  expect(s[0]).toBeCloseTo(t,11);expect(s[1]).toBeCloseTo(-2*t,11);
  expect(s[2]).toBeCloseTo(100+3*t-GRAVITY*t*t/2,10);
  expect(s[5]).toBeCloseTo(3-GRAVITY*t,11);
 });
 it('matches analytic constant-rate quaternion rotation',()=>{
  let s=[...initial];s[12]=2;
  for(let i=0;i<100;i++)s=step(s,.01);
  expect(s[6]).toBeCloseTo(Math.cos(1),8);expect(s[9]).toBeCloseTo(Math.sin(1),8);
 });
 it('converges at fourth order for the smooth held-force rigid-body subproblem',()=>{
  const error=(h:number)=>{let s=[...initial];s[12]=2;for(let i=0;i<Math.round(.8/h);i++)s=step(s,h);return Math.hypot(s[6]-Math.cos(.8),s[9]-Math.sin(.8));};
  const coarse=error(.1),medium=error(.05),fine=error(.025);
  expect(coarse/medium).toBeGreaterThan(15);expect(coarse/medium).toBeLessThan(17);
  expect(medium/fine).toBeGreaterThan(15);expect(medium/fine).toBeLessThan(17);
 });
 it('conserves mechanical energy in ballistic flight and accounts for thrust work',()=>{
  const energy=(s:number[])=>.029*(GRAVITY*s[2]+(s[3]**2+s[4]**2+s[5]**2)/2);
  const before=energy(initial),free=step(initial,.1),powered=step(initial,.1,.6);
  expect(energy(free)).toBeCloseTo(before,11);
  expect(energy(powered)-before).toBeCloseTo(.6*(powered[2]-initial[2]),10);
 });
 it('accounts for nominal battery joules and integrated electrical power every step',()=>{
  const engine=new PhysicsEngine();engine.config={...AIRCRAFT_PROFILES[0].config};engine.reset();engine.setInitialConditions(1,0,0);
  const controller=new VehicleController();const initialJ=engine.currentBattery*engine.config.batteryVoltage*3.6;let integral=0;
  for(let i=0;i<100;i++){
   engine.step(controller.action(engine.getState(),engine.config));integral+=engine.lastPowerW*DT;
   expect(engine.failureReason).toBeUndefined();
   expect(engine.totalEnergyConsumed).toBeCloseTo(integral,10);
   expect(engine.totalEnergyConsumed+engine.currentBattery*engine.config.batteryVoltage*3.6).toBeCloseTo(initialJ,8);
  }
 });
 it('caps consumption at available energy and freezes after depletion',()=>{
  const engine=new PhysicsEngine();engine.config={...AIRCRAFT_PROFILES[0].config,batteryCapacity:1e-6};engine.reset();engine.setInitialConditions(1,0,0);
  const available=engine.currentBattery*engine.config.batteryVoltage*3.6;
  const depleted=engine.step([1,1,1,1]);
  expect(engine.totalEnergyConsumed).toBeCloseTo(available,14);
  expect(engine.currentBattery).toBe(0);expect(engine.failureReason).toBe('Battery depletion');
  expect(engine.step([1,1,1,1])).toEqual(depleted);
 });
});
