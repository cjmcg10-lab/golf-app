import type { Course, LngLat } from '@golf/course-schema';
import type { FeatureCollection } from 'geojson';

/** What the scene shows for the current shot. Changing it never moves the camera. */
export interface ShotState {
  tee: LngLat | null; // tee markers
  ball: LngLat | null; // the golfer stands here, facing `aim`
  target: LngLat | null; // landing spot marker
  aim: LngLat | null; // where the golfer faces (the target, else the green)
  flight: [number, number, number][] | null; // predicted flight from the ball: x east, y north, z up (m)
  /** GPS says the player is driving: show them seated in a cart here, heading = course over ground. */
  driving: { at: LngLat; headingDeg: number } | null;
}

export interface CourseSceneHandle {
  /** Whole course. */
  overview(secs?: number): void;
  /** Frame a shot from `from` toward `to` (3D: from behind; 2D: top-down with `to` up). */
  frame(from: LngLat, to: LngLat, secs?: number): void;
  setShot(s: ShotState): void;
  setFlat(flat: boolean): void;
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
