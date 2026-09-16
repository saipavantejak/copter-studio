export interface MissionSpec {
  mode: 'hover' | 'velocity';
  targetAltitudeM: number;
  forwardVelocityMps: number;
  durationSeconds: number;
}

export const DEFAULT_MISSION: MissionSpec = {
  mode: 'hover', targetAltitudeM: 1, forwardVelocityMps: 0, durationSeconds: 16,
};

/** One interpretation shared by controller, runner and recorded evidence. */
export function resolveMission(tests: {mission?: MissionSpec; missionPreset?: string}, duration = 16): MissionSpec {
  if (tests.mission) return {...tests.mission};
  const velocity=tests.missionPreset==='long-range'||tests.missionPreset==='high-speed';
  return {...DEFAULT_MISSION,durationSeconds:duration,mode:velocity?'velocity':'hover',forwardVelocityMps:velocity?5:0};
}

export function isTrackingMission(s: {z:number;x:number;y:number;x_dot:number;y_dot:number}, m:MissionSpec):boolean {
  return Math.abs(s.z-m.targetAltitudeM)<=.1 && Math.abs(s.y)<=.25 && Math.abs(s.y_dot)<=.5 &&
    (m.mode==='hover' ? Math.abs(s.x)<=.25 && Math.abs(s.x_dot)<=.5 : Math.abs(s.x_dot-m.forwardVelocityMps)<=.5);
}

export function missionErrors(m: MissionSpec): string[] {
  const errors: string[] = [];
  if (!['hover', 'velocity'].includes(m.mode)) errors.push('Unsupported mission mode');
  if (!Number.isFinite(m.targetAltitudeM) || m.targetAltitudeM < 0.1 || m.targetAltitudeM > 120) errors.push('Target altitude must be 0.1–120 m');
  if (!Number.isFinite(m.forwardVelocityMps) || Math.abs(m.forwardVelocityMps) > 15) errors.push('Forward velocity must be within ±15 m/s');
  if (!Number.isFinite(m.durationSeconds) || m.durationSeconds < 1 || m.durationSeconds > 3600) errors.push('Duration must be 1–3600 s');
  if (m.mode === 'hover' && m.forwardVelocityMps !== 0) errors.push('Hover mission cannot have nonzero forward velocity');
  return errors;
}
