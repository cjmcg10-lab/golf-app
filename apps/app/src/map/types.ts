import type { Course, LngLat } from '@golf/course-schema';
import type { FeatureCollection } from 'geojson';

export interface CourseMapProps {
  course: Course;
  features: FeatureCollection;
  /** when set, the map frames this hole with the tee at the bottom */
  holeNumber?: number;
  bearing?: number;
  userLocation?: LngLat | null;
  target?: LngLat | null;
  onTapPoint?: (p: LngLat) => void;
}
