import { describe, expect, it } from 'vitest';
import { namedFlight, simulateImpact, type ImpactInputs } from './impact';

describe('simulateImpact', () => {
  it('pins a centered driver reference shot', () => {
    const result = simulateImpact({
      club: 'Driver',
      handedness: 'right',
      clubSpeedMph: 113,
      attackAngleDeg: 2,
      clubPathDeg: 0,
      faceAngleDeg: 0,
      dynamicLoftDeg: 12,
      strikeX: 0,
      strikeY: 0,
    });

    expect(result.ballSpeedMph).toBeCloseTo(164.4, 1);
    expect(result.spinRpm).toBeCloseTo(2500, -1);
    expect(result.launchAngleDeg).toBeCloseTo(9.6, 1);
    expect(result.carryYd).toBeGreaterThan(245);
    expect(result.carryYd).toBeLessThan(310);
    expect(Math.abs(result.offlineYd)).toBeLessThan(1);
  });

  it('turns face-to-path into signed curve axis', () => {
    const fade = simulateImpact({
      club: '6-iron',
      handedness: 'right',
      clubSpeedMph: 92,
      attackAngleDeg: -3.5,
      clubPathDeg: -2,
      faceAngleDeg: 2,
      dynamicLoftDeg: 28,
      strikeX: 0,
      strikeY: 0,
    });
    const draw = simulateImpact({ ...fade.inputs, clubPathDeg: 2, faceAngleDeg: -2 });

    expect(fade.spinAxisDeg).toBeGreaterThan(0);
    expect(draw.spinAxisDeg).toBeLessThan(0);
    expect(fade.spinRpm).toBeCloseTo(6350, -2);
  });

  it('names the teaching-flight families from face and path', () => {
    const base: ImpactInputs = {
      club: 'Driver',
      handedness: 'right',
      clubSpeedMph: 113,
      attackAngleDeg: 2,
      clubPathDeg: 0,
      faceAngleDeg: 0,
      dynamicLoftDeg: 12,
      strikeX: 0,
      strikeY: 0,
    };

    expect(namedFlight(base)).toBe('straight');
    expect(namedFlight({ ...base, faceAngleDeg: 4, clubPathDeg: 7 })).toBe('push-draw');
    expect(namedFlight({ ...base, faceAngleDeg: -4, clubPathDeg: -7 })).toBe('pull-fade');
    expect(namedFlight({ ...base, handedness: 'left', faceAngleDeg: -4, clubPathDeg: -7 })).toBe('push-draw');
  });
});
