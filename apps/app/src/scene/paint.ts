import type { EN } from './geom';
import { rng } from './geom';

/** Ground areas and lines in local metres, painted with crisp edges onto the terrain texture. */
export interface Area {
  kind: string; // fairway, green, tee, bunker, water, trees, parking, clubhouse
  rings: EN[][]; // outer ring first, then holes
  stripeDeg?: number; // mowing direction (compass) for fairways and tees
}
export interface Strip {
  kind: 'cartpath' | 'road';
  pts: EN[];
  width: number;
}

export const GROUND = {
  surround: '#86ab68',
  rough: '#6e9e4c',
  woodsFloor: '#55803e',
  semiRough: '#669847',
  fairwayA: '#86c95c',
  fairwayB: '#79bd51',
  tee: '#8fd166',
  collar: '#7cc457',
  green: '#a3e276',
  sand: '#ecdca9',
  sandLip: '#cdb983',
  water: '#3f8fbd',
  shore: '#2f749f',
  path: '#dcd7ca',
  pathEdge: '#b3ad9f',
  road: '#7f858b',
  roadEdge: '#6a7076',
  parking: '#8f959a',
};

export interface Canvas2D {
  canvas: { width: number; height: number };
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(rule?: CanvasFillRule): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  clip(rule?: CanvasFillRule): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
}

/**
 * Paints the course ground. `toPx` maps local metres to canvas pixels; `pxPerM` scales widths.
 * Order matters: later layers sit on top (roads under paths, sand and greens over fairways).
 */
export function paintGround(
  ctx: Canvas2D,
  toPx: (p: EN) => [number, number],
  pxPerM: number,
  areas: Area[],
  strips: Strip[],
  courseOutline: EN[] | null,
) {
  const { width, height } = ctx.canvas;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = GROUND.surround;
  ctx.fillRect(0, 0, width, height);

  const path = (rings: EN[][]) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const [x, y] = toPx(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  };
  const fill = (rings: EN[][], color: string) => {
    path(rings);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  };
  const outline = (rings: EN[][], color: string, m: number) => {
    path(rings);
    ctx.strokeStyle = color;
    ctx.lineWidth = m * pxPerM;
    ctx.stroke();
  };
  const line = (pts: EN[], color: string, m: number) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = toPx(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = m * pxPerM;
    ctx.stroke();
  };
  const stripes = (a: Area, c1: string, c2: string, bandM: number) => {
    ctx.save();
    path(a.rings);
    ctx.clip('evenodd');
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, width, height);
    const [cx, cy] = toPx(a.rings[0]![0]!);
    ctx.translate(cx, cy);
    ctx.rotate(((a.stripeDeg ?? 0) * Math.PI) / 180);
    ctx.fillStyle = c2;
    const band = bandM * pxPerM;
    const reach = Math.max(width, height);
    for (let y = -reach; y < reach; y += band * 2) ctx.fillRect(-reach, y, reach * 2, band);
    ctx.restore();
  };
  const of = (k: string) => areas.filter((a) => a.kind === k);

  // course grounds, subtle grain so large lawns don't look like plastic
  if (courseOutline) fill([courseOutline], GROUND.rough);
  grain(ctx, width, height);
  for (const a of of('trees')) fill(a.rings, GROUND.woodsFloor);
  for (const a of of('parking')) fill(a.rings, GROUND.parking);
  for (const s of strips.filter((s) => s.kind === 'road'))
    line(s.pts, GROUND.roadEdge, s.width + 1);
  for (const s of strips.filter((s) => s.kind === 'road')) line(s.pts, GROUND.road, s.width);
  for (const a of of('fairway')) outline(a.rings, GROUND.semiRough, 5);
  for (const a of of('fairway')) stripes(a, GROUND.fairwayA, GROUND.fairwayB, 7);
  for (const a of of('tee')) outline(a.rings, GROUND.semiRough, 2);
  for (const a of of('tee')) stripes(a, GROUND.tee, GROUND.fairwayA, 2.5);
  for (const a of of('green')) outline(a.rings, GROUND.collar, 3);
  for (const a of of('green')) fill(a.rings, GROUND.green);
  for (const a of of('bunker')) outline(a.rings, GROUND.sandLip, 1.2);
  for (const a of of('bunker')) fill(a.rings, GROUND.sand);
  for (const a of of('water')) outline(a.rings, GROUND.shore, 2);
  for (const a of of('water')) fill(a.rings, GROUND.water);
  for (const s of strips.filter((s) => s.kind === 'cartpath'))
    line(s.pts, GROUND.pathEdge, s.width + 0.8);
  for (const s of strips.filter((s) => s.kind === 'cartpath')) line(s.pts, GROUND.path, s.width);
}

function grain(ctx: Canvas2D, w: number, h: number) {
  const r = rng(99);
  ctx.save();
  for (let i = 0; i < (w * h) / 260; i++) {
    ctx.globalAlpha = 0.05 + r() * 0.06;
    ctx.fillStyle = r() < 0.5 ? '#000000' : '#ffffff';
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  ctx.restore();
}
