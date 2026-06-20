// TripCast Service Worker — basemap tile cache only.
//
// We fetch OpenFreeMap basemap assets (tiles/glyphs/sprites/style) directly from
// the browser now (the Convex map proxy was removed to cut data egress). Those
// responses are CORS-enabled and carry very long max-age headers, so the browser
// HTTP cache already handles most repeat loads. This SW adds a durable,
// bounded Cache Storage layer so revisits stay fast even after HTTP-cache
// eviction. It intentionally touches ONLY OpenFreeMap GETs — everything else
// falls straight through to the network.

const CACHE_NAME = "ofm-tiles-v1";
const OFM_HOST = "tiles.openfreemap.org";
const MAX_ENTRIES = 2000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any older cache versions.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("ofm-tiles-") && n !== CACHE_NAME).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  // keys() preserves insertion order, so the front entries are the oldest.
  const overflow = keys.length - MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.hostname !== OFM_HOST) return; // only basemap assets

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        // Only cache successful, non-opaque responses (OpenFreeMap sends CORS).
        if (response.ok && response.type !== "opaque") {
          await cache.put(request, response.clone());
          void trimCache(cache);
        }
        return response;
      } catch (err) {
        // Offline and not cached — let the failure surface to MapLibre.
        throw err;
      }
    })(),
  );
});
