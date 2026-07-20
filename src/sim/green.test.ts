import { describe, expect, it } from 'vitest';
import { greenInternalsForTest, simulateGreen } from './green';

describe('simulateGreen', () => {
  it('pins stimp friction and capture taper', () => {
    expect(greenInternalsForTest.frictionFromStimp(10)).toBeCloseTo(0.55, 2);
    expect(greenInternalsForTest.captureRadius(0.4)).toBeGreaterThan(
      greenInternalsForTest.captureRadius(1.2),
    );
    expect(greenInternalsForTest.secondPuttPacePastFt).toBe(1.5);
    expect(greenInternalsForTest.secondPuttReadGravityMultiplier).toBeCloseTo(2.15);
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

  it('maps positive aim to golfer-right', () => {
    const result = simulateGreen({
      distanceFt: 12,
      slopePercent: 0,
      slopeDirectionDeg: 90,
      stimp: 10,
      aimDeg: 5,
      pacePastFt: 1.4,
    });

    expect(result.points[1].position[0]).toBeLessThan(0);
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

  it('shrinks the capture ring as delivery pace rises', () => {
    const dying = simulateGreen({
      distanceFt: 12,
      slopePercent: 0,
      slopeDirectionDeg: 90,
      stimp: 10,
      aimDeg: 0,
      pacePastFt: 0.2,
    });
    const firm = simulateGreen({
      distanceFt: 12,
      slopePercent: 0,
      slopeDirectionDeg: 90,
      stimp: 10,
      aimDeg: 0,
      pacePastFt: 4,
    });

    expect(firm.captureRadiusM).toBeLessThan(dying.captureRadiusM);
  });

  it('keeps rollout data after a captured putt', () => {
    const result = simulateGreen({
      distanceFt: 12,
      slopePercent: 0,
      slopeDirectionDeg: 90,
      stimp: 10,
      aimDeg: 0,
      pacePastFt: 2,
    });

    expect(result.made).toBe(true);
    expect(result.points.at(-1)?.position).toEqual([0, 0]);
    expect(result.rolloutPoints.length).toBeGreaterThan(2);
    expect(result.stopPastFt).toBeGreaterThan(0);
  });

  it('describes the second putt leave from the stop point', () => {
    const result = simulateGreen({
      distanceFt: 28,
      slopePercent: 3,
      slopeDirectionDeg: 0,
      stimp: 12,
      aimDeg: -8,
      pacePastFt: 0.5,
    });

    expect(result.made).toBe(false);
    expect(result.leave.distanceFt).toBeGreaterThan(0.5);
    expect(['uphill', 'downhill', 'sidehill']).toContain(result.leave.slopeRead);
    expect(['above hole', 'below hole', 'level']).toContain(result.leave.heightRead);
  });

  it('simulates the second-putt make line instead of a straight return line', () => {
    const result = simulateGreen({
      distanceFt: 24,
      slopePercent: 4,
      slopeDirectionDeg: 90,
      stimp: 12,
      aimDeg: -6,
      pacePastFt: 0.4,
    });
    const start = result.secondPuttPoints[0].position;
    const mid = result.secondPuttPoints[Math.floor(result.secondPuttPoints.length / 2)].position;
    const end = result.secondPuttPoints.at(-1)!.position;
    const straightMidX = (start[0] + end[0]) / 2;

    expect(result.secondPuttPoints.length).toBeGreaterThan(8);
    expect(end[0]).toBeCloseTo(0, 6);
    expect(end[1]).toBeCloseTo(0, 6);
    expect(Math.abs(mid[0] - straightMidX)).toBeGreaterThan(0.015);
  });

  it('shows a meaningful second-putt read on a short steep sidehill leave', () => {
    const result = simulateGreen({
      distanceFt: 4,
      slopePercent: 5,
      slopeDirectionDeg: 90,
      stimp: 10,
      aimDeg: 20,
      pacePastFt: 5,
    });
    const xs = result.secondPuttPoints.map((point) => point.position[0] / 0.3048);
    const lateralReadFt = Math.max(...xs) - Math.min(...xs);
    const end = result.secondPuttPoints.at(-1)!.position;

    expect(lateralReadFt).toBeGreaterThan(1.45);
    expect(end[0]).toBeCloseTo(0, 6);
    expect(end[1]).toBeCloseTo(0, 6);
  });
});
