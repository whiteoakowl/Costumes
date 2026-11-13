/*
 * Dance Studio & Costumes — service worker.
 * The build (vite.config.ts) fills in the version and the list of app files and writes this out as dist/sw.js.
 *
 * - App files (HTML, scripts, styles, icons) are saved on the device so the app opens instantly.
 * - Pages: try the network first so updates show up, fall back to the saved copy, and show
 *   offline.html if nothing is saved yet.
 * - Hashed build files (assets/…) never change, so they are served straight from the device.
 */
const VERSION = '__VERSION__';
const CACHE = `dance-studio-${VERSION}`;
const PRECACHE = __PRECACHE__;
const OFFLINE_URL = './offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dance-studio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle this app's own files. Database and API calls (e.g. Supabase) always go to the network.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match('./index.html', { ignoreVary: true })) || (await cache.match(OFFLINE_URL, { ignoreVary: true })) || Response.error();
        }),
    );
    return;
  }

  // Everything else from this site: saved copy first, then the network (and save it for next time).
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreVary: hosts often send "Vary: Origin", which would otherwise stop saved files from matching.
      const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: url.pathname.endsWith('.html') });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    }),
  );
});
