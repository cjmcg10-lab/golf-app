import type { Course, LngLat } from '@golf/course-schema';
import { YARD, rollYards, type Advice } from '@golf/physics';
import type { FeatureCollection } from 'geojson';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseGelv } from './elevation';
import type { EN } from './geom';
import { makeCart, makeGolfer, type Cart, type Golfer } from './models';
import { lineLength, pointAlong, route } from './paths';
import { IMPACT_T, SWING_END, swingPose } from './swing';
import type { CourseSceneHandle, CourseSceneProps, ShotSetup } from './types';
import { buildWorld, measure, nearestOnPaths, type World } from './World';

const SKY_TOP = '#6fb6e3';
const HAZE = '#cfe6f1';
const MINT = '#3ee6c4';

const cache = new Map<string, Promise<{ scenery: FeatureCollection; grid: ArrayBuffer }>>();
function loadAssets(course: Course) {
  const key = `${course.id}@${course.version}`;
  if (!cache.has(key)) {
    const p = Promise.all([
      fetch(`/courses/${course.id}/scenery.geojson`).then((r) =>
        r.ok ? (r.json() as Promise<FeatureCollection>) : Promise.reject(new Error('scenery')),
      ),
      fetch(course.elevation?.course ?? `/courses/${course.id}/elevation-course.bin`).then((r) =>
        r.ok ? r.arrayBuffer() : Promise.reject(new Error('elevation')),
      ),
    ]).then(([scenery, grid]) => ({ scenery, grid }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

const worlds = new Map<string, World>();

type Tick = (dt: number) => boolean; // return true when finished

interface Rig {
  world: World;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  golfer: Golfer;
  cart: Cart;
  ball: THREE.Mesh;
  trail: THREE.Line;
  preview: THREE.Line;
  marker: THREE.Group;
  ticks: Tick[];
  wake(): void;
}

const bearingDeg = (w: World, a: LngLat, b: LngLat) => {
  const p = w.frame.toEN(...a);
  const q = w.frame.toEN(...b);
  return (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI;
};
const dirOf = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(r), 0, -Math.cos(r));
};
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
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(HAZE, 700, 2600);
    scene.add(new THREE.HemisphereLight('#e8f6ff', '#5e7d48', 1.9));
    const sun = new THREE.DirectionalLight('#fff3df', 1.7);
    sun.position.set(-300, 600, 250);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 4;
    controls.maxDistance = 2200;
    controls.screenSpacePanning = false;

    let dirty = true;
    const wake = () => (dirty = true);
    controls.addEventListener('change', wake);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // keep the point of interest clear of the panels: the look-at point sits focusTop down
      const k = Math.max(0, h * (1 - 2 * focusTop));
      camera.setViewOffset(w, h + k, 0, k, w, h);
      camera.updateProjectionMatrix();
      wake();
    };
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
        camera,
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
      const r = rig.current;
      if (r?.ticks.length) {
        r.ticks = r.ticks.filter((t) => !t(dt));
        dirty = true;
      }
      if (controls.update()) dirty = true;
      // haze scales with how far out the camera is, like a mountain view
      const fog = scene.fog as THREE.Fog;
      const dist = camera.position.distanceTo(controls.target);
      fog.near = dist + 250;
      fog.far = dist * 2.2 + 1800;
      // a real ball is 4 cm across: draw it bigger the further away it is so it stays visible
      if (r) r.ball.scale.setScalar(Math.max(1, camera.position.distanceTo(r.ball.position) / 18));
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
    };
    raf = requestAnimationFrame(loop);

    loadAssets(course)
      .then(({ scenery, grid }) => {
        if (disposed) return;
        const key = `${course.id}@${course.version}`;
        let world = worlds.get(key);
        if (!world) {
          world = buildWorld(course, features, scenery, parseGelv(grid));
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
        const trail = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: MINT }),
        );
        scene.add(trail);
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
        rig.current = {
          world,
          scene,
          camera,
          controls,
          golfer,
          cart,
          ball,
          trail,
          preview,
          marker,
          ticks: [],
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
      // the world is cached for the next screen; only detach it
      if (rig.current) scene.remove(rig.current.world.group);
      rig.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [course, features, focusTop]);

  const run = (f: (r: Rig) => void) => {
    if (rig.current) f(rig.current);
    else queued.current.push(f);
  };

  useImperativeHandle(
    ref,
    (): CourseSceneHandle => ({
      overview: () => run((r) => fly(r, overviewView(r.world), 1.2)),
      focusHole: (n) =>
        run((r) => {
          const h = course.holes.find((k) => k.number === n);
          if (h) fly(r, behind(r.world, h.playLine[0]!, h.green.center, 1), 1.2);
        }),
      setShot: (s) => run((r) => setShot(r, s)),
      hit: (a) => new Promise((done) => run((r) => hit(r, a, done))),
      measure: (a, b) => (rig.current ? measure(rig.current.world, a, b) : null),
      driveTo: (to, face) => new Promise((done) => run((r) => drive(r, to, face, done))),
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

// ---------------------------------------------------------------- views

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

/** Behind `from`, looking down the line to `to`; zoom 1 frames the whole shot. */
function behind(w: World, from: LngLat, to: LngLat, zoom: number): View {
  const a = w.toScene(from);
  const b = w.toScene(to);
  const len = Math.max(a.distanceTo(b), 40);
  const dir = b.clone().sub(a).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const back = (Math.min(len * 0.15, 30) + 18) * zoom;
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
  const p0 = r.camera.position.clone();
  const l0 = r.controls.target.clone();
  if (p0.lengthSq() === 0) {
    r.camera.position.copy(v.pos);
    r.controls.target.copy(v.look);
    r.wake();
    return;
  }
  let t = 0;
  r.ticks.push((dt) => {
    t = Math.min(1, t + dt / secs);
    const k = ease(t);
    r.camera.position.lerpVectors(p0, v.pos, k);
    r.controls.target.lerpVectors(l0, v.look, k);
    return t >= 1;
  });
}

// ---------------------------------------------------------------- shot setup

function placeGolfer(r: Rig, at: LngLat, face: LngLat) {
  const w = r.world;
  const ball = w.toScene(at);
  const phi = Math.PI / 2 - (bearingDeg(w, at, face) * Math.PI) / 180;
  const g = r.golfer;
  if (g.root.parent !== r.scene) r.scene.add(g.root);
  g.root.rotation.set(0, phi, 0);
  g.root.position
    .copy(ball)
    .sub(new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(0.62));
  g.root.position.y = w.y(...(w.frame.toEN(...at) as EN)) - 0.02;
  g.stand();
  g.showClub(true);
  g.root.visible = true;
  r.ball.position.copy(ball).setY(ball.y + 0.05);
  r.ball.visible = true;
}

function parkCart(r: Rig, at: LngLat, face: LngLat) {
  const w = r.world;
  const p = w.frame.toEN(...at);
  const near = nearestOnPaths(w.pathLines, p);
  let pos: EN;
  let heading: number;
  if (near && Math.hypot(near.p[0] - p[0], near.p[1] - p[1]) < 40) {
    pos = near.p;
    heading = near.heading;
  } else {
    const b = (bearingDeg(w, at, face) * Math.PI) / 180;
    pos = [p[0] - Math.sin(b) * 6 - Math.cos(b) * 5, p[1] - Math.cos(b) * 6 + Math.sin(b) * 5];
    heading = b;
  }
  setCart(r, pos, heading);
  r.cart.root.visible = true;
}

function setCart(r: Rig, p: EN, heading: number) {
  const w = r.world;
  const fx = Math.sin(heading) * 0.9;
  const fy = Math.cos(heading) * 0.9;
  const hf = w.y(p[0] + fx, p[1] + fy);
  const hb = w.y(p[0] - fx, p[1] - fy);
  r.cart.root.position.set(p[0], Math.max(hf, hb) - 0.03, -p[1]);
  r.cart.root.rotation.set(0, Math.PI - heading, 0, 'YXZ');
  r.cart.root.rotation.x = -Math.atan2(hf - hb, 1.8);
}

function setShot(r: Rig, s: ShotSetup) {
  r.ticks = [];
  placeGolfer(r, s.start, s.aim);
  parkCart(r, s.start, s.aim);
  clearLine(r.trail);
  r.marker.visible = !!s.target;
  if (s.target) r.marker.position.copy(r.world.toScene(s.target, 0.05));
  const pts = s.advice ? flightPoints(r, s.start, s.advice) : [];
  clearLine(r.preview);
  r.preview.geometry.setFromPoints(pts);
  r.preview.computeLineDistances();
  r.preview.visible = pts.length > 1;
  fly(r, behind(r.world, s.start, s.target ?? s.aim, 1), 1.1);
  practiceSwing(r);
}

function flightPoints(r: Rig, start: LngLat, a: Advice): THREE.Vector3[] {
  const o = r.world.toScene(start, 0.05);
  return a.flight.pts.map(([x, y, z]) => new THREE.Vector3(o.x + x, o.y + z, o.z - y));
}

// ---------------------------------------------------------------- the shot

function hit(r: Rig, a: Advice, done: (rest: LngLat | null) => void) {
  const w = r.world;
  const start = w.toLngLat(r.ball.position);
  const pts = flightPoints(r, start, a);
  const dir = dirOf(a.aimDeg);
  const g = r.golfer;
  g.showClub(true);
  r.preview.visible = false;
  r.ticks = [];
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const g0 = g.root.position.clone();
  fly(
    r,
    {
      pos: g0.clone().addScaledVector(dir, -4.2).addScaledVector(side, 6.8).setY(g0.y + 2.3),
      look: g0.clone().addScaledVector(dir, 0.6).setY(g0.y + 0.9),
    },
    0.5,
  );
  const trail: THREE.Vector3[] = [];
  let t = 0;
  const flightT = a.flight.t;
  const n = pts.length - 1;
  let phase: 'swing' | 'air' | 'roll' | 'done' = 'swing';
  let rollFrom = new THREE.Vector3();
  let rollTo = new THREE.Vector3();
  let rollT = 0;
  let wet = false;
  const camBack = new THREE.Vector3();

  r.ticks.push((dt) => {
    t += dt;
    g.applySwing(swingPose(Math.min(t, SWING_END)));
    if (phase === 'swing' && t >= IMPACT_T) phase = 'air';
    if (phase === 'air') {
      const k = Math.min(1, (t - IMPACT_T) / flightT);
      const f = k * n;
      const i = Math.min(Math.floor(f), n - 1);
      r.ball.position.lerpVectors(pts[i]!, pts[i + 1]!, f - i);
      trail.push(r.ball.position.clone());
      r.trail.geometry.dispose();
      r.trail.geometry = new THREE.BufferGeometry().setFromPoints(trail);
      if (k >= 1) {
        const land = r.ball.position.clone();
        const ll = w.toLngLat(land);
        const surface = w.surfaceAt(ll);
        wet = surface === 'water';
        const roll = wet ? 0 : rollYards(a.flight, surface) * YARD;
        rollFrom = land;
        rollTo = land.clone().addScaledVector(dir, roll);
        phase = 'roll';
        rollT = 0;
      }
    }
    if (phase === 'roll') {
      rollT = Math.min(1, rollT + dt / 1.4);
      const k = 1 - (1 - rollT) ** 2;
      const p = rollFrom.clone().lerp(rollTo, k);
      // stop at the water's edge
      if (!wet && w.surfaceAt(w.toLngLat(p)) === 'water') {
        wet = true;
        rollT = 1;
      }
      const en = w.frame.toEN(...w.toLngLat(p));
      r.ball.position.set(p.x, w.y(en[0], en[1]) + 0.05, p.z);
      if (rollT >= 1) phase = 'done';
    }
    // camera: hold behind the golfer through the swing, then chase the ball
    if (phase !== 'swing' && t > IMPACT_T + 0.35) {
      camBack
        .copy(r.ball.position)
        .addScaledVector(dir, -30)
        .setY(r.ball.position.y + 16);
      r.camera.position.lerp(camBack, Math.min(1, dt * 1.6));
      r.controls.target.lerp(r.ball.position, Math.min(1, dt * 4));
    }
    if (phase === 'done' && t > SWING_END + 0.4) {
      g.stand();
      if (wet) r.ball.visible = false;
      done(wet ? null : w.toLngLat(r.ball.position));
      return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------- driving

function drive(r: Rig, to: LngLat, face: LngLat, done: () => void) {
  const w = r.world;
  const g = r.golfer;
  const cart = r.cart;
  const from: EN = [cart.root.position.x, -cart.root.position.z];
  const dest = w.frame.toEN(...to);
  const near = nearestOnPaths(w.pathLines, dest);
  const end = near && Math.hypot(near.p[0] - dest[0], near.p[1] - dest[1]) < 60 ? near.p : dest;
  const line = route(w.paths, from, end);
  const len = lineLength(line);
  const secs = Math.min(Math.max(len / 14, 2.5), 12);
  r.ball.visible = false;
  r.marker.visible = false;
  r.preview.visible = false;
  clearLine(r.trail);
  g.sit();
  cart.seat.add(g.root);
  g.root.position.set(0, 0, 0);
  g.root.rotation.set(0, 0, 0);
  let t = 0;
  const chase = new THREE.Vector3();
  r.ticks.push((dt) => {
    t = Math.min(secs, t + dt);
    const k = ease(t / secs);
    const { pos, heading } = pointAlong(line, k * len);
    setCart(r, pos, heading);
    for (const wh of cart.wheels) wh.rotation.x += dt * 12;
    const fwd = dirOf((heading * 180) / Math.PI);
    chase
      .copy(cart.root.position)
      .addScaledVector(fwd, -14)
      .setY(cart.root.position.y + 7);
    r.camera.position.lerp(chase, Math.min(1, dt * 2.5));
    r.controls.target.lerp(cart.root.position, Math.min(1, dt * 5));
    if (t < secs) return false;
    placeGolfer(r, to, face);
    done();
    return true;
  });
}

// ---------------------------------------------------------------- bits

/** A slow half-swing rehearsal while lining up the shot. */
function practiceSwing(r: Rig) {
  let t = -1.3; // let the camera settle first
  r.ticks.push((dt) => {
    t += dt;
    if (t < 0) return false;
    const k = t < 1.2 ? t / 1.2 : Math.max(0, 1 - (t - 1.6) / 1.1);
    const top = swingPose(1.15);
    const addr = swingPose(0);
    const mix = (a: number, b: number) => a + (b - a) * ease(Math.min(1, k)) * 0.55;
    r.golfer.applySwing({
      hipTurn: mix(addr.hipTurn, top.hipTurn),
      shoulderTurn: mix(addr.shoulderTurn, top.shoulderTurn),
      armLift: mix(addr.armLift, top.armLift),
      wristCock: mix(addr.wristCock, top.wristCock),
    });
    return t > 2.8;
  });
}

function clearLine(l: THREE.Line) {
  l.geometry.dispose();
  l.geometry = new THREE.BufferGeometry();
}

function targetMarker(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: MINT, side: THREE.DoubleSide }),
  );
  g.add(ring);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 6, 6).translate(0, 3, 0),
    new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.7 }),
  );
  g.add(pole);
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
