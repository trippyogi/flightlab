import { describe, expect, it } from 'vitest';
import { simulateShortGame, type ShortGameInputs } from './shortGame';

const base: ShortGameInputs = {
  lie: 'fairway',
  grass: 'bent',
  category: 'pitch',
  shot: 'pitch',
  wedge: 'Sand',
  swing: '9:00',
  carryYd: 28,
  loftDeg: 56,
  bounceDeg: 12,
  faceOpenDeg: 0,
  shaftLeanDeg: 2,
  greenFirmness: 3,
};

describe('simulateShortGame', () => {
  it('makes rough launch higher with less spin and more rollout', () => {
    const fairway = simulateShortGame(base);
    const rough = simulateShortGame({ ...base, lie: 'rough', grass: 'bermuda' });

    expect(rough.launchDeg).toBeGreaterThan(fairway.launchDeg);
    expect(rough.spinRpm).toBeLessThan(fairway.spinRpm);
    expect(rough.rolloutYd).toBeGreaterThan(fairway.rolloutYd);
  });

  it('lets bounce help bunker shots', () => {
    const lowBounce = simulateShortGame({ ...base, lie: 'bunker', grass: 'sand', shot: 'blast', bounceDeg: 6 });
    const highBounce = simulateShortGame({ ...base, lie: 'bunker', grass: 'sand', shot: 'blast', bounceDeg: 14 });

    expect(highBounce.contactQuality).toBeGreaterThan(lowBounce.contactQuality);
    expect(highBounce.launchDeg).toBeGreaterThan(lowBounce.launchDeg);
  });

  it('makes a flop stop faster than a bump', () => {
    const flop = simulateShortGame({ ...base, shot: 'flop', loftDeg: 60 });
    const bump = simulateShortGame({ ...base, shot: 'bump', loftDeg: 50 });

    expect(flop.apexFt).toBeGreaterThan(bump.apexFt);
    expect(flop.rolloutYd).toBeLessThan(bump.rolloutYd);
  });

  it('models wet rough as a lower spin, higher release problem', () => {
    const fairway = simulateShortGame(base);
    const wetRough = simulateShortGame({ ...base, lie: 'wet-rough', grass: 'down-grain' });

    expect(wetRough.spinRpm).toBeLessThan(fairway.spinRpm);
    expect(wetRough.totalYd - wetRough.carryYd).toBeGreaterThan(fairway.rolloutYd);
    expect(wetRough.risks).toContain('grass-between-face risk');
  });

  it('models a flier lie as a low-spin release pitch', () => {
    const fairway = simulateShortGame(base);
    const flier = simulateShortGame({ ...base, lie: 'flier', grass: 'bermuda' });

    expect(flier.launchDeg).toBeGreaterThan(fairway.launchDeg);
    expect(flier.spinRpm).toBeLessThan(fairway.spinRpm);
    expect(flier.rolloutYd).toBeGreaterThan(fairway.rolloutYd);
    expect(flier.risks).toContain('flier/release risk');
  });

  it('makes a sitting-down lie less reliable than a sitting-up lie', () => {
    const sittingUp = simulateShortGame({ ...base, lie: 'sitting-up' });
    const sittingDown = simulateShortGame({ ...base, lie: 'sitting-down' });

    expect(sittingDown.contactQuality).toBeLessThan(sittingUp.contactQuality);
    expect(sittingDown.landingWindowYd).toBeGreaterThan(sittingUp.landingWindowYd);
    expect(sittingDown.risks).toContain('buried contact risk');
  });

  it('links face-open and shaft-lean to effective loft and bounce', () => {
    const square = simulateShortGame(base);
    const open = simulateShortGame({ ...base, faceOpenDeg: 12, shaftLeanDeg: 0 });
    const leaned = simulateShortGame({ ...base, faceOpenDeg: 0, shaftLeanDeg: 10 });

    expect(open.effectiveLoftDeg).toBeGreaterThan(square.effectiveLoftDeg);
    expect(open.effectiveBounceDeg).toBeGreaterThan(square.effectiveBounceDeg);
    expect(leaned.effectiveLoftDeg).toBeLessThan(square.effectiveLoftDeg);
    expect(leaned.effectiveBounceDeg).toBeLessThan(square.effectiveBounceDeg);
  });

  it('makes longer clock swings carry farther', () => {
    const short = simulateShortGame({ ...base, swing: '7:30' });
    const medium = simulateShortGame({ ...base, swing: '9:00' });
    const long = simulateShortGame({ ...base, swing: '10:30' });

    expect(medium.carryYd).toBeGreaterThan(short.carryYd);
    expect(long.carryYd).toBeGreaterThan(medium.carryYd);
  });
});
