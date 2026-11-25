import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A dimpled golf ball spinning slowly; transparent background. */
export function GolfBall({ size = 200 }: { size?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = el.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL: the launch screen works without the ball
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0, 4.4);
    scene.add(new THREE.HemisphereLight('#ffffff', '#3b5a78', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(-2, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#3ee6c4', 1.2);
    rim.position.set(3, -1, -2);
    scene.add(rim);
    const ball = new THREE.Mesh(
      dimpledSphere(),
      new THREE.MeshStandardMaterial({ color: '#f7f8fa', roughness: 0.38, metalness: 0 }),
    );
    ball.rotation.z = 0.35;
    scene.add(ball);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      if (renderer.domElement.clientWidth === 0) return; // screen is hidden under another one
      ball.rotateY(dt * 0.9);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ball.geometry.dispose();
      (ball.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size]);
  return <div ref={el} data-testid="golf-ball" style={{ width: size, height: size }} />;
}

/** Unit sphere with ~330 shallow round dimples (Fibonacci-spaced, as on a real ball). */
function dimpledSphere(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 48);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico); // shared vertices, so the dimples shade smoothly
  const n = 330;
  const centres: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    centres.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const radius = 0.105; // angular radius of a dimple (radians)
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let best = Math.PI;
    for (const c of centres) {
      const d = v.angleTo(c);
      if (d < best) best = d;
    }
    const t = best / radius;
    const depth = t < 1 ? 0.018 * (1 - t * t) : 0;
    v.multiplyScalar(1 - depth);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  ico.dispose();
  g.computeVertexNormals();
  return g;
}
