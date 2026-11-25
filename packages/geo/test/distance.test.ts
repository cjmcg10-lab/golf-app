import { describe, expect, test } from 'vitest';
import { bearingDeg, distanceYards } from '../src/index';

describe('distance', () => {
  test('distanceKnown', () => {
    // 100 m due north: 100 / 6371008.8 rad = 0.000899322 deg
    const d = distanceYards(
      [-72.866, 41.566],
      [-72.866, 41.566 + (100 / 6371008.8) * (180 / Math.PI)],
    );
    expect(d).toBeCloseTo(109.36, 1);
  });

  test('bearingCardinal', () => {
    expect(bearingDeg([-72.866, 41.566], [-72.865, 41.566])).toBeCloseTo(90, 0);
    expect(bearingDeg([-72.866, 41.566], [-72.866, 41.567])).toBeCloseTo(0, 0);
    expect(bearingDeg([-72.866, 41.566], [-72.867, 41.566])).toBeCloseTo(270, 0);
  });
});
