import { expect, test } from 'vitest';
import { fromOpenMeteo, openMeteoUrl } from './openMeteo';

test('mapsCurrentConditions', () => {
  const w = fromOpenMeteo({
    current: {
      time: '2026-11-25T06:00',
      temperature_2m: 29.7,
      relative_humidity_2m: 59,
      surface_pressure: 1026.2,
      wind_speed_10m: 4.7,
      wind_direction_10m: 32,
    },
  });
  expect(w).toEqual({ tempF: 29.7, rh: 59, hPa: 1026.2, windMph: 4.7, windFromDeg: 32 });
});

test('rejectsIncomplete', () => {
  expect(fromOpenMeteo({ current: { temperature_2m: 50 } })).toBeNull();
  expect(fromOpenMeteo(null)).toBeNull();
});

test('urlAsksForImperialUnits', () => {
  const u = openMeteoUrl([-72.86, 41.57]);
  expect(u).toContain('latitude=41.57');
  expect(u).toContain('wind_speed_unit=mph');
  expect(u).toContain('temperature_unit=fahrenheit');
});
