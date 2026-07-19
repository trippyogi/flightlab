import { describe, expect, it } from 'vitest';
import { greenInternalsForTest, simulateGreen } from './green';

describe('simulateGreen', () => {
  it('pins stimp friction and capture taper', () => {
    expect(greenInternalsForTest.frictionFromStimp(10)).toBeCloseTo(0.55, 2);
    expect(greenInternalsForTest.captureRadius(0.4)).toBeGreaterThan(
      greenInternalsForTest.captureRadius(1.2),
    );
  });

  it('rolls a straight putt near the cup on a flat green', () => {
    const result = simulateGreen({
      distanceFt: 12,
      slopePercent: 0,
      slopeDirectionDeg: 90,
      stimp: 10,
      aimDeg: 0,
      pacePastFt: 1.4,
    });

    expect(result.missDistanceM).toBeLessThan(0.08);
    expect(Math.abs(result.breakFt)).toBeLessThan(0.03);
    expect(result.lipSpeedMs).toBeLessThan(1.45);
  });

  it('breaks more on faster greens', () => {
    const slow = simulateGreen({
      distanceFt: 12,
      slopePercent: 2,
      slopeDirectionDeg: 90,
      stimp: 7,
      aimDeg: 0,
      pacePastFt: 1,
    });
    const fast = simulateGreen({
      distanceFt: 12,
      slopePercent: 2,
      slopeDirectionDeg: 90,
      stimp: 13,
      aimDeg: 0,
      pacePastFt: 1,
    });

    expect(Math.abs(fast.breakFt)).toBeGreaterThan(Math.abs(slow.breakFt));
  });
});
