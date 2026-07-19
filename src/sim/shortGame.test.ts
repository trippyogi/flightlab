import { describe, expect, it } from 'vitest';
import { simulateShortGame, type ShortGameInputs } from './shortGame';

const base: ShortGameInputs = {
  lie: 'fairway',
  grass: 'bent',
  shot: 'pitch',
  wedge: 'Sand',
  carryYd: 28,
  loftDeg: 56,
  bounceDeg: 12,
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
});
