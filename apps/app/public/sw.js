// Offline support for the web app.
// - /courses/**/tiles/**: cache first (filled by "Download for offline")
// - other /courses/** files: network first, falling back to the downloaded copy
// - app shell (pages, JS, CSS): network first, cached as it loads, served when offline
const SHELL = 'app-shell';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const fromCache = (key) => caches.match(key, { ignoreSearch: true });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/courses/')) {
    if (url.pathname.includes('/tiles/')) {
      e.respondWith(fromCache(url.pathname).then((hit) => hit || fetch(req)));
    } else {
      e.respondWith(
        fetch(req).catch(() => fromCache(url.pathname).then((hit) => hit || Response.error())),
      );
    }
    return;
  }

  const key = req.mode === 'navigate' ? '/' : url.pathname;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => fromCache(key).then((hit) => hit || Response.error())),
  );
});
