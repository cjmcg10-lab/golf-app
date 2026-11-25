// Offline support for the web app.
// - /courses/**/tiles/**: cache first (filled by "Download for offline")
// - other /courses/** files: network first (3 s timeout), falling back to the downloaded copy
// - app shell (pages, JS, CSS): network first, cached as it loads, served when offline
const SHELL = 'app-shell';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const fromCache = (key) => caches.match(key, { ignoreSearch: true });

// Network first, but on a stalled connection (one bar on the course) fall back to the cached
// copy after 3 s instead of waiting for the browser's own timeout.
const networkFirst = (req, key, onFresh) => {
  const net = fetch(req).then((res) => {
    if (res.ok && onFresh) onFresh(res.clone());
    return res;
  });
  const slow = new Promise((r) => setTimeout(r, 3000)).then(() => fromCache(key));
  const fallback = () => fromCache(key).then((hit) => hit || Response.error());
  return Promise.race([net.catch(fallback), slow.then((hit) => hit || net.catch(fallback))]);
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/courses/')) {
    if (url.pathname.includes('/tiles/')) {
      e.respondWith(fromCache(url.pathname).then((hit) => hit || fetch(req)));
    } else {
      e.respondWith(networkFirst(req, url.pathname));
    }
    return;
  }

  const key = req.mode === 'navigate' ? '/' : url.pathname;
  e.respondWith(networkFirst(req, key, (copy) => caches.open(SHELL).then((c) => c.put(key, copy))));
});
