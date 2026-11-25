import * as THREE from 'three';

/** Joint angles (radians) of the address position. */
interface Pose {
  hipTurn: number;
  shoulderTurn: number;
  armLift: number;
  wristCock: number;
}

const mat = (color: string | number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const box = (w: number, h: number, d: number, m: THREE.Material) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt: number, rb: number, h: number, seg: number, m: THREE.Material) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

const SHIRTS = ['#3ee6c4', '#f2795a', '#5b8def', '#f3c94b', '#e8eef2', '#b07cf0'];
const PANTS = ['#2c3a4a', '#c9b48a', '#46505c', '#e9e4d8'];
const SKIN = ['#f1c7a5', '#d9a47e', '#a86f4c', '#7a4a31'];

export interface Golfer {
  root: THREE.Group;
  stand(): void;
  sit(): void;
  relax(): void;
  showClub(v: boolean): void;
}

/**
 * Right-handed golfer, chest facing local +z, target on the golfer's left (local +x).
 * Ball sits at local (0, 0, 0.62). Pivots: hips → torso → shoulders → arms → club.
 */
export function makeGolfer(seed = 0): Golfer {
  const shirt = mat(SHIRTS[seed % SHIRTS.length]!);
  const pants = mat(PANTS[(seed >> 1) % PANTS.length]!);
  const skin = mat(SKIN[(seed >> 2) % SKIN.length]!);
  const shoe = mat('#f4f4f4');
  const cap = mat(SHIRTS[(seed + 3) % SHIRTS.length]!);
  const steel = mat('#cfd6dc');
  const grip = mat('#1d2329');

  const root = new THREE.Group();
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (const side of [-1, 1]) {
    const hip = at(new THREE.Group(), side * 0.11, 0.92, 0);
    hip.add(at(box(0.15, 0.46, 0.17, pants), 0, -0.23, 0));
    const knee = at(new THREE.Group(), 0, -0.46, 0);
    knee.add(at(box(0.13, 0.42, 0.14, pants), 0, -0.21, 0));
    knee.add(at(box(0.13, 0.08, 0.26, shoe), 0, -0.44, 0.05));
    hip.add(knee);
    root.add(hip);
    legs.push({ hip, knee });
  }
  // stance: feet a little wider than the shoulders
  legs[0]!.hip.rotation.z = -0.1;
  legs[1]!.hip.rotation.z = 0.1;

  const hips = at(new THREE.Group(), 0, 0.92, 0);
  root.add(hips);
  hips.add(at(box(0.36, 0.16, 0.2, pants), 0, 0.02, 0));
  const torso = new THREE.Group();
  torso.rotation.x = 0.42; // spine tilt over the ball
  hips.add(torso);
  torso.add(at(box(0.4, 0.5, 0.24, shirt), 0, 0.3, 0));
  const shoulders = at(new THREE.Group(), 0, 0.52, 0);
  torso.add(shoulders);
  shoulders.add(at(cyl(0.05, 0.06, 0.08, 6, skin), 0, 0.06, 0));
  const head = at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), skin), 0, 0.2, 0.02);
  shoulders.add(head);
  const capMesh = at(cyl(0.125, 0.13, 0.07, 7, cap), 0, 0.28, 0.02);
  shoulders.add(capMesh);
  shoulders.add(at(box(0.16, 0.02, 0.12, cap), 0, 0.255, 0.12));

  // both arms hang from the shoulder line toward the hands, so one pivot moves them together
  const arms = at(new THREE.Group(), 0, -0.02, 0.02);
  shoulders.add(arms);
  for (const side of [-1, 1]) {
    const arm = at(box(0.09, 0.56, 0.09, shirt), side * 0.12, -0.27, 0);
    arm.rotation.z = side * -0.2;
    arms.add(arm);
    arms.add(at(box(0.08, 0.1, 0.08, skin), side * 0.03, -0.58, 0));
  }
  const club = at(new THREE.Group(), 0, -0.6, 0);
  arms.add(club);
  club.add(at(cyl(0.018, 0.018, 0.22, 5, grip), 0, -0.08, 0));
  club.add(at(cyl(0.011, 0.011, 0.78, 5, steel), 0, -0.55, 0));
  club.add(at(box(0.09, 0.05, 0.05, steel), 0.03, -0.95, 0));

  const pose = (p: Pose) => {
    hips.rotation.y = -p.hipTurn;
    shoulders.rotation.y = -(p.shoulderTurn - p.hipTurn);
    arms.rotation.x = -p.armLift;
    club.rotation.x = -p.wristCock - 0.35;
  };

  return {
    root,
    stand() {
      torso.rotation.x = 0.42;
      for (const l of legs) {
        l.hip.rotation.x = 0;
        l.knee.rotation.x = 0.12;
      }
      pose({ hipTurn: 0, shoulderTurn: 0, armLift: 0.28, wristCock: 0 });
    },
    sit() {
      torso.rotation.x = 0.05;
      for (const l of legs) {
        l.hip.rotation.x = -1.45;
        l.knee.rotation.x = 1.45;
      }
      hips.rotation.y = 0;
      shoulders.rotation.y = 0;
      arms.rotation.x = -1.0; // hands forward on the wheel
      club.visible = false;
    },
    relax() {
      this.stand();
      torso.rotation.x = 0.06;
      arms.rotation.x = -0.04;
      club.visible = false;
    },
    showClub(v) {
      club.visible = v;
    },
  };
}

