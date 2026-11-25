import type { FeatureCollection, Position } from 'geojson';
import type { FeatureKind, FeatureProps, Hole, LngLat } from '@golf/course-schema';
import { bearingDeg, bearingDiff, distanceYards } from './distance';

export interface HazardDistance {
  id: string;
  kind: FeatureKind;
  frontYards: number;
  backYards: number;
}

const HAZARD_KINDS: FeatureKind[] = ['bunker', 'water'];
const CONE_DEG = 15;
const STEP_DEG = 0.00002; // ~2 m sampling along polygon edges

export function holeBearing(hole: Hole): number {
  return bearingDeg(hole.playLine[0]!, hole.green.center);
}

export function greenDistances(from: LngLat, hole: Hole) {
  return {
    front: distanceYards(from, hole.green.front),
    center: distanceYards(from, hole.green.center),
    back: distanceYards(from, hole.green.back),
  };
}

function* ringPoints(ring: Position[]): Generator<LngLat> {
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x0, y0] = ring[i] as [number, number];
    const [x1, y1] = ring[i + 1] as [number, number];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / STEP_DEG));
    for (let k = 0; k < n; k++) yield [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n];
  }
}

function outerRings(geom: GeoJSON.Geometry): Position[][] {
  if (geom.type === 'Polygon') return geom.coordinates.slice(0, 1);
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]!);
  return [];
}

/**
 * Bunkers and water on this hole that lie roughly between the player and the green
 * (within ±15° of the line to the green centre). front = nearest edge, back = farthest edge.
 */
export function hazardDistances(
  from: LngLat,
  hole: Hole,
  features: FeatureCollection,
): HazardDistance[] {
  const toGreen = bearingDeg(from, hole.green.center);
  const out: HazardDistance[] = [];
  for (const f of features.features) {
    const p = f.properties as FeatureProps | null;
    if (!p || p.hole !== hole.number || !HAZARD_KINDS.includes(p.kind) || !f.geometry) continue;
    let front = Infinity;
    let back = -Infinity;
    for (const ring of outerRings(f.geometry)) {
      for (const pt of ringPoints(ring)) {
        if (bearingDiff(bearingDeg(from, pt), toGreen) > CONE_DEG) continue;
        const d = distanceYards(from, pt);
        if (d < front) front = d;
        if (d > back) back = d;
      }
    }
    if (front !== Infinity)
      out.push({ id: p.id, kind: p.kind, frontYards: front, backYards: back });
  }
  return out.sort((a, b) => a.frontYards - b.frontYards);
}
