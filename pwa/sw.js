/*
 * Dance Studio & Costumes — service worker.
 * `npm run build` (scripts/build-sw.mjs) stamps in a version and writes this out as public/sw.js.
 *
 * - The app's built files (/_next/static/…) never change once published, so they are served
 *   straight from the device after the first visit.
 * - Pages: try the network first so updates show up, fall back to the saved copy of that page,
 *   and show offline.html if that page hasn't been saved yet.
 * - Requests to other sites (e.g. a database) are never touched.
 */
const VERSION = '__VERSION__';
const CACHE = `dance-studio-${VERSION}`;
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const OFFLINE_URL = '/offline.html';
// hosts often send "Vary: Origin", which would otherwise stop saved files from matching.
const MATCH = { ignoreVary: true };

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
  const data = event.data;
  if (data === 'skip-waiting') self.skipWaiting();
  // The page sends the files it already loaded before this worker was running, so they're saved too.
  if (data && data.type === 'cache-urls' && Array.isArray(data.urls)) {
    const urls = data.urls.filter((u) => {
      try {
        const url = new URL(u, self.location.origin);
        return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
      } catch {
        return false;
      }
    });
    event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((u) => cache.match(u, MATCH).then((hit) => hit || cache.add(u).catch(() => {}))))));
  }
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, MATCH)) || (fallbackUrl && (await cache.match(fallbackUrl, MATCH))) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, MATCH);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, OFFLINE_URL));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Screen data Next.js fetches while moving between pages (and preloads in the background)
  // changes with every deploy, so it is never saved: offline, Next.js falls back to a full page load.
  if (url.searchParams.has('_rsc') || req.headers.get('RSC')) return;
  // The manifest and other small files.
  event.respondWith(networkFirst(req));
});
