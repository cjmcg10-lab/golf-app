export type LngLat = [lng: number, lat: number];
export type FeatureKind =
  | 'green'
  | 'fairway'
  | 'tee'
  | 'bunker'
  | 'water'
  | 'rough'
  | 'trees'
  | 'cartpath'
  | 'ob'
  | 'clubhouse';
export type Source = 'osm' | 'ai' | 'manual';

export interface FeatureProps {
  id: string;
  kind: FeatureKind;
  hole: number | null;
  source: Source;
  confidence: number;
}

/** phone is E.164, e.g. +18606287032 */
export interface Contact {
  label: string;
  phone: string;
}

export interface TeeSet {
  id: string;
  name: string;
  color: string | null;
  rating: number | null;
  slope: number | null;
}

export interface Hole {
  number: number;
  par: number;
  handicap: number | null;
  /** tee → (dogleg points) → green centre */
  playLine: LngLat[];
  measuredYards: number;
  /** per TeeSet.id, from the scorecard */
  yards: Record<string, number | null>;
  pin: LngLat;
  green: { front: LngLat; center: LngLat; back: LngLat };
  featureIds: string[];
}

export interface Course {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  address: string;
  location: LngLat;
  bounds: [w: number, s: number, e: number, n: number];
  par: number;
  website: string | null;
  contacts: Contact[];
  teeSets: TeeSet[];
  holes: Hole[];
  imagery: { tiles: string; minzoom: number; maxzoom: number; attribution: string } | null;
  elevation: {
    course: string;
    greens: Record<string, string>;
    greenSource: 'lidar' | 'dem';
  } | null;
  attribution: string[];
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export const FEATURE_KINDS: readonly FeatureKind[] = [
  'green',
  'fairway',
  'tee',
  'bunker',
  'water',
  'rough',
  'trees',
  'cartpath',
  'ob',
  'clubhouse',
];
