/**
 * Golf ball flight: drag + Magnus lift with spin decay, a log wind profile and air density
 * from the weather. Coordinates: x east, y north, z up, metres, from the ball.
 */

export interface Club {
  name: string;
  mph: number; // ball speed
  launch: number; // degrees
  rpm: number; // backspin
}

export interface Weather {
  tempF: number;
  rh: number; // relative humidity %
  hPa: number; // station (surface) pressure: already includes altitude
  windMph: number; // at 10 m
  windFromDeg: number; // compass direction the wind blows from
}

export interface Flight {
  x: number;
  y: number;
  t: number; // seconds in the air
  apex: number; // metres above the start
  landAngle: number; // degrees below horizontal
  vh: number; // horizontal speed at landing, m/s
  pts: [number, number, number][]; // sampled path, start → landing
}

export type Surface = 'green' | 'fairway' | 'tee' | 'rough' | 'bunker' | 'water';

const MPH = 0.44704;
export const YARD = 0.9144;
const MASS = 0.04593;
const RADIUS = 0.021335;
const AREA = Math.PI * RADIUS * RADIUS;

/** Stock shots: PGA Tour TrackMan averages (wedges below PW extrapolated). */
export const CLUBS: readonly Club[] = (
  [
    ['Driver', 167, 10.9, 2686],
    ['3 Wood', 158, 9.2, 3655],
    ['5 Wood', 152, 9.4, 4350],
    ['Hybrid', 146, 10.2, 4437],
    ['4 Iron', 137, 11.0, 4836],
    ['5 Iron', 132, 12.1, 5361],
    ['6 Iron', 127, 14.1, 6231],
    ['7 Iron', 120, 16.3, 7097],
    ['8 Iron', 115, 18.1, 7998],
    ['9 Iron', 109, 20.4, 8647],
    ['PW', 102, 24.2, 9304],
    ['GW', 95, 27, 9800],
    ['SW', 87, 30, 10200],
    ['LW', 77, 33, 10500],
  ] as const
).map(([name, mph, launch, rpm]) => ({ name, mph, launch, rpm }));

export const club = (name: string): Club => {
  const c = CLUBS.find((k) => k.name === name);
  if (!c) throw new Error(`unknown club ${name}`);
  return c;
};

/** 59°F, 50% humidity, sea-level pressure, calm. */
export const STD_AIR: Weather = { tempF: 59, rh: 50, hPa: 1013.25, windMph: 0, windFromDeg: 0 };

export function airDensity({ tempF, rh, hPa }: Weather): number {
  const tc = ((tempF - 32) * 5) / 9;
  const tk = tc + 273.15;
  const vapour = (rh / 100) * 6.1078 * 10 ** ((7.5 * tc) / (tc + 237.3)) * 100;
  return (hPa * 100 - vapour) / (287.058 * tk) + vapour / (461.495 * tk);
}

/**
 * Fly one shot. speedFactor scales ball speed and spin (a softer swing); aimDeg is the compass
 * bearing it starts on; the ball lands when it comes down to landZ (metres, relative to start).
 */
