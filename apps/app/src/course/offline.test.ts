import { describe, expect, test } from 'vitest';
import { downloadForOffline, isDownloaded } from './offline';

class FakeCache {
  store = new Map<string, Response>();
  async put(url: string, res: Response) {
    this.store.set(url, res);
  }
  async match(url: string) {
    return this.store.get(url);
  }
}
class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async has(name: string) {
    return this.caches.has(name);
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
}

const tiles = ['15/1/2.jpg', '16/3/4.jpg', '17/7/8.jpg'];
const fetcher = (async (url: string) =>
  url.endsWith('index.json')
    ? new Response(JSON.stringify(tiles))
    : new Response(`bytes:${url}`)) as typeof fetch;

describe('offline', () => {
  test('downloadCachesAllTiles', async () => {
    const cs = new FakeCaches();
    const progress: number[] = [];
    const r = await downloadForOffline('mini', '1', {
      fetcher,
      caches: cs as unknown as CacheStorage,
      onProgress: (done, total) => progress.push(done / total),
    });
    const cache = cs.caches.get('course-mini-1')!;
    expect(r.files).toBe(5);
    // '.complete' is the marker written last, after every file succeeded
    expect([...cache.store.keys()].filter((k) => !k.endsWith('.complete')).sort()).toEqual([
      '/courses/mini/course.json',
      '/courses/mini/features.geojson',
      '/courses/mini/tiles/15/1/2.jpg',
      '/courses/mini/tiles/16/3/4.jpg',
      '/courses/mini/tiles/17/7/8.jpg',
    ]);
    expect(progress.at(-1)).toBe(1);
    expect(r.bytes).toBeGreaterThan(0);
  });

  test('isDownloadedAfterDownload', async () => {
    const cs = new FakeCaches();
    const opts = { fetcher, caches: cs as unknown as CacheStorage };
    expect(await isDownloaded('mini', '1', opts)).toBe(false);
    await downloadForOffline('mini', '1', opts);
    expect(await isDownloaded('mini', '1', opts)).toBe(true);
    expect(await isDownloaded('mini', '2', opts)).toBe(false);
  });

  test('oldVersionsRemoved', async () => {
    const cs = new FakeCaches();
    await cs.open('course-mini-0');
    await cs.open('app-shell');
    await downloadForOffline('mini', '1', { fetcher, caches: cs as unknown as CacheStorage });
    expect((await cs.keys()).sort()).toEqual(['app-shell', 'course-mini-1']);
  });

  test('failedFileRejects', async () => {
    const cs = new FakeCaches();
    const flaky = (async (url: string) =>
      url.includes('16/3/4') ? new Response('', { status: 500 }) : fetcher(url)) as typeof fetch;
    await expect(
      downloadForOffline('mini', '1', { fetcher: flaky, caches: cs as unknown as CacheStorage }),
    ).rejects.toThrow(/16\/3\/4/);
    expect(
      await isDownloaded('mini', '1', { fetcher, caches: cs as unknown as CacheStorage }),
    ).toBe(false);
  });

  test('appShellCachedWithDownload', async () => {
    const cs = new FakeCaches();
    const shell = ['/', '/_expo/static/js/web/info-abc.js', '/maplibre-gl-worker.mjs'];
    const f = (async (url: string) =>
      url === '/shell.json' ? new Response(JSON.stringify(shell)) : fetcher(url)) as typeof fetch;
    const r = await downloadForOffline('mini', '1', {
      fetcher: f,
      caches: cs as unknown as CacheStorage,
    });
    const keys = [...cs.caches.get('course-mini-1')!.store.keys()];
    for (const k of shell) expect(keys).toContain(k);
    expect(r.files).toBe(8);
  });

  test('noProgressAfterFailure', async () => {
    const cs = new FakeCaches();
    const many = Array.from({ length: 30 }, (_, i) => `15/${i}/0.jpg`);
    const tick = () => new Promise((r) => setTimeout(r, 1));
    const slow = (async (url: string) => {
      if (url.endsWith('index.json')) return new Response(JSON.stringify(many));
      await tick();
      return url.includes('15/0/0') ? new Response('', { status: 500 }) : new Response('x');
    }) as typeof fetch;
    let calls = 0;
    await expect(
      downloadForOffline('mini', '1', {
        fetcher: slow,
        caches: cs as unknown as CacheStorage,
        onProgress: () => calls++,
      }),
    ).rejects.toThrow();
    const atFailure = calls;
    for (let i = 0; i < 20; i++) await tick();
    expect(calls).toBe(atFailure);
  });
});
