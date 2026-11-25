import type { Weather } from '@golf/physics';

/** Open-Meteo current conditions (free, no key; non-commercial). Our own cached endpoint replaces it later. */
export const openMeteoUrl = ([lon, lat]: [number, number]) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  '&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m' +
  '&wind_speed_unit=mph&temperature_unit=fahrenheit';

export function fromOpenMeteo(json: unknown): Weather | null {
  const c = (json as { current?: Record<string, unknown> } | null)?.current;
  if (!c) return null;
  const n = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : null);
  const w = {
    tempF: n('temperature_2m'),
    rh: n('relative_humidity_2m'),
    hPa: n('surface_pressure'),
    windMph: n('wind_speed_10m'),
    windFromDeg: n('wind_direction_10m'),
  };
  return Object.values(w).every((v) => v !== null) ? (w as Weather) : null;
}