export function fly(c: Club, speedFactor: number, aimDeg: number, wx: Weather, landZ = 0): Flight {
  const rho = airDensity(wx);
  const v0 = c.mph * MPH * speedFactor;
  const la = (c.launch * Math.PI) / 180;
  const az = (aimDeg * Math.PI) / 180;
  const dx = Math.sin(az);
  const dy = Math.cos(az);
  const p = [0, 0, 0];
  const v = [v0 * Math.cos(la) * dx, v0 * Math.cos(la) * dy, v0 * Math.sin(la)];
  let w = (c.rpm * speedFactor * 2 * Math.PI) / 60;
  const axis = [dy, -dx, 0]; // backspin axis = direction × up
  const from = (wx.windFromDeg * Math.PI) / 180;
  const w10 = wx.windMph * MPH;
  const wind = [-Math.sin(from) * w10, -Math.cos(from) * w10];
  const dt = 0.005;
  const pts: [number, number, number][] = [[0, 0, 0]];
  let t = 0;
  let apex = 0;
  let step = 0;
  while (t < 15) {
    const k = Math.log(Math.max(p[2]!, 1) / 0.03) / Math.log(10 / 0.03); // wind grows with height
    const rel = [v[0]! - wind[0]! * k, v[1]! - wind[1]! * k, v[2]!];
    const s = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
    const spinRatio = (w * RADIUS) / s;
    const cd = 0.21 + 0.26 * spinRatio;
    const cl = Math.min(0.32, 0.6 * spinRatio ** 0.55);
    const q = (0.5 * rho * AREA * s) / MASS;
    const lift = [
      axis[1]! * rel[2]! - axis[2]! * rel[1]!,
      axis[2]! * rel[0]! - axis[0]! * rel[2]!,
      axis[0]! * rel[1]! - axis[1]! * rel[0]!,
    ];
    for (let i = 0; i < 3; i++) {
      const a = -q * cd * rel[i]! + q * cl * lift[i]! - (i === 2 ? 9.81 : 0);
      v[i]! += a * dt;
      p[i]! += v[i]! * dt;
    }
    w *= 1 - 0.04 * dt;
    t += dt;
    apex = Math.max(apex, p[2]!);
    if (++step % 6 === 0) pts.push([p[0]!, p[1]!, p[2]!]);
    if (v[2]! < 0 && p[2]! <= landZ) break;
  }
  pts.push([p[0]!, p[1]!, p[2]!]);
  const vh = Math.hypot(v[0]!, v[1]!);
  return {
    x: p[0]!,
    y: p[1]!,
    t,
    apex,
    landAngle: (Math.atan2(-v[2]!, vh) * 180) / Math.PI,
    vh,
    pts,
  };
}

export const carryYards = (f: Pick<Flight, 'x' | 'y'>) => Math.hypot(f.x, f.y) / YARD;

const FIRMNESS: Record<Surface, number> = {
  green: 1.2,
  fairway: 3.0,
  tee: 3.0,
  rough: 0.9,
  bunker: 0.1,
  water: 0,
};

/** Bounce and roll after landing: faster, flatter landings on firmer ground roll further. */
export const rollYards = (f: Flight, surface: Surface) =>
  ((f.vh * FIRMNESS[surface] * (1 - Math.sin((f.landAngle * Math.PI) / 180)) ** 1.2) / YARD) * 0.85;

export interface Advice {
  club: Club;
  speedFactor: number; // 1 = full swing
  aimDeg: number;
  flight: Flight;
  playsLike: number; // yards the same swing carries in still, standard air on flat ground
}

/** Pick the shortest club that reaches, the swing that lands on target, and the aim for wind. */
export function caddy(distYds: number, bearingDeg: number, dz: number, wx: Weather): Advice {
  const b = (bearingDeg * Math.PI) / 180;
  const along = (f: Flight) => (f.x * Math.sin(b) + f.y * Math.cos(b)) / YARD;
  const side = (f: Flight) => (f.x * Math.cos(b) - f.y * Math.sin(b)) / YARD;
  for (let i = CLUBS.length - 1; i >= 0; i--) {
    const c = CLUBS[i]!;
    if (i > 0 && along(fly(c, 1, bearingDeg, wx, dz)) < distYds) continue;
    let aim = bearingDeg;
    let f = 1;
    for (let pass = 0; pass < 4; pass++) {
      let lo = 0.45;
      let hi = 1;
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2;
        if (along(fly(c, mid, aim, wx, dz)) < distYds) lo = mid;
        else hi = mid;
      }
      f = (lo + hi) / 2;
      aim -= (Math.atan2(side(fly(c, f, aim, wx, dz)), distYds) * 180) / Math.PI;
    }
    return {
      club: c,
      speedFactor: f,
      aimDeg: aim,
      flight: fly(c, f, aim, wx, dz),
      playsLike: carryYards(fly(c, f, 0, STD_AIR, 0)),
    };
  }
  throw new Error('unreachable: the driver always returns');
}
