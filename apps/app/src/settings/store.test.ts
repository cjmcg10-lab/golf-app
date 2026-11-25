import { beforeEach, expect, test } from 'vitest';
import { clearTee, DEFAULT_SETTINGS, loadSettings, saveSettings, teeFor, setTee } from './store';

const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
beforeEach(() => mem.clear());

test('settingsDefaultThenPersist', () => {
  expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  saveSettings({ ...DEFAULT_SETTINGS, weather: false }, storage);
  expect(loadSettings(storage).weather).toBe(false);
});

test('corruptSettingsFallBackToDefaults', () => {
  mem.set('golf.settings', '{nope');
  expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  mem.set('golf.settings', JSON.stringify({ hud: 'weird', weather: 'yes' }));
  expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
});

test('teeOverridePerCourseAndHole', () => {
  expect(teeFor('c', 3, storage)).toBeNull();
  setTee('c', 3, [-72.1, 41.5], storage);
  expect(teeFor('c', 3, storage)).toEqual([-72.1, 41.5]);
  expect(teeFor('c', 4, storage)).toBeNull();
  clearTee('c', 3, storage);
  expect(teeFor('c', 3, storage)).toBeNull();
});
