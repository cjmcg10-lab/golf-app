import type { Course, LngLat } from '@golf/course-schema';
import type { Surface } from '@golf/physics';
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, type ElevationGrid } from './elevation';
import { makeFrame, type Frame } from './frame';
import { distToSegment, inRing, rng, type EN } from './geom';
import { makeBystander, makeCart, makeFlag, makeTeeMarker } from './models';
import { GROUND, paintGround, type Area, type Strip } from './paint';
import { buildPathGraph, type PathGraph } from './paths';
import { placeTrees, type TreeSpot } from './trees';

/**
 * The whole course as a low-poly scene. Three.js axes: x = east, y = up, z = south (−north),
 * metres from the centre of the elevation grid; y = 0 at the lowest ground.
 */
export interface World {
  group: THREE.Group;
  terrain: THREE.Mesh;
  frame: Frame;
  size: { w: number; h: number };
  base: number;
  paths: PathGraph;
  pathLines: EN[][];
  /** Ground height (scene y) at local metres. */
  y(e: number, n: number): number;
  toScene(p: LngLat, lift?: number): THREE.Vector3;
  toLngLat(v: THREE.Vector3): LngLat;
  surfaceAt(p: LngLat): Surface;
  dispose(): void;
}

const CARTPATH_W = 2.4;
const TEX_W = 4096;

const polys = (fc: FeatureCollection, kind: string) =>
  fc.features.filter(
    (f): f is Feature<Polygon> => f.geometry?.type === 'Polygon' && f.properties?.kind === kind,
  );
const lines = (fc: FeatureCollection, kind: string) =>
  fc.features.filter(
    (f): f is Feature<LineString> =>
      f.geometry?.type === 'LineString' && f.properties?.kind === kind,
  );

