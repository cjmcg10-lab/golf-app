import type { LngLat } from '@golf/course-schema';

const R = 6371008.8; // mean Earth radius, m
const YARD = 0.9144;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (haversine) distance in yards. */
export function distanceYards(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.min(1, Math.sqrt(h)))) / YARD;
}

/** Initial bearing from a to b, degrees clockwise from north, 0..360. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const φ1 = rad(a[1]);
  const φ2 = rad(b[1]);
  const Δλ = rad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest absolute difference between two bearings, 0..180. */
export function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
