const CACHE_PREFIX = 'void-squadron-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_ROOT = new URL('./', self.location.href);
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  ...Array.from(self.__PRECACHE_ASSETS__ ?? []),
];
const OPTIONAL_ASSETS = [
  ...Array.from({ length: 7 }, (_, index) => `./audio/voice/ch${index + 1}-brief.mp3`),
  ...Array.from({ length: 7 }, (_, index) => `./audio/voice/ch${index + 1}-debrief.mp3`),
  ...[
    'ace-engages', 'asset-low', 'autocombat-on', 'autopilot-on', 'boss-critical', 'boss-exposed',
    'boss-warning', 'chapter-failed', 'chapter-success', 'defeat', 'hull-critical', 'launch-arcade',
    'low-energy', 'manual-control', 'menu-welcome', 'pickup-aegis', 'pickup-overcharge',
    'pickup-torpedo', 'raid-inbound', 'salvage', 'scan-slow', 'shields-down', 'stage-complete',
    'stealth-alarm', 'stealth-warning', 'target-locked', 'torpedo-away', 'torpedo-empty',
    'upgrade-attack', 'upgrade-defense', 'upgrade-hull', 'victory-arcade', 'wave-2', 'wave-3', 'wave-4',
  ].map((line) => `./audio/voice/${line}.mp3`),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS.map((asset) => new URL(asset, APP_ROOT)));
    await Promise.all(OPTIONAL_ASSETS.map(async (asset) => {
      const url = new URL(asset, APP_ROOT);
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {
        // Optional narration clips must not prevent the app shell from installing.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return;

  if (url.pathname.includes('/audio/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL('./index.html', APP_ROOT), response.clone());
        }
        return response;
      } catch {
        return (await caches.match(new URL('./index.html', APP_ROOT))) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});
