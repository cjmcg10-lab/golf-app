import type { LngLat } from '@golf/course-schema';
import { holeBearing } from '@golf/geo';
import type { FeatureCollection } from 'geojson';
import {
  AttributionControl,
  Map as MlMap,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { FEATURE_COLORS } from '../theme';
import type { CourseMapProps } from './types';

const kindColor = [
  'match',
  ['get', 'kind'],
  ...Object.entries(FEATURE_COLORS).flat(),
  '#ff00ff',
] as unknown as string;

// served from public/ (see scripts/copy-courses.mjs)
if (typeof window !== 'undefined') setWorkerUrl('/maplibre-gl-worker.mjs');

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
const point = (p: LngLat, props: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  properties: props,
  geometry: { type: 'Point' as const, coordinates: p },
});

export function CourseMap({
  course,
  features,
  holeNumber,
  userLocation,
  target,
  onTapPoint,
}: CourseMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const pending = useRef<(() => void)[]>([]);
  const tapRef = useRef(onTapPoint);
  tapRef.current = onTapPoint;

  // create the map once per course
  useEffect(() => {
    if (!el.current) return;
    const [w, s, e, n] = course.bounds;
    const m = new MlMap({
      container: el.current,
      bounds: [
        [w, s],
        [e, n],
      ],
      attributionControl: false,
      maxZoom: 20,
      dragRotate: false,
      pitchWithRotate: false,
      style: {
        version: 8,
        sources: course.imagery
          ? {
              naip: {
                type: 'raster',
                tiles: [course.imagery.tiles],
                tileSize: 256,
                // only request tiles that exist (others would 404 into the SPA fallback)
                bounds: course.bounds,
                minzoom: course.imagery.minzoom,
                maxzoom: course.imagery.maxzoom,
                attribution: '© OpenStreetMap contributors · USDA NAIP · USGS',
              },
            }
          : {},
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#1d2b20' } },
          ...(course.imagery ? [{ id: 'naip', type: 'raster' as const, source: 'naip' }] : []),
        ],
      },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new AttributionControl({ compact: true }), 'top-right');
    m.on('load', () => {
      m.addSource('features', { type: 'geojson', data: features });
      m.addLayer({
        id: 'fill',
        type: 'fill',
        source: 'features',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'kind'], 'trees']],
        paint: { 'fill-color': kindColor, 'fill-opacity': 0.18 },
      });
      m.addLayer({
        id: 'outline',
        type: 'line',
        source: 'features',
        filter: ['!=', ['get', 'kind'], 'trees'],
        paint: { 'line-color': kindColor, 'line-width': 1.5, 'line-opacity': 0.9 },
      });
      m.addSource('play', { type: 'geojson', data: empty });
      m.addLayer({
        id: 'play',
        type: 'line',
        source: 'play',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-dasharray': [1, 2],
          'line-opacity': 0.8,
        },
      });
      m.addSource('marks', { type: 'geojson', data: empty });
      m.addLayer({
        id: 'marks',
        type: 'circle',
        source: 'marks',
        paint: {
          'circle-radius': ['match', ['get', 'role'], 'user', 8, 'target', 7, 5],
          'circle-color': [
            'match',
            ['get', 'role'],
            'user',
            '#2f8cff',
            'target',
            '#ffd23f',
            '#ffffff',
          ],
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1.5,
        },
      });
      m.addLayer({
        id: 'labels',
        type: 'symbol',
        source: 'marks',
        filter: ['has', 'label'],
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, -1.3] },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 },
      });
      ready.current = true;
      pending.current.splice(0).forEach((f) => f());
    });
    m.on('click', (e) => tapRef.current?.([e.lngLat.lng, e.lngLat.lat]));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
      pending.current = [];
    };
  }, [course, features]);

  // overlays follow props
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const hole = holeNumber ? course.holes.find((h) => h.number === holeNumber) : undefined;
      const lines = hole ? [hole] : course.holes;
      (m.getSource('play') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: lines.map((h) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: h.playLine },
        })),
      });
      const marks = [
        ...lines.map((h) => point(h.pin, { role: 'pin', label: hole ? '' : String(h.number) })),
        ...(userLocation ? [point(userLocation, { role: 'user' })] : []),
        ...(target ? [point(target, { role: 'target' })] : []),
      ];
      (m.getSource('marks') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: marks,
      });
    };
    if (ready.current) apply();
    else pending.current.push(apply);
  }, [course, holeNumber, userLocation, target]);

  // camera fits the hole only when the hole changes, so GPS updates don't undo the user's pan/zoom
  useEffect(() => {
    const m = map.current;
    const hole = holeNumber ? course.holes.find((h) => h.number === holeNumber) : undefined;
    if (!m || !hole) return;
    const fit = () => {
      const pts = [...hole.playLine, hole.green.back];
      const lons = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      const b: LngLatBoundsLike = [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ];
      const cam = m.cameraForBounds(b, { padding: 40, bearing: holeBearing(hole) });
      if (cam) m.jumpTo({ ...cam, bearing: holeBearing(hole) });
    };
    if (ready.current) fit();
    else pending.current.push(fit);
  }, [course, holeNumber]);

  return <div ref={el} data-testid="course-map" style={{ position: 'absolute', inset: 0 }} />;
}
