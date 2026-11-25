// Copies built course packages into public/ so `expo export` ships them as static files.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const src = join(root, 'courses');
const dst = resolve(import.meta.dirname, '../public/courses');
// builder inputs and builder-only outputs stay out of the public site
const SKIP = new Set([
  '.cache',
  'build.yaml',
  'manual.yaml',
  'ai.geojson',
  'AI_NOTES.md',
  'review.html',
  'greens',
  'tiles', // satellite imagery: the app draws its own ground now
]);

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
const index = [];
for (const id of readdirSync(src)) {
  if (!existsSync(join(src, id, 'course.json'))) continue;
  const c = JSON.parse(readFileSync(join(src, id, 'course.json'), 'utf8'));
  index.push({ id, name: c.name, address: c.address, holes: c.holes.length, par: c.par });
  cpSync(join(src, id), join(dst, id), {
    recursive: true,
    filter: (p) => !SKIP.has(p.split(/[\\/]/).pop() ?? ''),
  });
  console.log(`copied course ${id}`);
}

index.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(dst, 'index.json'), JSON.stringify(index));
console.log(`course index: ${index.length} course(s)`);
