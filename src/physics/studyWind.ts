/** Geometry-scaled flat-plate proxy; NOT experimentally calibrated aircraft aerodynamics. */
export interface StudyWindModel { densityKgM3: number; dragCoefficient: number; frontalAreaM2: number }
export const STUDY_WIND: StudyWindModel = { densityKgM3: 1.225, dragCoefficient: 1.28, frontalAreaM2: .092 * .029 };
export function horizontalRelativeDrag(model: StudyWindModel, airX: number, airY: number, velocityX: number, velocityY: number) {
  if (![model.densityKgM3, model.dragCoefficient, model.frontalAreaM2].every(v => Number.isFinite(v) && v > 0)
    || ![airX, airY, velocityX, velocityY].every(Number.isFinite)) throw new Error('Invalid study wind input');
  const ux = airX - velocityX, uy = airY - velocityY;
  const scale = .5 * model.densityKgM3 * model.dragCoefficient * model.frontalAreaM2 * Math.hypot(ux, uy);
  return { fx: scale * ux, fy: scale * uy };
}
export function studyGust(phaseX: number, phaseY: number, altitudeM: number) {
  const ramp = Math.min(1, Math.log(1 + Math.max(0, altitudeM)) / Math.log(31));
  return { x: (2 * Math.sin(phaseX) + Math.sin(2.3 * phaseX)) * ramp,
    y: (2 * Math.sin(phaseY) + Math.sin(1.7 * phaseY)) * ramp };
}
