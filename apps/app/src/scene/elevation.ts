/** GELV v1 elevation grids written by the course builder (tools/course-builder/coursebuilder/elevation.py). */
export interface ElevationGrid {
  width: number;
  height: number;
  west: number;
  north: number;
  dlon: number;
  dlat: number;
  h: Float32Array; // metres, row-major from the north-west corner; NaN = no data
}

const NODATA = 65535;

export function parseGelv(buf: ArrayBuffer): ElevationGrid {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'GELV' || dv.getUint16(4, true) !== 1) throw new Error('not a GELV v1 file');
  const width = dv.getUint32(8, true);
  const height = dv.getUint32(12, true);
  const base = dv.getFloat32(48, true);
  const scale = dv.getFloat32(52, true);
  const h = new Float32Array(width * height);
  for (let i = 0; i < h.length; i++) {
    const q = dv.getUint16(56 + i * 2, true);
    h[i] = q === NODATA ? NaN : base + q * scale;
  }
  return {
    width,
    height,
    west: dv.getFloat64(16, true),
    north: dv.getFloat64(24, true),
    dlon: dv.getFloat64(32, true),
    dlat: dv.getFloat64(40, true),
    h,
  };
}

/** Bilinear height between cell centres; clamps outside the grid; skips missing cells. */
export function heightAt(g: ElevationGrid, lon: number, lat: number): number {
  const fx = Math.min(Math.max((lon - g.west) / g.dlon - 0.5, 0), g.width - 1);
  const fy = Math.min(Math.max((g.north - lat) / g.dlat - 0.5, 0), g.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, g.width - 1);
  const y1 = Math.min(y0 + 1, g.height - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const cells: [number, number][] = [
    [g.h[y0 * g.width + x0]!, (1 - tx) * (1 - ty)],
    [g.h[y0 * g.width + x1]!, tx * (1 - ty)],
    [g.h[y1 * g.width + x0]!, (1 - tx) * ty],
    [g.h[y1 * g.width + x1]!, tx * ty],
  ];
  let sum = 0;
  let wsum = 0;
  for (const [v, w] of cells) {
    if (Number.isNaN(v)) continue;
    sum += v * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}
