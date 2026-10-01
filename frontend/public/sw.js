const CACHE_NAME = "amana-cache-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
];

const API_CACHE_NAME = "amana-api-cache-v2";
const TRADE_CACHE_NAME = "amana-trade-cache-v2";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
// Keep last 20 viewed trade details per user
const TRADE_CACHE_MAX = 20;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, API_CACHE_NAME, TRADE_CACHE_NAME].includes(key))
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Notify all clients that a new SW version is waiting to activate
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "LOGOUT") {
    // Clear all per-user caches on logout
    event.waitUntil(
      Promise.all([
        caches.delete(API_CACHE_NAME),
        caches.delete(TRADE_CACHE_NAME),
      ])
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache individual trade detail reads (GET /api/trades/:id) as offline copies
  if (request.method === "GET" && url.pathname.match(/^\/api\/trades\/[^/]+$/)) {
    event.respondWith(tradeDetailNetworkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/trades/")) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  if (
    request.method === "GET" &&
    (url.pathname.startsWith("/_next/") ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$/))
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirstWithCache(request));
});

// Called whenever a new SW version is installed and waiting
self.addEventListener("waiting", () => {
  broadcastToClients({ type: "SW_UPDATE_AVAILABLE" });
});

async function broadcastToClients(msg) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage(msg));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      const cloned = response.clone();
      const body = await cloned.text();
      cache.put(request, new Response(body, {
        headers: {
          ...Object.fromEntries(cloned.headers.entries()),
          "x-amana-cache-time": String(Date.now()),
        },
      }));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const cacheTime = cached.headers.get("x-amana-cache-time");
      if (cacheTime && Date.now() - parseInt(cacheTime) < API_CACHE_TTL_MS) {
        return cached;
      }
    }
    return new Response(JSON.stringify({ offline: true, error: "You are offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Network-first for trade detail; falls back to cached copy and stamps it with
// the time it was cached so the UI can show "offline copy from <time>".
async function tradeDetailNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheTradeDetail(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      // Re-expose cache time as a header the app can read
      const cacheTime = cached.headers.get("x-amana-cache-time");
      const headers = new Headers(cached.headers);
      if (cacheTime) headers.set("x-amana-offline-copy-time", cacheTime);
      const body = await cached.text();
      return new Response(body, { status: 200, headers });
    }
    return new Response(JSON.stringify({ offline: true, error: "Trade detail not available offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheTradeDetail(request, response) {
  const cache = await caches.open(TRADE_CACHE_NAME);
  const body = await response.text();
  const stamped = new Response(body, {
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "x-amana-cache-time": String(Date.now()),
    },
  });
  await cache.put(request, stamped);
  // Evict oldest entries beyond TRADE_CACHE_MAX
  const keys = await cache.keys();
  if (keys.length > TRADE_CACHE_MAX) {
    await Promise.all(keys.slice(0, keys.length - TRADE_CACHE_MAX).map((k) => cache.delete(k)));
  }
}
