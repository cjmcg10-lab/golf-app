/** Local flat frame in metres: e = east, n = north, from an origin. Accurate to cm over a course. */
export interface Frame {
  toEN(lon: number, lat: number): [number, number];
  toLonLat(e: number, n: number): [number, number];
}

export function makeFrame(lon0: number, lat0: number): Frame {
  const p = (lat0 * Math.PI) / 180;
  const mLat = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p);
  const mLon = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
  return {
    toEN: (lon, lat) => [(lon - lon0) * mLon, (lat - lat0) * mLat],
    toLonLat: (e, n) => [lon0 + e / mLon, lat0 + n / mLat],
  };
}
