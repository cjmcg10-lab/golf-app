// Lists the exported app shell in dist/shell.json so "Download for offline" can cache every
// route's code, not only the pages already visited (see src/course/offline.ts).
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
const files = readdirSync(resolve(dist, '_expo'), { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map(
    (d) =>
      '/' +
      resolve(d.parentPath, d.name)
        .slice(dist.length + 1)
        .replaceAll('\\', '/'),
  );
const shell = ['/', '/maplibre-gl-worker.mjs', ...files.sort()];
writeFileSync(resolve(dist, 'shell.json'), JSON.stringify(shell));
console.log(`shell.json: ${shell.length} files`);