export function buildWorld(
  course: Course,
  features: FeatureCollection,
  scenery: FeatureCollection,
  grid: ElevationGrid,
): World {
  const east = grid.west + grid.width * grid.dlon;
  const south = grid.north - grid.height * grid.dlat;
  const frame = makeFrame((grid.west + east) / 2, (grid.north + south) / 2);
  const ring = (coords: number[][]) => coords.map(([lon, lat]) => frame.toEN(lon!, lat!));
  const [w0, s0] = frame.toEN(grid.west, south);
  const [e1, n1] = frame.toEN(east, grid.north);
  const size = { w: e1 - w0, h: n1 - s0 };

  let base = Infinity;
  for (const v of grid.h) if (!Number.isNaN(v) && v < base) base = v;
  const hAt = (e: number, n: number) => {
    const [lon, lat] = frame.toLonLat(e, n);
    return heightAt(grid, lon, lat) - base;
  };

  // ---- ground areas ----
  const holeBearing = new Map<number, number>();
  for (const h of course.holes) {
    const a = frame.toEN(...h.playLine[0]!);
    const b = frame.toEN(...h.playLine.at(-1)!);
    holeBearing.set(h.number, (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI);
  }
  const areas: Area[] = [];
  for (const kind of ['fairway', 'green', 'tee', 'bunker', 'water', 'trees', 'clubhouse'])
    for (const f of polys(features, kind)) {
      const hole = f.properties?.hole as number | undefined;
      areas.push({
        kind,
        rings: f.geometry.coordinates.map(ring),
        stripeDeg: (holeBearing.get(hole ?? 0) ?? 0) - 90,
      });
    }
  for (const f of polys(scenery, 'parking'))
    areas.push({ kind: 'parking', rings: f.geometry.coordinates.map(ring) });
  const pathLines = lines(features, 'cartpath').map((f) => ring(f.geometry.coordinates));
  const strips: Strip[] = [
    ...lines(scenery, 'road').map((f) => ({
      kind: 'road' as const,
      pts: ring(f.geometry.coordinates),
      width: Number(f.properties?.width ?? 5),
    })),
    ...pathLines.map((pts) => ({ kind: 'cartpath' as const, pts, width: CARTPATH_W })),
  ];
  const outer = (k: string) => areas.filter((a) => a.kind === k).map((a) => a.rings[0]!);
  const buildingRings = polys(scenery, 'building').map((f) => ring(f.geometry.coordinates[0]!));

  // ---- trees: wooded areas, clear of play areas, buildings, paths and roads ----
  const lineSegs = strips.flatMap((s) =>
    s.pts.slice(1).map((p, i) => ({ a: s.pts[i]!, b: p, clear: s.width / 2 + 3 })),
  );
  const clearOfLines = (p: EN) =>
    !lineSegs.some((s) => Math.abs(p[0] - s.a[0]) < 60 && distToSegment(p, s.a, s.b) < s.clear);
  const avoid = [
    ...['fairway', 'green', 'tee', 'bunker', 'water', 'clubhouse', 'parking'].flatMap(outer),
    ...buildingRings,
  ];
  const trees = placeTrees(outer('trees'), avoid, 6.5, 7, clearOfLines);

  // ---- ground texture ----
  const pxPerM = TEX_W / size.w;
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = Math.min(4096, 2 ** Math.ceil(Math.log2(size.h * pxPerM)));
  const sy = canvas.height / size.h;
  const toPx = ([e, n]: EN): [number, number] => [(e - w0) * pxPerM, (n1 - n) * sy];
  const ctx = canvas.getContext('2d')!;
  paintGround(ctx, toPx, pxPerM, areas, strips, null);
  paintTreeShadows(ctx, toPx, pxPerM, trees);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const group = new THREE.Group();

  // ---- terrain: smooth-shaded, 3 m grid; an untextured apron fades into the haze ----
  const step = 3;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let e = w0 + 0.5; e <= e1 - 0.5; e += step) xs.push(e);
  for (let n = n1 - 0.5; n >= s0 + 0.5; n -= step) zs.push(n);
  const terrain = gridMesh(xs, zs, hAt, (e, n) => [(e - w0) / size.w, (n - s0) / size.h]);
  const terrainMesh = new THREE.Mesh(terrain, new THREE.MeshLambertMaterial({ map: tex }));
  group.add(terrainMesh);
  const ap = apron(xs, zs, hAt);
  group.add(ap.mesh);

  // ---- trees ----
  group.add(treeMeshes(trees, hAt));
  group.add(treeMeshes(apronTrees(xs, zs), ap.height));

  // ---- buildings ----
  const bld: { rings: EN[]; h: number; club?: boolean }[] = polys(scenery, 'building').map((f) => ({
    rings: ring(f.geometry.coordinates[0]!),
    h: Number(f.properties?.height ?? 6),
  }));
  for (const a of areas.filter((x) => x.kind === 'clubhouse'))
    bld.push({ rings: a.rings[0]!, h: 9, club: true });
  const b = buildingMesh(bld, hAt);
  if (b) group.add(b);

  // ---- flags, tee markers and a few groups of golfers around the course ----
  const v = (p: EN, lift = 0) => new THREE.Vector3(p[0], hAt(p[0], p[1]) + lift, -p[1]);
  const paths = buildPathGraph(pathLines, 3);
  for (const h of course.holes) {
    const flag = makeFlag(h.number % 2 ? '#ff4d4d' : '#ffd23f');
    flag.position.copy(v(frame.toEN(...h.pin)));
    group.add(flag);
    const tee = frame.toEN(...h.playLine[0]!);
    const nxt = frame.toEN(...h.playLine[1]!);
    const len = Math.hypot(nxt[0] - tee[0], nxt[1] - tee[1]) || 1;
    const side: EN = [(nxt[1] - tee[1]) / len, -(nxt[0] - tee[0]) / len];
    for (const s of [-1, 1]) {
      const m = makeTeeMarker('#3f7fe0');
      m.position.copy(v([tee[0] + side[0] * s * 3, tee[1] + side[1] * s * 3], 0.1));
      group.add(m);
    }
  }
  const r = rng(5);
  for (const n of [3, 7, 11, 16]) {
    const h = course.holes.find((k) => k.number === n);
    if (!h) continue;
    const g = frame.toEN(...h.green.center);
    for (let i = 0; i < 2; i++) {
      const p = v([g[0] + (r() - 0.5) * 8, g[1] + (r() - 0.5) * 8]);
      const man = makeBystander(n * 3 + i);
      man.position.copy(p);
      man.rotation.y = r() * Math.PI * 2;
      group.add(man);
    }
    const near = nearestOnPaths(pathLines, g);
    if (near && Math.hypot(near.p[0] - g[0], near.p[1] - g[1]) < 60) {
      const cart = makeCart();
      cart.root.position.copy(v(near.p));
      cart.root.rotation.y = Math.PI - near.heading;
      group.add(cart.root);
    }
  }

  const surfaceRings: [Surface, EN[][]][] = (
    ['water', 'bunker', 'green', 'tee', 'fairway'] as const
  ).map((k) => [k, areas.filter((a) => a.kind === k).map((a) => a.rings[0]!)]);

  return {
    group,
    terrain: terrainMesh,
    frame,
    size,
    base,
    paths,
    pathLines,
    y: hAt,
    toScene: (p, lift = 0) => v(frame.toEN(...p), lift),
    toLngLat: (s) => frame.toLonLat(s.x, -s.z),
    surfaceAt(p) {
      const en = frame.toEN(...p);
      for (const [k, rings] of surfaceRings) if (rings.some((rg) => inRing(en, rg))) return k;
      return 'rough';
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
      tex.dispose();
    },
  };
}

