import type { LngLat } from '@golf/course-schema';
import { useEffect, useState } from 'react';

export interface LocationState {
  fix: {
    at: LngLat;
    accuracyM: number;
    speedMps: number | null; // ground speed, when the device reports it
    headingDeg: number | null; // course over ground (0 = north), when moving
  } | null;
  status: 'pending' | 'ok' | 'denied' | 'unavailable';
}

/** Live GPS via the browser Geolocation API (native location comes in M5). */
export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>(() =>
    typeof navigator !== 'undefined' && navigator.geolocation
      ? { fix: null, status: 'pending' }
      : { fix: null, status: 'unavailable' },
  );
  useEffect(() => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) return;
    const id = geo.watchPosition(
      (p) =>
        setState({
          fix: {
            at: [p.coords.longitude, p.coords.latitude],
            accuracyM: p.coords.accuracy,
            speedMps: Number.isFinite(p.coords.speed) ? p.coords.speed : null,
            headingDeg: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
          },
          status: 'ok',
        }),
      (e) =>
        setState((s) => ({
          fix: e.code === 1 ? null : s.fix,
          status: e.code === 1 ? 'denied' : s.fix ? 'ok' : 'unavailable',
        })),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => geo.clearWatch(id);
  }, []);
  return state;
}
