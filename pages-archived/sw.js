const CACHE_VERSION = 'cloudcroft-v1';
const RUNTIME_CACHE = 'cloudcroft-runtime-v1';
const OFFLINE_URL = '/offline.html';

// Core pages and assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Main navigation pages
  '/activities.html',
  '/attractions.html',
  '/dining.html',
  '/lodging.html',
  '/hiking-trails.html',
  '/about.html',
  '/contact.html',
  '/faq.html',
  '/sitemap.html',
  // Seasonal guides
  '/spring.html',
  '/summer.html',
  '/fall.html',
  '/winter.html',
];

// Google Fonts to cache
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// Install: precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except Google Fonts
  if (url.origin !== self.location.origin &&
      !FONT_ORIGINS.some((origin) => url.href.startsWith(origin))) {
    return;
  }

  // HTML pages: network-first with offline fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful HTML responses
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Try cache, then offline fallback
          return caches.match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Google Fonts: cache-first (they rarely change)
  if (FONT_ORIGINS.some((origin) => url.href.startsWith(origin))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Images: cache-first with network fallback
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 408, statusText: 'Offline' }));
      })
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
