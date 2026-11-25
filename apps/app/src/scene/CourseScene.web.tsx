import type { Course, LngLat } from '@golf/course-schema';
import type { FeatureCollection } from 'geojson';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseGelv } from './elevation';
import type { EN } from './geom';
import { GROUND_FILES } from './ground';
import { makeCart, makeGolfer, makeTeeMarker, type Cart, type Golfer } from './models';
import type { CourseSceneHandle, CourseSceneProps, ShotState } from './types';
import { buildWorld, measure, nearestOnPaths, type World } from './World';

const SKY_TOP = '#6fb6e3';
const HAZE = '#cfe6f1';
const MINT = '#3ee6c4';

interface Assets {
  scenery: FeatureCollection;
  grid: ArrayBuffer;
  fields: THREE.Texture[];
}
const assets = new Map<string, Promise<Assets>>();
const worlds = new Map<string, World>();

function loadField(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

function loadAssets(course: Course) {
  const key = `${course.id}@${course.version}`;
  if (!assets.has(key)) {
    const base = `/courses/${course.id}`;
    const p = Promise.all([
      fetch(`${base}/scenery.geojson`).then((r) =>
        r.ok ? (r.json() as Promise<FeatureCollection>) : Promise.reject(new Error('scenery')),
      ),
      fetch(course.elevation?.course ?? `${base}/elevation-course.bin`).then((r) =>
        r.ok ? r.arrayBuffer() : Promise.reject(new Error('elevation')),
      ),
      Promise.all(GROUND_FILES.map((f) => loadField(`${base}/${f}?v=${course.version}`))),
    ]).then(([scenery, grid, fields]) => ({ scenery, grid, fields }));
    p.catch(() => assets.delete(key));
    assets.set(key, p);
  }
  return assets.get(key)!;
}

type Tick = (dt: number) => boolean; // true when finished

interface Rig {
  scene: THREE.Scene;
  world: World;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  controls: OrbitControls;
  golfer: Golfer;
  cart: Cart;
  ball: THREE.Mesh;
  preview: THREE.Line;
  marker: THREE.Group;
  tees: THREE.Object3D[];
  ticks: Tick[];
  flat: boolean;
  framing: { from: LngLat; to: LngLat } | null;
  wake(): void;
}

const ease = (t: number) => t * t * (3 - 2 * t);

export const CourseScene = forwardRef<CourseSceneHandle, CourseSceneProps>(function CourseScene(
  { course, features, onTapGround, onReady, onError, focusTop = 0.5 },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const rig = useRef<Rig | null>(null);
  const queued = useRef<((r: Rig) => void)[]>([]);
  const cb = useRef({ onTapGround, onReady, onError });
  cb.current = { onTapGround, onReady, onError };
  // changing focusTop re-fits the view; it must not rebuild the scene
  const focus = useRef(focusTop);
  const refit = useRef<(() => void) | null>(null);
  useEffect(() => {
    focus.current = focusTop;
    refit.current?.();
  }, [focusTop]);

  useEffect(() => {
    const host = el.current;
    if (!host) return;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      cb.current.onError?.('3D needs WebGL, which this browser has turned off.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sky = skyTexture();
    scene.background = sky;
    scene.fog = new THREE.Fog(HAZE, 700, 2600);
    scene.add(new THREE.HemisphereLight('#e8f6ff', '#5e7d48', 1.9));
    const sun = new THREE.DirectionalLight('#fff3df', 1.7);
    sun.position.set(-300, 600, 250);
    scene.add(sun);
    const persp = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = false;
    controls.maxDistance = 2200;
    controls.minDistance = 4;

    let dirty = true;
    const wake = () => (dirty = true);
    controls.addEventListener('change', wake);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h);
      // keep the point of interest clear of the panels: the look-at point sits focusTop down
      const k = Math.max(0, h * (1 - 2 * focus.current));
      persp.aspect = w / h;
      persp.setViewOffset(w, h + k, 0, k, w, h);
      persp.updateProjectionMatrix();
      const half = (ortho.top - ortho.bottom) / 2 || 100;
      setOrthoSize(ortho, half, w / h);
      ortho.setViewOffset(w, h + k, 0, k, w, h);
      ortho.updateProjectionMatrix();
      wake();
    };
    refit.current = resize;
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // taps (not drags) pick a spot on the ground
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: Date.now() });
    const onUp = (e: PointerEvent) => {
      const r = rig.current;
      if (!down || !r) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = Date.now() - down.t < 500;
      down = null;
      if (moved > 6 || !quick) return;
      const box = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - box.left) / box.width) * 2 - 1,
          -((e.clientY - box.top) / box.height) * 2 + 1,
        ),
        controls.object as THREE.Camera,
      );
      const hit = ray.intersectObject(r.world.terrain)[0];
      if (hit) cb.current.onTapGround?.(r.world.toLngLat(hit.point));
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      // hidden screens (still mounted under the stack) skip work; the visible one owns the world
      if (!host.clientWidth) return;
      const r = rig.current;
      if (r && r.world.group.parent !== scene) {
        scene.add(r.world.group);
        dirty = true;
      }
      if (r?.ticks.length) {
        r.ticks = r.ticks.filter((t) => !t(dt));
        dirty = true;
      }
      if (controls.update()) dirty = true;
      const cam = controls.object as THREE.Camera;
      // haze scales with how far out the camera is, like a mountain view
      const fog = scene.fog as THREE.Fog;
      const dist = cam.position.distanceTo(controls.target);
      fog.near = dist + 250;
      fog.far = dist * 2.2 + 1800;
      // a real ball is 4 cm across: draw it bigger the further away it is so it stays visible
      if (r) {
        // ortho: metres per screen pixel; keep the ball at least ~3 px across
        const px = r.flat
          ? (r.ortho.top - r.ortho.bottom) / r.ortho.zoom / host.clientHeight
          : cam.position.distanceTo(r.ball.position) / 900;
        r.ball.scale.setScalar(Math.max(1, (px * 1.6) / 0.05));
      }
      if (dirty) {
        renderer.render(scene, cam);
        dirty = false;
      }
    };
    raf = requestAnimationFrame(loop);

    loadAssets(course)
      .then(({ scenery, grid, fields }) => {
        if (disposed) return;
        const key = `${course.id}@${course.version}`;
        let world = worlds.get(key);
        if (!world) {
          world = buildWorld(course, features, scenery, parseGelv(grid), fields);
          worlds.set(key, world);
        }
        scene.add(world.group);
        const golfer = makeGolfer(1);
        golfer.stand();
        golfer.root.visible = false;
        scene.add(golfer.root);
        const cart = makeCart();
        cart.root.visible = false;
        scene.add(cart.root);
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 10, 8),
          new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#555555' }),
        );
        ball.visible = false;
        scene.add(ball);
        const preview = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineDashedMaterial({
            color: '#ffffff',
            dashSize: 2,
            gapSize: 1.5,
            transparent: true,
            opacity: 0.85,
          }),
        );
        scene.add(preview);
        const marker = targetMarker();
        marker.visible = false;
        scene.add(marker);
        const tees = [makeTeeMarker('#3f7fe0'), makeTeeMarker('#3f7fe0')];
        for (const t of tees) {
          t.visible = false;
          scene.add(t);
        }
        rig.current = {
          scene,
          world,
          persp,
          ortho,
          controls,
          golfer,
          cart,
          ball,
          preview,
          marker,
          tees,
          ticks: [],
          flat: false,
          framing: null,
          wake,
        };
        for (const f of queued.current.splice(0)) f(rig.current);
        wake();
        cb.current.onReady?.();
      })
      .catch((e: Error) => cb.current.onError?.(`Couldn’t load the 3D course (${e.message}).`));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      // the world is cached for the next screen; everything else here is this screen's own
      const r = rig.current;
      if (r) {
        scene.remove(r.world.group);
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          mats.forEach((x) => x.dispose());
        });
      }
      sky.dispose();
      rig.current = null;
      refit.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [course, features]);

  const run = (f: (r: Rig) => void) => {
    if (rig.current) f(rig.current);
    else queued.current.push(f);
  };

  useImperativeHandle(
    ref,
    (): CourseSceneHandle => ({
      overview: (secs = 1.2) =>
        run((r) => {
          r.framing = null;
          setFlat(r, false);
          fly(r, overviewView(r.world), secs);
        }),
      frame: (from, to, secs = 1.2) =>
        run((r) => {
          r.framing = { from, to };
          if (r.flat) topDown(r, from, to);
          else fly(r, behind(r.world, from, to), secs);
        }),
      setShot: (s) => run((r) => setShot(r, s)),
      setFlat: (flat) =>
        run((r) => {
          setFlat(r, flat);
          const f = r.framing;
          if (!f) return;
          if (flat) topDown(r, f.from, f.to);
          else fly(r, behind(r.world, f.from, f.to), 0.01);
        }),
      measure: (a, b) => (rig.current ? measure(rig.current.world, a, b) : null),
    }),
    [course],
  );

  return (
    <div
      ref={el}
      data-testid="course-3d"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: HAZE }}
    />
  );
});

