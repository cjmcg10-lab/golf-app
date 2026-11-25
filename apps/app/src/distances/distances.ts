import type { Hole, LngLat } from '@golf/course-schema';
import { distanceYards, greenDistances, hazardDistances, type HazardDistance } from '@golf/geo';
import type { FeatureCollection } from 'geojson';
import type { LocationState } from '../location/useLocation';

export const OFF_COURSE_YARDS = 1000;
const LOW_ACCURACY_M = 30;

export interface Distances {
  origin: 'gps' | 'tee' | 'ball';
  from: LngLat;
  offCourse: boolean;
  green: { front: number; center: number; back: number } | null;
  hazards: HazardDistance[];
  toTarget: number | null;
  targetToGreen: number | null;
  accuracyYards: number | null;
  notice: string | null;
}

export function computeDistances(
  hole: Hole,
  features: FeatureCollection,
  loc: LocationState,
  target: LngLat | null,
  opts: { tee?: LngLat | null; ball?: LngLat | null } = {},
): Distances {
  const tee = opts.tee ?? hole.playLine[0]!;
  const ball = opts.ball ?? null;
  const gps = loc.fix?.at ?? null;
  const offCourse = !ball && !!gps && distanceYards(gps, hole.green.center) > OFF_COURSE_YARDS;
  const useGps = !ball && !!gps && !offCourse;
  const from = ball ?? (useGps ? gps : tee);
  let notice: string | null = null;
  if (offCourse) notice = 'You’re not on the course';
  else if (!gps && !ball)
    notice =
      loc.status === 'pending'
        ? 'Finding your location — distances are from the tee'
        : 'Location is off — distances are from the tee';
  return {
    origin: ball ? 'ball' : useGps ? 'gps' : 'tee',
    from,
    offCourse,
    green: offCourse ? null : greenDistances(from, hole),
    hazards: offCourse ? [] : hazardDistances(from, hole, features),
    toTarget: target ? distanceYards(from, target) : null,
    targetToGreen: target ? distanceYards(target, hole.green.center) : null,
    accuracyYards:
      useGps && loc.fix && loc.fix.accuracyM > LOW_ACCURACY_M
        ? Math.round(loc.fix.accuracyM / 0.9144)
        : null,
    notice,
  };
}
