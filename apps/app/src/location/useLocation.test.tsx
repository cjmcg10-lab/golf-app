// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useLocation } from './useLocation';

const original = navigator.geolocation;
afterEach(() =>
  Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true }),
);
const setGeo = (geo: unknown) =>
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });

test('reportsFix', () => {
  let ok: PositionCallback = () => {};
  const clear = vi.fn();
  setGeo({ watchPosition: (s: PositionCallback) => ((ok = s), 7), clearWatch: clear });
  const { result, unmount } = renderHook(() => useLocation());
  expect(result.current.status).toBe('pending');
  act(() =>
    ok({ coords: { longitude: -72.86, latitude: 41.56, accuracy: 12 } } as GeolocationPosition),
  );
  expect(result.current).toEqual({
    fix: { at: [-72.86, 41.56], accuracyM: 12, speedMps: null, headingDeg: null },
    status: 'ok',
  });
  unmount();
  expect(clear).toHaveBeenCalledWith(7);
});

test('deniedPermission', () => {
  let fail: PositionErrorCallback = () => {};
  setGeo({
    watchPosition: (_s: unknown, e: PositionErrorCallback) => ((fail = e), 1),
    clearWatch: () => {},
  });
  const { result } = renderHook(() => useLocation());
  act(() => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
  expect(result.current.status).toBe('denied');
});

test('noGeolocation', () => {
  setGeo(undefined);
  const { result } = renderHook(() => useLocation());
  expect(result.current.status).toBe('unavailable');
});

test('reportsSpeedAndHeadingWhenMoving', () => {
  let ok: PositionCallback = () => {};
  setGeo({ watchPosition: (s: PositionCallback) => ((ok = s), 1), clearWatch: () => {} });
  const { result } = renderHook(() => useLocation());
  act(() =>
    ok({
      coords: { longitude: -72.86, latitude: 41.56, accuracy: 5, speed: 4.2, heading: 270 },
    } as GeolocationPosition),
  );
  expect(result.current.fix?.speedMps).toBe(4.2);
  expect(result.current.fix?.headingDeg).toBe(270);
});
