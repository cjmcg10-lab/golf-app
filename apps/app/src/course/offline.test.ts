import { describe, expect, test } from 'vitest';
import { downloadForOffline, isDownloaded, pruneAppShell } from './offline';

class FakeCache {
  store = new Map<string, Response>();
  async put(url: string, res: Response) {
    this.store.set(url, res);
  }
  async match(url: string) {
    return this.store.get(url);
  }
  async keys() {
    return [...this.store.keys()].map((k) => new Request(`http://x${k}`));
  }
  async delete(req: Request | string) {
    return this.store.delete(typeof req === 'string' ? req : new URL(req.url).pathname);
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

const fetcher = (async (url: string) => new Response(`bytes:${url}`)) as typeof fetch;

describe('offline', () => {
  test('downloadCachesCoursePackage', async () => {
    const cs = new FakeCaches();
    const progress: number[] = [];
    const r = await downloadForOffline('mini', '1', {
      fetcher,
      caches: cs as unknown as CacheStorage,
      onProgress: (done, total) => progress.push(done / total),
    });
    const cache = cs.caches.get('course-mini-1')!;
    expect(r.files).toBe(8);
    // '.complete' is the marker written last, after every file succeeded
    expect([...cache.store.keys()].filter((k) => !k.endsWith('.complete')).sort()).toEqual([
      '/courses/mini/course.json',
      '/courses/mini/elevation-course.bin',
      '/courses/mini/features.geojson',
      '/courses/mini/ground-0.png',
      '/courses/mini/ground-1.png',
      '/courses/mini/ground-2.png',
      '/courses/mini/ground-3.png',
      '/courses/mini/scenery.geojson',
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
      url.includes('ground-2') ? new Response('', { status: 500 }) : fetcher(url)) as typeof fetch;
    await expect(
      downloadForOffline('mini', '1', { fetcher: flaky, caches: cs as unknown as CacheStorage }),
    ).rejects.toThrow(/ground-2/);
    expect(
      await isDownloaded('mini', '1', { fetcher, caches: cs as unknown as CacheStorage }),
    ).toBe(false);
  });

  test('appShellCachedWithDownload', async () => {
    const cs = new FakeCaches();
    const shell = ['/', '/_expo/static/js/web/info-abc.js', '/courses/index.json'];
    const f = (async (url: string) =>
      url === '/shell.json' ? new Response(JSON.stringify(shell)) : fetcher(url)) as typeof fetch;
    const r = await downloadForOffline('mini', '1', {
      fetcher: f,
      caches: cs as unknown as CacheStorage,
    });
    const keys = [...cs.caches.get('course-mini-1')!.store.keys()];
    for (const k of shell) expect(keys).toContain(k);
    expect(r.files).toBe(11);
  });

  test('noProgressAfterFailure', async () => {
    const cs = new FakeCaches();
    const many = Array.from({ length: 30 }, (_, i) => `/_expo/static/js/web/c${i}.js`);
    const tick = () => new Promise((r) => setTimeout(r, 1));
    const slow = (async (url: string) => {
      if (url === '/shell.json') return new Response(JSON.stringify(many));
      await tick();
      return url.endsWith('/c0.js') ? new Response('', { status: 500 }) : new Response('x');
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

  test('pruneAppShellDropsOldBundles', async () => {
    const cs = new FakeCaches();
    const shell = await cs.open('app-shell');
    for (const k of ['/', '/_expo/static/js/web/old-1.js', '/_expo/static/js/web/new-2.js'])
      await shell.put(k, new Response('x'));
    const f = (async () =>
      new Response(JSON.stringify(['/', '/_expo/static/js/web/new-2.js']))) as typeof fetch;
    await pruneAppShell({ fetcher: f, caches: cs as unknown as CacheStorage });
    expect([...shell.store.keys()].sort()).toEqual(['/', '/_expo/static/js/web/new-2.js']);
  });
});
