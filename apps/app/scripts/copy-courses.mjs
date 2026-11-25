// Copies built course packages into public/ so `expo export` ships them as static files.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const src = join(root, 'courses');
const dst = resolve(import.meta.dirname, '../public/courses');
// builder inputs and builder-only outputs stay out of the public site (elevation is unused until
// the physics milestone ships it)
const SKIP = new Set([
  '.cache',
  'build.yaml',
  'manual.yaml',
  'ai.geojson',
  'AI_NOTES.md',
  'review.html',
  'greens',
  'elevation-course.bin',
]);

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const id of readdirSync(src)) {
  if (!existsSync(join(src, id, 'course.json'))) continue;
  cpSync(join(src, id), join(dst, id), {
    recursive: true,
    filter: (p) => !SKIP.has(p.split(/[\\/]/).pop() ?? ''),
  });
  console.log(`copied course ${id}`);
}

// MapLibre 6 runs its tile worker from a separate module file that Metro does not bundle.
const worker = resolve(
  import.meta.dirname,
  '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
);
cpSync(worker, resolve(import.meta.dirname, '../public/maplibre-gl-worker.mjs'));
console.log('copied maplibre worker');
