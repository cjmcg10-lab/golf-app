import type { Hole, LngLat } from '@golf/course-schema';
import { distanceYards } from '@golf/geo';
import type { FeatureCollection } from 'geojson';
import { describe, expect, test } from 'vitest';
import { computeDistances } from './distances';

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
  featureIds: ['w1'],
};
const features: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'w1', kind: 'water', hole: 1, source: 'osm', confidence: 1 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-72.8681, 41.5659],
            [-72.8679, 41.5659],
            [-72.8679, 41.5661],
            [-72.8681, 41.5661],
            [-72.8681, 41.5659],
          ],
        ],
      },
    },
  ],
};
const fixAt = (at: LngLat, accuracyM = 5) => ({
  fix: { at, accuracyM, speedMps: null, headingDeg: null },
  status: 'ok' as const,
});
const fairway: LngLat = [-72.8675, 41.566];

describe('computeDistances', () => {
  test('gpsOrigin', () => {
    const d = computeDistances(hole, features, fixAt(fairway), null);
    expect(d.origin).toBe('gps');
    expect(d.offCourse).toBe(false);
    expect(d.green!.center).toBeCloseTo(distanceYards(fairway, hole.green.center), 6);
    expect(d.accuracyYards).toBeNull();
    expect(d.notice).toBeNull();
  });

  test('permissionDenied', () => {
    const d = computeDistances(hole, features, { fix: null, status: 'denied' }, null);
    expect(d.origin).toBe('tee');
    expect(d.green!.center).toBeCloseTo(distanceYards(hole.playLine[0]!, hole.green.center), 6);
    expect(d.hazards.map((h) => h.id)).toEqual(['w1']);
    expect(d.notice).toBe('Location is off — distances are from the tee');
  });

  test('farFromCourse', () => {
    const d = computeDistances(hole, features, fixAt([-72.81, 41.566]), null); // ~5 km east
    expect(d.offCourse).toBe(true);
    expect(d.green).toBeNull();
    expect(d.hazards).toEqual([]);
    expect(d.notice).toBe('You’re not on the course');
  });

  test('lowAccuracy', () => {
    expect(computeDistances(hole, features, fixAt(fairway, 45), null).accuracyYards).toBe(49);
    expect(computeDistances(hole, features, fixAt(fairway, 30), null).accuracyYards).toBeNull();
  });

  test('targetDistances', () => {
    const target: LngLat = [-72.867, 41.566];
    const d = computeDistances(hole, features, fixAt(fairway), target);
    expect(d.toTarget).toBeCloseTo(distanceYards(fairway, target), 6);
    expect(d.targetToGreen).toBeCloseTo(distanceYards(target, hole.green.center), 6);
  });

  test('targetFromTeeWhenOffCourse', () => {
    const target: LngLat = [-72.867, 41.566];
    const d = computeDistances(hole, features, fixAt([-72.81, 41.566]), target);
    expect(d.toTarget).toBeCloseTo(distanceYards(hole.playLine[0]!, target), 6);
  });

  test('movedTeeIsTheOriginWithoutGps', () => {
    const tee: LngLat = [-72.8685, 41.566];
    const d = computeDistances(hole, features, { fix: null, status: 'denied' }, null, { tee });
    expect(d.from).toEqual(tee);
    expect(d.green!.center).toBeCloseTo(distanceYards(tee, hole.green.center), 6);
  });

  test('placedBallBeatsGps', () => {
    const ball: LngLat = [-72.8672, 41.566];
    const d = computeDistances(hole, features, fixAt(fairway), null, { ball });
    expect(d.origin).toBe('ball');
    expect(d.from).toEqual(ball);
    expect(d.notice).toBeNull();
  });
});
