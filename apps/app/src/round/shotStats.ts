import { STD_AIR, caddy, type Advice, type Weather } from '@golf/physics';

export interface ShotStats {
  straight: number; // yards over the ground
  playsLike: number; // yards it plays, after the adjustments below
  elevation: number; // yards added by the height change
  wind: number; // yards added by the wind
  air: number; // yards added by temperature, humidity and pressure
  club: string;
  swingPct: number;
  advice: Advice;
}

// past this the caddy can't find a swing that reaches; wind and air are worked out on a shot
// this long and scaled up, elevation is taken as is
const MAX_SIM = 250;

/**
 * Plays-like distance and its parts. Each part is the change in "standard-air, flat-ground carry"
 * the ball-flight model needs once that factor is added.
 */
export function shotStats(
  m: { yards: number; bearing: number; dz: number },
  wx: Weather,
  useWeather: boolean,
): ShotStats {
  const d = Math.min(m.yards, MAX_SIM);
  const scale = m.yards / d;
  const pl = (dz: number, w: Weather) => caddy(d, m.bearing, dz, w).playsLike;
  const flat = pl(0, STD_AIR);
  const withElev = pl(m.dz, STD_AIR);
  const elevation = withElev - flat;
  let wind = 0;
  let air = 0;
  const windOnly = { ...STD_AIR, windMph: wx.windMph, windFromDeg: wx.windFromDeg };
  if (useWeather) {
    const withWind = pl(m.dz, windOnly);
    wind = (withWind - withElev) * scale;
    air = (pl(m.dz, wx) - withWind) * scale;
  }
  const advice = caddy(m.yards, m.bearing, m.dz, useWeather ? wx : STD_AIR);
  return {
    straight: Math.round(m.yards),
    playsLike: m.yards + elevation + wind + air,
    elevation,
    wind,
    air,
    club: advice.club.name,
    swingPct: Math.round(advice.speedFactor * 100),
    advice,
  };
}