/** Straight-line yards, compass bearing and height change from a to b. */
export function measure(w: World, a: LngLat, b: LngLat) {
  const p = w.frame.toEN(...a);
  const q = w.frame.toEN(...b);
  return {
    yards: Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.9144,
    bearing: (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI,
    dz: w.y(q[0], q[1]) - w.y(p[0], p[1]),
  };
}

/** Nearest point on any cart path, with the path's compass heading there. */
export function nearestOnPaths(pathLines: EN[][], p: EN): { p: EN; heading: number } | null {
  let best: { p: EN; heading: number; d: number } | null = null;
  for (const l of pathLines)
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1]!;
      const b = l[i]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const q: EN = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!best || d < best.d) best = { p: q, heading: Math.atan2(dx, dy), d };
    }
  return best;
}

function paintTreeShadows(
  ctx: CanvasRenderingContext2D,
  toPx: (p: EN) => [number, number],
  pxPerM: number,
  trees: TreeSpot[],
) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,45,20,0.28)';
  for (const t of trees) {
    const [x, y] = toPx([t.e + 1.6 * t.scale, t.n + 1.1 * t.scale]);
    ctx.beginPath();
    ctx.ellipse(x, y, 3.1 * t.scale * pxPerM, 2.5 * t.scale * pxPerM, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Rectilinear grid → indexed, smooth-normal geometry. zs run north → south. */
function gridMesh(
  xs: number[],
  ns: number[],
  h: (e: number, n: number) => number,
  uv?: (e: number, n: number) => [number, number],
  color?: (e: number, n: number, y: number) => THREE.Color,
  skip?: (e: number, n: number) => boolean,
): THREE.BufferGeometry {
  const pos = new Float32Array(xs.length * ns.length * 3);
  const uvs = uv ? new Float32Array(xs.length * ns.length * 2) : null;
  const cols = color ? new Float32Array(xs.length * ns.length * 3) : null;
  let k = 0;
  for (const n of ns)
    for (const e of xs) {
      const y = h(e, n);
      pos.set([e, y, -n], k * 3);
      if (uvs) uvs.set(uv!(e, n), k * 2);
      if (cols) {
        const c = color!(e, n, y);
        cols.set([c.r, c.g, c.b], k * 3);
      }
      k++;
    }
  const idx: number[] = [];
  for (let j = 0; j < ns.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      if (skip?.((xs[i]! + xs[i + 1]!) / 2, (ns[j]! + ns[j + 1]!) / 2)) continue;
      const a = j * xs.length + i;
      const b = a + 1;
      const c = a + xs.length;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (cols) g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const APRON = 1800;

/** Plain grass beyond the surveyed grid: the edge heights relax to a level plain with distance. */
function apron(
  xs: number[],
  ns: number[],
  h: (e: number, n: number) => number,
): { mesh: THREE.Mesh; height: (e: number, n: number) => number } {
  const [ea, eb] = [xs[0]!, xs.at(-1)!];
  const [nb, na] = [ns.at(-1)!, ns[0]!];
  let sum = 0;
  let cnt = 0;
  for (const e of xs.filter((_, i) => i % 10 === 0))
    for (const n of [na, nb]) {
      sum += h(e, n);
      cnt++;
    }
  const level = sum / cnt;
  const ds: number[] = []; // apron offsets, far → near
  for (let d = APRON; d > 0; d -= d > 300 ? 150 : 50) ds.push(d);
  const ax = [...ds.map((d) => ea - d), ...xs, ...[...ds].reverse().map((d) => eb + d)];
  const an = [...ds.map((d) => na + d), ...ns, ...[...ds].reverse().map((d) => nb - d)];
  const relax = (e: number, n: number) => {
    const d = Math.max(ea - e, e - eb, nb - n, n - na, 0);
    const k = Math.min(1, d / 500);
    const t = k * k * (3 - 2 * k);
    const ce = Math.min(Math.max(e, ea), eb);
    const cn = Math.min(Math.max(n, nb), na);
    return h(ce, cn) * (1 - t) + (level - 1) * t;
  };
  const tone = rng(3);
  const g = gridMesh(
    ax,
    an,
    relax,
    undefined,
    () => new THREE.Color(GROUND.surround).offsetHSL(0, 0, (tone() - 0.5) * 0.03),
    (e, n) => e > ea && e < eb && n > nb && n < na,
  );
  return {
    mesh: new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })),
    height: relax,
  };
}

/** Scattered woods out in the apron so the horizon isn't bare. */
function apronTrees(xs: number[], ns: number[]): TreeSpot[] {
  const r = rng(11);
  const [ea, eb, nb, na] = [xs[0]!, xs.at(-1)!, ns.at(-1)!, ns[0]!];
  const out: TreeSpot[] = [];
  for (let i = 0; i < 2600; i++) {
    const e = ea - 900 + r() * (eb - ea + 1800);
    const n = nb - 900 + r() * (na - nb + 1800);
    const inside = e > ea - 20 && e < eb + 20 && n > nb - 20 && n < na + 20;
    if (inside) continue;
    // clumps: keep a point only where a slow wave says "woods"
    if (Math.sin(e / 70) + Math.cos(n / 55) + Math.sin((e + n) / 40) < 0.4) continue;
    out.push({ e, n, scale: 0.8 + r() * 0.6, pine: r() < 0.4, tint: r() });
  }
  return out;
}

function treeMeshes(trees: TreeSpot[], h: (e: number, n: number) => number): THREE.Group {
  const g = new THREE.Group();
  const leafy = trees.filter((t) => !t.pine);
  const pines = trees.filter((t) => t.pine);
  const flat = (color: string) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true, vertexColors: false });
  const canopyGeo = new THREE.IcosahedronGeometry(2.6, 0).scale(1, 1.15, 1).translate(0, 5, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 5).translate(0, 1.5, 0);
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(2.3, 4.2, 7).translate(0, 4.1, 0),
    new THREE.ConeGeometry(1.7, 3.4, 7).translate(0, 6.3, 0),
  ])!;
  const parts: [THREE.BufferGeometry, TreeSpot[], string, (t: TreeSpot) => THREE.Color][] = [
    [trunkGeo, trees, '#6b4a33', () => new THREE.Color('#ffffff')],
    [
      canopyGeo,
      leafy,
      '#ffffff',
      (t) => new THREE.Color().setHSL(0.24 + t.tint * 0.07, 0.42, 0.3 + t.tint * 0.1),
    ],
    [pineGeo, pines, '#ffffff', (t) => new THREE.Color().setHSL(0.37, 0.38, 0.2 + t.tint * 0.06)],
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [geo, list, color, tint] of parts) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo, flat(color), list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.tint * 6.28);
      m.compose(
        new THREE.Vector3(t.e, h(t.e, t.n) - 0.2, -t.n),
        q,
        new THREE.Vector3(t.scale, t.scale * (0.9 + t.tint * 0.3), t.scale),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint(t));
    });
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}

