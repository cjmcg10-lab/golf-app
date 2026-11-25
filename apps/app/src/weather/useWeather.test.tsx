// @vitest-environment jsdom
import { STD_AIR } from '@golf/physics';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useWeather } from './useWeather';

afterEach(() => vi.unstubAllGlobals());

test('liveConditions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 70,
          relative_humidity_2m: 40,
          surface_pressure: 1000,
          wind_speed_10m: 8,
          wind_direction_10m: 270,
        },
      }),
    })),
  );
  const { result } = renderHook(() => useWeather([-72.86, 41.57]));
  expect(result.current).toEqual({ wx: STD_AIR, live: false });
  await waitFor(() => expect(result.current.live).toBe(true));
  expect(result.current.wx).toEqual({ tempF: 70, rh: 40, hPa: 1000, windMph: 8, windFromDeg: 270 });
});

test('fallsBackToStandardAir', async () => {
  const f = vi.fn(async () => {
    throw new Error('offline');
  });
  vi.stubGlobal('fetch', f);
  const { result } = renderHook(() => useWeather([-72.86, 41.57]));
  await waitFor(() => expect(f).toHaveBeenCalled());
  expect(result.current).toEqual({ wx: STD_AIR, live: false });
});
