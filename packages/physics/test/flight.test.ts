import { describe, expect, test } from 'vitest';
import { CLUBS, STD_AIR, airDensity, caddy, carryYards, club, fly, rollYards } from '../src';

const carry = (name: string, wx = STD_AIR) => carryYards(fly(club(name), 1, 0, wx, 0));

describe('ball flight', () => {
  test('stockCarriesMatchTourAverages', () => {
    // PGA Tour averages (TrackMan): 7 iron 172, PW 136, driver 275
    expect(Math.abs(carry('7 Iron') - 172)).toBeLessThanOrEqual(6);
    expect(Math.abs(carry('PW') - 136)).toBeLessThanOrEqual(6);
    expect(Math.abs(carry('Driver') - 275)).toBeLessThanOrEqual(8);
  });

  test('clubsGetLongerThroughTheBag', () => {
    const c = CLUBS.map((k) => carryYards(fly(k, 1, 0, STD_AIR, 0)));
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThan(c[i - 1]!);
  });

  test('standardAirDensity', () => {
    expect(airDensity(STD_AIR)).toBeCloseTo(1.22, 2);
  });

  test('thinAirAndHeatFlyFurther', () => {
    expect(carry('7 Iron', { ...STD_AIR, hPa: 840 })).toBeGreaterThan(carry('7 Iron') + 10);
    expect(carry('7 Iron', { ...STD_AIR, tempF: 95 })).toBeGreaterThan(carry('7 Iron', { ...STD_AIR, tempF: 35 }));
  });

  test('headwindShortensTailwindLengthens', () => {
    // shot heads north (bearing 0); wind "from" 0 is a headwind
    const into = carry('7 Iron', { ...STD_AIR, windMph: 15, windFromDeg: 0 });
    const down = carry('7 Iron', { ...STD_AIR, windMph: 15, windFromDeg: 180 });
    expect(into).toBeLessThan(carry('7 Iron') - 8);
    expect(down).toBeGreaterThan(carry('7 Iron') + 5);
  });

  test('crosswindPushesBallSideways', () => {
    const r = fly(club('7 Iron'), 1, 0, { ...STD_AIR, windMph: 15, windFromDeg: 270 }, 0); // from the west
    expect(r.x).toBeGreaterThan(5); // pushed east
  });

  test('ballRollsLessOnGreenThanFairway', () => {
    const r = fly(club('7 Iron'), 1, 0, STD_AIR, 0);
    expect(rollYards(r, 'green')).toBeLessThan(rollYards(r, 'fairway'));
    expect(rollYards(r, 'water')).toBe(0);
  });
});

describe('caddy', () => {
  test('stillAirPicksMatchingClub', () => {
    const k = caddy(172, 0, 0, STD_AIR);
    expect(k.club.name).toBe('7 Iron');
    expect(Math.abs(k.playsLike - 172)).toBeLessThanOrEqual(2);
  });

  test('landsOnTargetInWindAndAimsOff', () => {
    const wx = { ...STD_AIR, windMph: 12, windFromDeg: 270, tempF: 45 };
    const k = caddy(150, 30, -3, wx);
    const b = (30 * Math.PI) / 180;
    const tx = Math.sin(b) * 150 * 0.9144, ty = Math.cos(b) * 150 * 0.9144;
    expect(Math.hypot(k.flight.x - tx, k.flight.y - ty) / 0.9144).toBeLessThan(3);
    expect(k.aimDeg).toBeLessThan(30); // aims left (into the west wind)
  });

  test('plays-likeExceedsDistanceIntoWind', () => {
    const k = caddy(150, 0, 0, { ...STD_AIR, windMph: 15, windFromDeg: 0 });
    expect(k.playsLike).toBeGreaterThan(160);
  });
});
