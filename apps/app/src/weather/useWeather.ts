import { STD_AIR, type Weather } from '@golf/physics';
import { useEffect, useState } from 'react';
import { fromOpenMeteo, openMeteoUrl } from './openMeteo';

/** Current conditions at the course; standard air until (or unless) the live fetch succeeds. */
export function useWeather(at: [number, number]): { wx: Weather; live: boolean } {
  const [state, setState] = useState({ wx: STD_AIR, live: false });
  const [lon, lat] = at;
  useEffect(() => {
    let alive = true;
    fetch(openMeteoUrl([lon, lat]))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const wx = fromOpenMeteo(j);
        if (alive && wx) setState({ wx, live: true });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lon, lat]);
  return state;
}
