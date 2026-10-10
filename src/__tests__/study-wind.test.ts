import { describe, it, expect } from 'vitest';
import { STUDY_WIND, horizontalRelativeDrag, studyGust } from '../physics/studyWind';
describe('Registered wind force model (no controller evaluation)', () => {
  it('uses SI area and the vector drag equation', () => {
    expect(STUDY_WIND.frontalAreaM2).toBeCloseTo(.002668, 12);
    const force = horizontalRelativeDrag(STUDY_WIND, 3, 4, 0, 0);
    const magnitude = .5 * 1.225 * 1.28 * .002668 * 25;
    expect(Math.hypot(force.fx, force.fy)).toBeCloseTo(magnitude, 12);
    expect(force.fx / force.fy).toBeCloseTo(3 / 4, 12);
  });
  it('has zero force at matched airspeed and opposes motion in calm air', () => {
    expect(horizontalRelativeDrag(STUDY_WIND, 2, -1, 2, -1)).toEqual({ fx: 0, fy: 0 });
    const force = horizontalRelativeDrag(STUDY_WIND, 0, 0, 2, 1);
    expect(force.fx * 2 + force.fy).toBeLessThan(0);
  });
  it('preserves the registered gust ramp and rejects invalid parameters', () => {
    expect(studyGust(1, 2, 0)).toEqual({ x: 0, y: 0 });
    expect(Math.abs(studyGust(1, 2, 1).x)).toBeLessThanOrEqual(3 * Math.log(2) / Math.log(31));
    expect(() => horizontalRelativeDrag({ ...STUDY_WIND, frontalAreaM2: -1 }, 0, 0, 0, 0)).toThrow();
  });
});