// ---------------------------------------------------------------- cameras

interface View {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

function overviewView(w: World): View {
  const span = Math.max(w.size.w, w.size.h);
  return {
    pos: new THREE.Vector3(-span * 0.06, span * 0.78, span * 0.66),
    look: new THREE.Vector3(0, 0, span * 0.04),
  };
}

/** Behind `from`, looking down the line to `to`. */
function behind(w: World, from: LngLat, to: LngLat): View {
  const a = w.toScene(from);
  const b = w.toScene(to);
  const len = Math.max(a.distanceTo(b), 40);
  const dir = b.clone().sub(a).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const back = Math.min(len * 0.15, 30) + 18;
  return {
    pos: a
      .clone()
      .addScaledVector(dir, -back)
      .addScaledVector(side, back * 0.12)
      .setY(a.y + back * 0.35 + 4),
    look: a.clone().lerp(b, 0.3),
  };
}

function fly(r: Rig, v: View, secs: number) {
  const cam = r.persp;
  const p0 = cam.position.clone();
  const l0 = r.controls.target.clone();
  r.ticks = [];
  if (p0.lengthSq() === 0 || secs < 0.05) {
    cam.position.copy(v.pos);
    r.controls.target.copy(v.look);
    r.wake();
    return;
  }
  let t = 0;
  r.ticks.push((dt) => {
    t = Math.min(1, t + dt / secs);
    const k = ease(t);
    cam.position.lerpVectors(p0, v.pos, k);
    r.controls.target.lerpVectors(l0, v.look, k);
    return t >= 1;
  });
}

function setOrthoSize(o: THREE.OrthographicCamera, half: number, aspect: number) {
  o.top = half;
  o.bottom = -half;
  o.left = -half * aspect;
  o.right = half * aspect;
}

function setFlat(r: Rig, flat: boolean) {
  if (r.flat === flat) return;
  r.flat = flat;
  const c = r.controls;
  r.ticks = [];
  if (flat) {
    c.object = r.ortho;
    c.minPolarAngle = c.maxPolarAngle = 0.0001;
    c.enableRotate = false;
    c.screenSpacePanning = true;
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  } else {
    c.object = r.persp;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI * 0.47;
    c.enableRotate = true;
    c.screenSpacePanning = false;
    c.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }
  r.wake();
}

/** Straight down, `to` at the top of the screen, both points in view. */
function topDown(r: Rig, from: LngLat, to: LngLat) {
  const a = r.world.toScene(from);
  const b = r.world.toScene(to);
  const dir = b.clone().sub(a).setY(0);
  const len = Math.max(dir.length(), 60);
  dir.normalize();
  const o = r.ortho;
  // the visible part of the view (the rest is pushed off by focusTop) and where its centre sits
  const v = o.view?.enabled ? o.view : null;
  const full = v ? v.fullHeight / v.height : 1;
  const ft = v ? (v.fullHeight / 2 - v.offsetY) / v.height : 0.5;
  // `to` sits 12% down the visible area and `from` 66% down, clear of the top bar and the card
  const visible = len / 0.54;
  const look = b.clone().addScaledVector(dir, -Math.max(0, ft - 0.12) * visible);
  const aspect = (o.right - o.left) / (o.top - o.bottom) || 0.5;
  setOrthoSize(o, (visible * full) / 2, aspect);
  o.zoom = 1;
  o.updateProjectionMatrix();
  // a hair behind the look point so "up" on screen points down the hole
  o.position
    .copy(look)
    .addScaledVector(dir, -0.01)
    .setY(look.y + 900);
  r.controls.target.copy(look);
  r.wake();
}

// ---------------------------------------------------------------- the shot

function bearingDeg(w: World, a: LngLat, b: LngLat) {
  const p = w.frame.toEN(...a);
  const q = w.frame.toEN(...b);
  return (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI;
}

function setShot(r: Rig, s: ShotState) {
  const w = r.world;
  const g = r.golfer;
  // tee markers either side of the tee, across the line of play
  for (const t of r.tees) t.visible = !!s.tee;
  if (s.tee) {
    const b = ((s.aim ? bearingDeg(w, s.tee, s.aim) : 0) * Math.PI) / 180;
    const p = w.frame.toEN(...s.tee);
    r.tees.forEach((m, i) => {
      const k = i ? 3 : -3;
      const e = p[0] + Math.cos(b) * k;
      const n = p[1] - Math.sin(b) * k;
      m.position.set(e, w.y(e, n) + 0.1, -n);
    });
  }
  // the player: seated in a moving cart when GPS says so, else standing at the ball
  if (s.driving) {
    const p = w.frame.toEN(...s.driving.at);
    setCart(r, p, (s.driving.headingDeg * Math.PI) / 180);
    r.cart.root.visible = true;
    g.sit();
    r.cart.seat.add(g.root);
    g.root.position.set(0, 0, 0);
    g.root.rotation.set(0, 0, 0);
    g.root.visible = true;
  } else if (s.ball) {
    const face = s.aim ?? s.ball;
    r.scene.add(g.root); // out of the cart if it was driving
    const ball = w.toScene(s.ball);
    const phi = Math.PI / 2 - (bearingDeg(w, s.ball, face) * Math.PI) / 180;
    g.root.rotation.set(0, phi, 0);
    g.root.position
      .copy(ball)
      .sub(new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(0.62));
    g.stand();
    g.showClub(true);
    g.root.visible = true;
    parkCart(r, s.ball, face);
  } else {
    g.root.visible = false;
    r.cart.root.visible = false;
  }
  r.ball.visible = !!s.ball && !s.driving;
  if (s.ball) r.ball.position.copy(w.toScene(s.ball, 0.05));
  r.marker.visible = !!s.target;
  if (s.target) r.marker.position.copy(w.toScene(s.target, 0.05));
  r.preview.geometry.dispose();
  const o = s.ball ? w.toScene(s.ball, 0.05) : null;
  const pts =
    o && s.flight ? s.flight.map(([x, y, z]) => new THREE.Vector3(o.x + x, o.y + z, o.z - y)) : [];
  r.preview.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  r.preview.computeLineDistances();
  r.preview.visible = pts.length > 1 && !s.driving;
  r.wake();
}

/** Parked on the nearest cart path, pointing the way we're playing. */
function parkCart(r: Rig, at: LngLat, face: LngLat) {
  const w = r.world;
  const p = w.frame.toEN(...at);
  const play = (bearingDeg(w, at, face) * Math.PI) / 180;
  const near = nearestOnPaths(w.pathLines, p);
  let pos: EN;
  let heading: number;
  if (near && Math.hypot(near.p[0] - p[0], near.p[1] - p[1]) < 40) {
    pos = near.p;
    // a path runs both ways: take the direction closer to the line of play
    heading = Math.cos(near.heading - play) >= 0 ? near.heading : near.heading + Math.PI;
  } else {
    pos = [
      p[0] - Math.sin(play) * 6 - Math.cos(play) * 5,
      p[1] - Math.cos(play) * 6 + Math.sin(play) * 5,
    ];
    heading = play;
  }
  setCart(r, pos, heading);
  r.cart.root.visible = true;
}

/** Cart at local metres `p`, facing compass `heading` (radians), pitched to the slope. */
function setCart(r: Rig, p: EN, heading: number) {
  const w = r.world;
  const fx = Math.sin(heading) * 0.9;
  const fy = Math.cos(heading) * 0.9;
  const hf = w.y(p[0] + fx, p[1] + fy);
  const hb = w.y(p[0] - fx, p[1] - fy);
  r.cart.root.position.set(p[0], Math.max(hf, hb) - 0.03, -p[1]);
  r.cart.root.rotation.set(-Math.atan2(hf - hb, 1.8), Math.PI - heading, 0, 'YXZ');
}

// ---------------------------------------------------------------- bits

function targetMarker(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: MINT, side: THREE.DoubleSide }),
    ),
  );
  g.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 6, 6).translate(0, 3, 0),
      new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.7 }),
    ),
  );
  return g;
}

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(0.55, '#a9d6ee');
  grad.addColorStop(1, HAZE);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
