/* aumento·renta service worker. VERSION and PRECACHE are filled in at build time (vite.config.ts). */
const VERSION = 'dev';
const PRECACHE = [];
const CACHE = `aumento-renta-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aumento-renta-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Pages: network first, so a data refresh shows up; the cached shell when offline. */
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(fallbackUrl, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackUrl);
    if (cached) return cached;
    throw error;
  }
}

/** Hashed assets (code, data, fonts, icons): cache first. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('./', scope).href));
    return;
  }
  event.respondWith(cacheFirst(request));
});
