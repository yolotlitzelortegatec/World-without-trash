/* ══════════════════════════════════════════════════════════════
   World – Basureros  |  Service Worker
   Estrategia: Cache First para assets estáticos
                Network First para tiles del mapa y API calls
══════════════════════════════════════════════════════════════ */

const CACHE_NAME    = 'world-v1.0';
const TILE_CACHE    = 'world-tiles-v1';
const API_CACHE     = 'world-api-v1';

// Archivos que se cachean al instalar (shell de la app)
const SHELL_ASSETS = [
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Special+Elite&family=Share+Tech+Mono&display=swap',
];

// ── INSTALL: pre-cache app shell ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== TILE_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia por tipo de recurso ───────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1. Tiles de OpenStreetMap → Cache First (guardar para offline)
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(event.request, TILE_CACHE));
    return;
  }

  // 2. Nominatim (geocoding/búsqueda) → Network First, sin caché larga
  if (url.includes('nominatim.openstreetmap.org')) {
    event.respondWith(networkFirst(event.request, API_CACHE, 5000));
    return;
  }

  // 3. Overpass API (basureros reales) → Network First
  if (url.includes('overpass-api.de')) {
    event.respondWith(networkFirst(event.request, API_CACHE, 10000));
    return;
  }

  // 4. Fonts de Google → Cache First
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // 5. CDN de Leaflet / otros scripts → Cache First
  if (url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // 6. App shell (index.html y assets locales) → Cache First
  if (event.request.mode === 'navigate' || url.includes('./')) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }
});

// ── ESTRATEGIAS ─────────────────────────────────────────────

// Cache First: sirve desde caché, si no está va a red y cachea
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Sin conexión', { status: 503 });
  }
}

// Network First: intenta red primero, fallback a caché
async function networkFirst(request, cacheName, timeoutMs = 8000) {
  const cache = await caches.open(cacheName);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── BACKGROUND SYNC (futuro: reportar basureros offline) ────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncPendingReports());
  }
});

async function syncPendingReports() {
  // Placeholder para sincronizar reportes hechos offline
  console.log('[SW] Sincronizando reportes pendientes...');
}

// ── PUSH NOTIFICATIONS (futuro) ─────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'World – Basureros', {
      body:    data.body || 'Hay basureros llenos cerca de ti',
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-72.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
