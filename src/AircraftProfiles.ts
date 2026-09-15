import type { PhysicsConfig } from './PhysicsEngine';

/** Rotor data cannot be carried onto different motors/props by a UI hardware edit. */
export function editHardware(config: PhysicsConfig, patch: Partial<PhysicsConfig>): PhysicsConfig {
  const changed = (['propDiameter','batteryVoltage','droneType'] as const).some(k=>patch[k]!==undefined && patch[k]!==config[k]);
  return {...config,...(changed ? {maxThrustPerMotorN:undefined,propulsionCurve:undefined} : {}),...patch};
}

/** Reference inputs, not independent validation. No thrust/power curve is invented. */
export const AIRCRAFT_PROFILES = [
  {
    id: 'crazyflie-2.1', name: 'Crazyflie 2.1 (stock brushed)',
    sources: ['https://www.bitcraze.io/crazyflie-2-1/', 'https://www.bitcraze.io/2022/10/thrust-upgrade-kit-for-the-crazyflie-2-1/'],
    limitations: 'Approximate arm length/inertia; maximum thrust only, no measured power curve. Not the 2.1+ or thrust upgrade kit.',
    config: {droneType:'quadcopter',mass:0.029,propDiameter:45/25.4,batteryVoltage:3.7,armLength:0.046,batteryCapacity:250,maxThrustPerMotorN:0.060*9.81/4} as PhysicsConfig,
  },
  {
    id: 'crazyflie-2.1-brushless', name: 'Crazyflie 2.1 Brushless (2023 reference)',
    sources: ['https://www.bitcraze.io/2023/10/say-hello-to-the-crazyflie-2-1-brushless/'],
    limitations: '2023 manufacturer reference configuration, not all later variants. Approximate arm length/inertia; no measured power curve.',
    config: {droneType:'quadcopter',mass:0.032,propDiameter:55/25.4,batteryVoltage:3.7,armLength:0.05,batteryCapacity:350,maxThrustPerMotorN:0.120*9.81/4} as PhysicsConfig,
  },
] as const;

export function propulsionEvidence(config: PhysicsConfig) {
  const matched = AIRCRAFT_PROFILES.find(p => ['droneType','propDiameter','batteryVoltage','maxThrustPerMotorN'].every(k =>
    p.config[k as keyof PhysicsConfig] === config[k as keyof PhysicsConfig]));
  return {
    status: config.propulsionCurve ? 'User-supplied curve; provenance unverified' : matched ? 'Manufacturer maximum only' : config.maxThrustPerMotorN ? 'User-supplied maximum; provenance unverified' : 'Generic estimate; uncalibrated',
    sources: !config.propulsionCurve && matched ? [...matched.sources] : [],
    physicallyValidated: false,
  };
}
