import type { EN } from './geom';

export interface PathGraph {
  nodes: EN[];
  edges: Map<number, { to: number; d: number }[]>;
}

/** Joins cart-path segments whose vertices lie within `snap` metres of each other. */
export function buildPathGraph(lines: readonly EN[][], snap: number): PathGraph {
  const nodes: EN[] = [];
  const edges = new Map<number, { to: number; d: number }[]>();
  const nodeFor = (p: EN) => {
    const i = nodes.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= snap);
    if (i >= 0) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const d = Math.hypot(nodes[a]![0] - nodes[b]![0], nodes[a]![1] - nodes[b]![1]);
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!edges.has(x)) edges.set(x, []);
      edges.get(x)!.push({ to: y, d });
    }
  };
  for (const line of lines) {
    let prev = nodeFor(line[0]!);
    for (const p of line.slice(1)) {
      const cur = nodeFor(p);
      link(prev, cur);
      prev = cur;
    }
  }
  return { nodes, edges };
}

const nearest = (g: PathGraph, p: EN) => {
  let best = -1;
  let bd = Infinity;
  g.nodes.forEach((q, i) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) [best, bd] = [i, d];
  });
  return best;
};

/** Shortest route along the paths from → to (straight line if the paths don't connect them). */
export function route(g: PathGraph, from: EN, to: EN): EN[] {
  const s = nearest(g, from);
  const t = nearest(g, to);
  if (s < 0 || t < 0) return [from, to];
  const dist = new Map<number, number>([[s, 0]]);
  const prev = new Map<number, number>();
  const open = new Set([s]);
  while (open.size) {
    let u = -1;
    for (const i of open) if (u < 0 || dist.get(i)! < dist.get(u)!) u = i;
    open.delete(u);
    if (u === t) break;
    for (const { to: v, d } of g.edges.get(u) ?? []) {
      const nd = dist.get(u)! + d;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        open.add(v);
      }
    }
  }
  if (!dist.has(t)) return [from, to];
  const path: EN[] = [];
  for (let i: number | undefined = t; i !== undefined; i = prev.get(i)) path.unshift(g.nodes[i]!);
  return [from, ...path, to];
}

/** Position and compass heading (radians, 0 = north) `d` metres along a polyline. */
export function pointAlong(line: readonly EN[], d: number): { pos: EN; heading: number; done: boolean } {
  let left = d;
  for (let i = 1; i < line.length; i++) {
    const [ae, an] = line[i - 1]!;
    const [be, bn] = line[i]!;
    const len = Math.hypot(be - ae, bn - an);
    const heading = Math.atan2(be - ae, bn - an);
    if (left <= len && len > 0) {
      const t = left / len;
      return { pos: [ae + (be - ae) * t, an + (bn - an) * t], heading, done: false };
    }
    left -= len;
  }
  const a = line.at(-2) ?? line[0]!;
  const b = line.at(-1)!;
  return { pos: [b[0], b[1]], heading: Math.atan2(b[0] - a[0], b[1] - a[1]), done: true };
}

export const lineLength = (line: readonly EN[]) =>
  line.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - line[i]![0], p[1] - line[i]![1]), 0);
