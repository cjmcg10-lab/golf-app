import { inRing, rng, type EN } from './geom';

export interface TreeSpot {
  e: number;
  n: number;
  scale: number;
  pine: boolean;
  tint: number; // 0..1, colour variation
}

/** Jittered grid of trees inside the wooded areas, keeping clear of the avoid areas. */
export function placeTrees(
  areas: readonly EN[][],
  avoid: readonly EN[][],
  spacing: number,
  seed: number,
  keep: (p: EN) => boolean = () => true,
): TreeSpot[] {
  const r = rng(seed);
  const out: TreeSpot[] = [];
  for (const area of areas) {
    const es = area.map((p) => p[0]);
    const ns = area.map((p) => p[1]);
    for (let n = Math.min(...ns); n <= Math.max(...ns); n += spacing) {
      for (let e = Math.min(...es); e <= Math.max(...es); e += spacing) {
        const p: EN = [e + (r() - 0.5) * spacing * 0.8, n + (r() - 0.5) * spacing * 0.8];
        const scale = 0.75 + r() * 0.6;
        const pine = r() < 0.35;
        const tint = r();
        if (!inRing(p, area) || avoid.some((a) => inRing(p, a)) || !keep(p)) continue;
        out.push({ e: p[0], n: p[1], scale, pine, tint });
      }
    }
  }
  return out;
}