/** A relaxed standing figure (a playing partner or someone waiting on the tee). */
export function makeBystander(seed: number): THREE.Group {
  const g = makeGolfer(seed);
  g.relax();
  return g.root;
}

export interface Cart {
  root: THREE.Group;
  seat: THREE.Object3D; // driver's seat; a seated golfer is parented here
  wheels: THREE.Object3D[];
}

/** Two-seat golf cart, facing local +z. Driver sits on the left (local +x). */
export function makeCart(color = '#f4f6f2'): Cart {
  const body = mat(color);
  const dark = mat('#2a3138');
  const seatM = mat('#3b4652');
  const roofM = mat('#e9edf0');
  const root = new THREE.Group();
  root.add(at(box(1.2, 0.3, 2.3, body), 0, 0.45, 0));
  root.add(at(box(1.2, 0.45, 0.55, body), 0, 0.75, 0.85)); // front cowl
  root.add(at(box(1.1, 0.12, 0.5, seatM), 0, 0.68, -0.25)); // seat base
  root.add(at(box(1.1, 0.5, 0.12, seatM), 0, 0.95, -0.52)); // backrest
  root.add(at(box(1.1, 0.25, 0.6, body), 0, 0.72, -0.85)); // bag deck
  root.add(at(cyl(0.12, 0.12, 0.8, 6, mat('#22313f')), 0.25, 1.1, -0.95)); // golf bag
  root.add(at(cyl(0.12, 0.12, 0.8, 6, mat('#7a2f2f')), -0.25, 1.1, -0.95));
  for (const [x, z] of [
    [0.55, 0.95],
    [-0.55, 0.95],
    [0.55, -0.6],
    [-0.55, -0.6],
  ] as const)
    root.add(at(box(0.05, 1.25, 0.05, dark), x, 1.45, z));
  root.add(at(box(1.3, 0.06, 1.85, roofM), 0, 2.08, 0.15));
  const wheelCol = at(cyl(0.025, 0.025, 0.5, 5, dark), 0.28, 1.0, 0.45);
  wheelCol.rotation.x = 0.6;
  root.add(wheelCol);
  const sw = at(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 4, 10), dark), 0.28, 1.2, 0.32);
  sw.rotation.x = 0.95;
  root.add(sw);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [
    [0.6, 0.8],
    [-0.6, 0.8],
    [0.6, -0.75],
    [-0.6, -0.75],
  ] as const) {
    const w = at(cyl(0.22, 0.22, 0.16, 8, dark), x, 0.22, z);
    w.rotation.z = Math.PI / 2;
    root.add(w);
    wheels.push(w);
  }
  const seat = at(new THREE.Object3D(), 0.28, 0.74 - 0.92, -0.22);
  root.add(seat);
  return { root, seat, wheels };
}

/** Flagstick with a pennant, height 2.4 m. */
export function makeFlag(color = '#ff4d4d'): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.02, 0.02, 2.4, 5, mat('#f6f6f6')), 0, 1.2, 0));
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.7, -0.22),
    new THREE.Vector2(0, -0.44),
  ]);
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
  );
  flag.position.set(0, 2.38, 0);
  g.add(flag);
  g.add(at(cyl(0.06, 0.06, 0.02, 10, mat('#2b2b2b')), 0, 0.005, 0)); // cup
  return g;
}

/** Tee marker pair (coloured balls). */
export function makeTeeMarker(color: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(color));
}
