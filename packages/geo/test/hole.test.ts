import type { FeatureCollection } from 'geojson';
import type { Hole } from '@golf/course-schema';
import { describe, expect, test } from 'vitest';
import { distanceYards, greenDistances, hazardDistances, holeBearing } from '../src/index';

// hole running due east along lat 41.566; 1e-4 deg lon ≈ 9.11 yds here
const hole: Hole = {
  number: 1,
  par: 4,
  handicap: null,
  playLine: [
    [-72.869, 41.566],
    [-72.866, 41.566],
  ],
  measuredYards: 273,
  yards: {},
  pin: [-72.866, 41.566],
  green: { front: [-72.8662, 41.566], center: [-72.866, 41.566], back: [-72.8658, 41.566] },
  featureIds: ['b1', 'w1', 'b2', 'g1'],
};
const sq = (cx: number, cy: number, d: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [cx - d, cy - d],
      [cx + d, cy - d],
      [cx + d, cy + d],
      [cx - d, cy + d],
      [cx - d, cy - d],
    ],
  ],
});
const f = (id: string, kind: string, hole: number | null, geometry: ReturnType<typeof sq>) => ({
  type: 'Feature' as const,
  geometry,
  properties: { id, kind, hole, source: 'osm', confidence: 1 },
});
const features: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    f('b1', 'bunker', 1, sq(-72.867, 41.566, 0.0001)), // in play, nearer the green
    f('w1', 'water', 1, sq(-72.868, 41.566, 0.0001)), // in play, nearer the tee
    f('b2', 'bunker', 1, sq(-72.8675, 41.5675, 0.0001)), // far off line (~53° off) → excluded
    f('g1', 'green', 1, sq(-72.866, 41.566, 0.0002)), // not a hazard
    f('bx', 'bunker', 2, sq(-72.867, 41.566, 0.0001)), // other hole
  ],
};
const tee = hole.playLine[0]!;

describe('hole', () => {
  test('greenDistancesOrdered', () => {
    const g = greenDistances(tee, hole);
    expect(g.front).toBeLessThan(g.center);
    expect(g.center).toBeLessThan(g.back);
    expect(g.center).toBeCloseTo(distanceYards(tee, hole.green.center), 6);
  });

  test('hazardSorted', () => {
    const hz = hazardDistances(tee, hole, features);
    expect(hz.map((h) => h.id)).toEqual(['w1', 'b1']);
    const w = hz[0]!;
    // square spans lon -72.8681..-72.8679 → ~82 and ~100 yds from the tee
    expect(w.frontYards).toBeCloseTo(82, -0.5);
    expect(w.backYards).toBeCloseTo(100, -0.5);
    expect(w.frontYards).toBeLessThan(w.backYards);
    expect(w.kind).toBe('water');
  });

  test('holeWithoutHazards', () => {
    const none: FeatureCollection = {
      type: 'FeatureCollection',
      features: [features.features[3]!],
    };
    expect(hazardDistances(tee, hole, none)).toEqual([]);
  });

  test('hazardBehindPlayerExcluded', () => {
    // standing past the water, it is behind you and no longer listed
    expect(hazardDistances([-72.8672, 41.566], hole, features).map((h) => h.id)).toEqual(['b1']);
  });

  test('holeBearing', () => {
    expect(holeBearing(hole)).toBeCloseTo(90, 0);
  });
});
