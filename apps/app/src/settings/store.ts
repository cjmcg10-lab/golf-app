import type { LngLat } from '@golf/course-schema';

export interface Settings {
  weather: boolean; // count wind, temperature, humidity and pressure in plays-like
  hud: 'clean' | 'detailed';
  elevUnit: 'ft' | 'm';
}

export const DEFAULT_SETTINGS: Settings = { weather: true, hud: 'clean', elevUnit: 'ft' };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked storage (private mode, sandboxed frames)
  }
};

function read(key: string, s: Storage | null): unknown {
  try {
    const v = s?.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown, s: Storage | null) {
  try {
    if (value === null) s?.removeItem(key);
    else s?.setItem(key, JSON.stringify(value));
  } catch {
    // full or blocked: settings just won't stick
  }
}

export function loadSettings(s: Storage | null = local()): Settings {
  const v = read('golf.settings', s) as Partial<Settings> | null;
  if (!v || typeof v !== 'object') return DEFAULT_SETTINGS;
  return {
    weather: typeof v.weather === 'boolean' ? v.weather : DEFAULT_SETTINGS.weather,
    hud: v.hud === 'clean' || v.hud === 'detailed' ? v.hud : DEFAULT_SETTINGS.hud,
    elevUnit: v.elevUnit === 'ft' || v.elevUnit === 'm' ? v.elevUnit : DEFAULT_SETTINGS.elevUnit,
  };
}

export const saveSettings = (v: Settings, s: Storage | null = local()) =>
  write('golf.settings', v, s);

/** Player-moved tee positions, per course and hole. */
const teeKey = (course: string, hole: number) => `golf.tee.${course}.${hole}`;
export function teeFor(course: string, hole: number, s: Storage | null = local()): LngLat | null {
  const v = read(teeKey(course, hole), s);
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')
    ? (v as LngLat)
    : null;
}
export const setTee = (course: string, hole: number, p: LngLat, s: Storage | null = local()) =>
  write(teeKey(course, hole), p, s);
export const clearTee = (course: string, hole: number, s: Storage | null = local()) =>
  write(teeKey(course, hole), null, s);
