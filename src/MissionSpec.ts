export interface MissionSpec {
  mode: 'hover' | 'velocity';
  targetAltitudeM: number;
  forwardVelocityMps: number;
  durationSeconds: number;
}

export const DEFAULT_MISSION: MissionSpec = {
  mode: 'hover', targetAltitudeM: 1, forwardVelocityMps: 0, durationSeconds: 16,
};

export function missionErrors(m: MissionSpec): string[] {
  const errors: string[] = [];
  if (!['hover', 'velocity'].includes(m.mode)) errors.push('Unsupported mission mode');
  if (!Number.isFinite(m.targetAltitudeM) || m.targetAltitudeM < 0.1 || m.targetAltitudeM > 120) errors.push('Target altitude must be 0.1–120 m');
  if (!Number.isFinite(m.forwardVelocityMps) || Math.abs(m.forwardVelocityMps) > 15) errors.push('Forward velocity must be within ±15 m/s');
  if (!Number.isFinite(m.durationSeconds) || m.durationSeconds < 1 || m.durationSeconds > 3600) errors.push('Duration must be 1–3600 s');
  if (m.mode === 'hover' && m.forwardVelocityMps !== 0) errors.push('Hover mission cannot have nonzero forward velocity');
  return errors;
}
