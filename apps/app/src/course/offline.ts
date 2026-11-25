/**
 * "Download for offline": puts the course package and every imagery tile into Cache Storage.
 * public/sw.js serves /courses/** from these caches when the network is unavailable.
 */
interface Opts {
  fetcher?: typeof fetch;
  caches?: CacheStorage;
  onProgress?: (done: number, total: number) => void;
}

const MARKER = '.complete';
const cacheName = (id: string, version: string) => `course-${id}-${version}`;
const env = (o: Opts) => ({
  fetcher: o.fetcher ?? fetch,
  caches: o.caches ?? (globalThis.caches as CacheStorage | undefined),
});

export const offlineSupported = () =>
  typeof globalThis.caches !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator;

export async function isDownloaded(id: string, version: string, o: Opts = {}): Promise<boolean> {
  const { caches } = env(o);
  if (!caches || !(await caches.has(cacheName(id, version)))) return false;
  const c = await caches.open(cacheName(id, version));
  return !!(await c.match(`/courses/${id}/${MARKER}`));
}

export async function downloadForOffline(
  id: string,
  version: string,
  o: Opts = {},
): Promise<{ files: number; bytes: number }> {
  const { fetcher, caches } = env(o);
  if (!caches) throw new Error('Offline storage is not available in this browser');
  const base = `/courses/${id}`;
  const idx = await fetcher(`${base}/tiles/index.json`);
  if (!idx.ok) throw new Error(`Could not get the tile list (${idx.status})`);
  const tiles = (await idx.json()) as string[];
  const urls = [
    `${base}/course.json`,
    `${base}/features.geojson`,
    ...tiles.map((t) => `${base}/tiles/${t}`),
  ];
  const name = cacheName(id, version);
  const cache = await caches.open(name);
  let done = 0;
  let bytes = 0;
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const res = await fetcher(url);
      if (!res.ok) throw new Error(`Download failed for ${url} (${res.status})`);
      const body = await res.clone().arrayBuffer();
      bytes += body.byteLength;
      await cache.put(url, res);
      o.onProgress?.(++done, urls.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: 6 }, worker));
  } catch (e) {
    await caches.delete(name);
    throw e;
  }
  await cache.put(`${base}/${MARKER}`, new Response('1'));
  for (const k of await caches.keys()) {
    if (k.startsWith(`course-${id}-`) && k !== name) await caches.delete(k);
  }
  return { files: urls.length, bytes };
}
