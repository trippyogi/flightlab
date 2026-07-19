import { describe, expect, it } from 'vitest';
import { modules } from './registry';

describe('module registry', () => {
  it('keeps live modules receipt-ready', () => {
    const liveModules = modules.filter((module) => module.status === 'live');

    expect(liveModules.map((module) => module.id)).toEqual(['impact', 'green']);
    liveModules.forEach((module) => {
      expect(module.handles.length).toBeGreaterThan(0);
      expect(module.readouts.length).toBeGreaterThan(0);
      expect(module.receipts.length).toBeGreaterThan(0);
      expect(module.sources.length).toBeGreaterThan(0);
    });
  });
});
