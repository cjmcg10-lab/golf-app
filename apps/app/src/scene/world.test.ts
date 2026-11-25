import { describe, expect, test } from 'vitest';
import { heightAt, parseGelv } from './elevation';
import { makeFrame } from './frame';
import { buildPathGraph, pointAlong, route } from './paths';
import { IMPACT_T, SWING_END, swingPose } from './swing';
import { placeTrees } from './trees';

function gelv(w: number, h: number, values: number[], base = 10, scale = 0.5) {
  const buf = new ArrayBuffer(56 + w * h * 2);
  const dv = new DataView(buf);
  'GELV'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setUint16(4, 1, true);
  dv.setUint32(8, w, true);
  dv.setUint32(12, h, true);
  dv.setFloat64(16, -72.0, true); // west
  dv.setFloat64(24, 41.0, true); // north
  dv.setFloat64(32, 0.001, true); // dlon
  dv.setFloat64(40, 0.001, true); // dlat
  dv.setFloat32(48, base, true);
  dv.setFloat32(52, scale, true);
  values.forEach((v, i) => dv.setUint16(56 + i * 2, v, true));
  return buf;
}

describe('elevation', () => {
  test('parsesHeaderAndHeights', () => {
    const g = parseGelv(gelv(2, 2, [0, 2, 4, 65535]));
    expect([g.width, g.height, g.west, g.north]).toEqual([2, 2, -72, 41]);
    expect([...g.h.slice(0, 3)]).toEqual([10, 11, 12]);
    expect(Number.isNaN(g.h[3])).toBe(true);
  });
  test('rejectsOtherFiles', () => {
    expect(() => parseGelv(new ArrayBuffer(80))).toThrow(/GELV/);
  });
  test('bilinearBetweenCellCentres', () => {
    const g = parseGelv(gelv(2, 1, [0, 4])); // 10 m and 12 m
    expect(heightAt(g, -72 + 0.001, 41 - 0.0005)).toBeCloseTo(11, 5); // halfway between centres
    expect(heightAt(g, -73, 41)).toBeCloseTo(10, 5); // clamps outside
  });
});

describe('frame', () => {
  test('roundTripsAndScales', () => {
    const f = makeFrame(-72.86, 41.57);
    const [e, n] = f.toEN(-72.86 + 0.001, 41.57 + 0.001);
    expect(e).toBeCloseTo(83.4, 0); // ~83 m per 0.001° lon at 41.57°N
    expect(n).toBeCloseTo(111.1, 0);
    const [lon, lat] = f.toLonLat(e, n);
    expect(lon).toBeCloseTo(-72.859, 6);
    expect(lat).toBeCloseTo(41.571, 6);
  });
});

describe('trees', () => {
  const area: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
  const hole: [number, number][] = [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]];
  test('insideAreasOutsideAvoid', () => {
    const t = placeTrees([area], [hole], 6, 1);
    expect(t.length).toBeGreaterThan(150);
    for (const p of t) {
      expect(p.e >= 0 && p.e <= 100 && p.n >= 0 && p.n <= 100).toBe(true);
      expect(p.e > 40 && p.e < 60 && p.n > 40 && p.n < 60).toBe(false);
    }
  });
  test('deterministic', () => {
    expect(placeTrees([area], [], 6, 3)).toEqual(placeTrees([area], [], 6, 3));
  });
});

describe('cart paths', () => {
  const a: [number, number][] = [[0, 0], [50, 0]];
  const b: [number, number][] = [[52, 1], [52, 60]]; // starts 2 m from a's end
  const far: [number, number][] = [[200, 200], [250, 200]];
  const g = buildPathGraph([a, b, far], 4);
  test('routesAcrossJoinedSegments', () => {
    const r = route(g, [0, -5], [52, 65]);
    expect(r[0]).toEqual([0, -5]);
    expect(r.at(-1)).toEqual([52, 65]);
    expect(r.some(([e, n]) => e === 50 && n === 0)).toBe(true);
    expect(r.some(([e, n]) => e === 52 && n === 60)).toBe(true);
  });
  test('fallsBackToStraightLineWhenUnconnected', () => {
    expect(route(g, [0, 0], [250, 200])).toEqual([[0, 0], [250, 200]]);
  });
  test('pointAlongInterpolatesWithHeading', () => {
    const p = pointAlong([[0, 0], [10, 0], [10, 10]], 15);
    expect(p.pos).toEqual([10, 5]);
    expect(p.heading).toBeCloseTo(0, 5); // due north
    expect(pointAlong([[0, 0], [10, 0]], 99).done).toBe(true);
  });
});

describe('swing', () => {
  test('addressImpactAndTop', () => {
    const a = swingPose(0);
    const top = swingPose(IMPACT_T - 0.3);
    const hit = swingPose(IMPACT_T);
    expect(top.shoulderTurn).toBeGreaterThan(1.3);
    expect(top.armLift).toBeGreaterThan(1.5);
    expect(Math.abs(hit.armLift - a.armLift)).toBeLessThan(0.15);
    expect(swingPose(SWING_END + 3)).toEqual(swingPose(SWING_END));
  });
});
