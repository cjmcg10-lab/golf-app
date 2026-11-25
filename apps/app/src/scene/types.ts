import type { Course, LngLat } from '@golf/course-schema';
import type { Advice } from '@golf/physics';
import type { FeatureCollection } from 'geojson';

export interface ShotSetup {
  start: LngLat;
  target: LngLat | null; // null = aim at the green
  aim: LngLat; // where the golfer faces (target, or the green)
  advice: Advice | null; // predicted flight is drawn when present
}

export interface CourseSceneHandle {
  overview(): void;
  focusHole(n: number): void;
  setShot(s: ShotSetup): void;
  /** Swing, fly and roll; resolves with where the ball stopped (null = in the water). */
  hit(a: Advice): Promise<LngLat | null>;
  /** Golfer climbs in, the cart drives the cart paths, golfer gets out at `to` facing `face`. */
  driveTo(to: LngLat, face: LngLat): Promise<void>;
  /** Yards, bearing and height change (m) from a to b on the terrain; null until loaded. */
  measure(a: LngLat, b: LngLat): { yards: number; bearing: number; dz: number } | null;
}

export interface CourseSceneProps {
  course: Course;
  features: FeatureCollection;
  onTapGround?: (p: LngLat) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  /** Where the look-at point sits, as a fraction of the height from the top (default 0.5). */
  focusTop?: number;
}
