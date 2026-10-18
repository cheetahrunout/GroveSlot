import { describe, expect, it } from 'vitest';
import { computeLayout } from '../src/view/layout';

describe('computeLayout', () => {
  it('uses the landscape layout on desktop and letterboxes', () => {
    const l = computeLayout(1920, 1200);
    expect(l.mode).toBe('landscape');
    expect(l.scale).toBe(1);
    expect(l.offsetY).toBe(60);
  });

  it('switches to the portrait layout on tall screens', () => {
    const l = computeLayout(390, 844);
    expect(l.mode).toBe('portrait');
    expect(l.width * l.scale).toBeLessThanOrEqual(390);
    expect(l.height * l.scale).toBeLessThanOrEqual(844);
  });
});