const WALLS = ['#efe6d6', '#e4d8c3', '#d9dfe3', '#f3efe8', '#cfc3ad', '#e9dcc9'];
const ROOFS = ['#5d6670', '#7a5244', '#4f5a63', '#8a6a52', '#6c727a'];

/** Extruded footprints, merged into one vertex-coloured mesh; small rectangles get gable roofs. */
function buildingMesh(
  list: { rings: EN[]; h: number; club?: boolean }[],
  h: (e: number, n: number) => number,
): THREE.Mesh | null {
  const r = rng(21);
  const geos: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  for (const b of list) {
    let pts = b.rings;
    if (pts.length > 1 && pts[0]![0] === pts.at(-1)![0] && pts[0]![1] === pts.at(-1)![1])
      pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(pts.map(([x, y]) => new THREE.Vector2(x, y))))
      pts = [...pts].reverse();
    const ground = Math.min(...pts.map(([e, n]) => h(e, n)));
    const wall = new THREE.Color(b.club ? '#f4efe4' : WALLS[Math.floor(r() * WALLS.length)]!);
    const roof = new THREE.Color(b.club ? '#3e5560' : ROOFS[Math.floor(r() * ROOFS.length)]!);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const top = ground + b.h;
    const walls = new THREE.ExtrudeGeometry(shape, { depth: b.h + 1, bevelEnabled: false })
      .rotateX(-Math.PI / 2)
      .translate(0, ground - 1, 0)
      .toNonIndexed();
    // ExtrudeGeometry groups: 0 = caps, 1 = sides
    const col = new Float32Array(walls.getAttribute('position').count * 3);
    for (const grp of walls.groups) {
      const c = grp.materialIndex === 0 ? roof : wall;
      for (let i = grp.start; i < grp.start + grp.count; i++) col.set([c.r, c.g, c.b], i * 3);
    }
    walls.setAttribute('color', new THREE.BufferAttribute(col, 3));
    walls.clearGroups();
    walls.deleteAttribute('uv');
    walls.deleteAttribute('normal');
    geos.push(walls);
    if (pts.length === 4 && !b.club) {
      const gable = gableRoof(pts, top, b.h);
      if (gable) geos.push(paint(gable, roof));
    }
  }
  if (!geos.length) return null;
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) return null;
  merged.computeVertexNormals();
  return new THREE.Mesh(
    merged,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
}

