import { STD_AIR } from '@golf/physics';
import { expect, test } from 'vitest';
import { shotStats } from './shotStats';

const calm = { ...STD_AIR };

test('flatCalmPlaysItsLength', () => {
  const s = shotStats({ yards: 150, bearing: 0, dz: 0 }, calm, true);
  expect(s.straight).toBe(150);
  expect(Math.abs(s.playsLike - 150)).toBeLessThanOrEqual(1);
  expect(Math.abs(s.elevation)).toBeLessThanOrEqual(1);
  expect(s.club).toMatch(/Iron|PW|Wood|Hybrid|GW|SW|LW/);
});

test('uphillPlaysLonger', () => {
  const s = shotStats({ yards: 150, bearing: 0, dz: 10 }, calm, true);
  expect(s.elevation).toBeGreaterThan(5);
  expect(s.playsLike).toBeGreaterThan(155);
});

test('headwindLongerTailwindShorter', () => {
  const into = shotStats(
    { yards: 150, bearing: 0, dz: 0 },
    { ...calm, windMph: 15, windFromDeg: 0 },
    true,
  );
  const down = shotStats(
    { yards: 150, bearing: 0, dz: 0 },
    { ...calm, windMph: 15, windFromDeg: 180 },
    true,
  );
  expect(into.wind).toBeGreaterThan(5);
  expect(down.wind).toBeLessThan(-3);
});

test('weatherOffIgnoresWindAndAir', () => {
  const s = shotStats(
    { yards: 150, bearing: 0, dz: 5 },
    { tempF: 35, rh: 90, hPa: 990, windMph: 20, windFromDeg: 0 },
    false,
  );
  expect(s.wind).toBe(0);
  expect(s.air).toBe(0);
  expect(s.elevation).toBeGreaterThan(0);
});

test('beyondDriverStillGivesSensibleNumbers', () => {
  const s = shotStats(
    { yards: 420, bearing: 0, dz: 0 },
    { ...calm, windMph: 10, windFromDeg: 0 },
    true,
  );
  expect(s.straight).toBe(420);
  expect(s.wind).toBeGreaterThan(0);
  expect(s.playsLike).toBeGreaterThan(420);
  expect(s.club).toBe('Driver');
});
