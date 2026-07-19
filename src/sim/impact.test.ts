import { describe, expect, it } from 'vitest';
import { simulateImpact } from './impact';

describe('simulateImpact', () => {
  it('pins a centered driver reference shot', () => {
    const result = simulateImpact({
      club: 'Driver',
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
      club: '7-iron',
      clubSpeedMph: 90,
      attackAngleDeg: -4,
      clubPathDeg: -2,
      faceAngleDeg: 2,
      dynamicLoftDeg: 31,
      strikeX: 0,
      strikeY: 0,
    });
    const draw = simulateImpact({ ...fade.inputs, clubPathDeg: 2, faceAngleDeg: -2 });

    expect(fade.spinAxisDeg).toBeGreaterThan(0);
    expect(draw.spinAxisDeg).toBeLessThan(0);
    expect(fade.spinRpm).toBeCloseTo(7000, -2);
  });
});