/** Ridge along the long axis of a 4-corner footprint. */
function gableRoof(p: EN[], top: number, wallH: number): THREE.BufferGeometry | null {
  const d = (a: EN, b: EN) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // rotate so p0→p1 is a short side
  const q = d(p[0]!, p[1]!) <= d(p[1]!, p[2]!) ? p : [p[1]!, p[2]!, p[3]!, p[0]!];
  const [a, b, c, e] = q as [EN, EN, EN, EN];
  const short = d(a, b);
  if (short < 3 || short > 16) return null;
  const rise = Math.min(short * 0.35, wallH * 0.8);
  const mid = (x: EN, y: EN): EN => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2];
  const r1 = mid(a, b);
  const r2 = mid(c, e);
  const V = (x: EN, y: number) => [x[0], y, -x[1]];
  const A = V(a, top);
  const B = V(b, top);
  const C = V(c, top);
  const E = V(e, top);
  const R1 = V(r1, top + rise);
  const R2 = V(r2, top + rise);
  const tris = [
    [A, R1, B],
    [C, R2, E],
    [B, R1, R2],
    [B, R2, C],
    [E, R2, R1],
    [E, R1, A],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat(2)), 3));
  // make every face point up/out regardless of the footprint's winding
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i += 3) {
    const v0 = new THREE.Vector3().fromBufferAttribute(pos, i);
    const v1 = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const v2 = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    const nrm = v1.clone().sub(v0).cross(v2.clone().sub(v0));
    const centre = v0.clone().add(v1).add(v2).divideScalar(3);
    const core = new THREE.Vector3((A[0]! + C[0]!) / 2, top + rise * 0.3, (A[2]! + C[2]!) / 2);
    if (nrm.dot(centre.sub(core)) < 0) {
      pos.setXYZ(i + 1, v2.x, v2.y, v2.z);
      pos.setXYZ(i + 2, v1.x, v1.y, v1.z);
    }
  }
  return g;
}
