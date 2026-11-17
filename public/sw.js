const CACHE_NAME = 'selvee-app-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin APIs (Firestore, Google Auth, analytics, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first for HTML navigations so fresh deployments always load
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/') || caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate for local static assets
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|css|js|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

// Handle native Web Push payloads if pushed externally
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Selvee Update',
    body: 'You have an important update from Selvee.',
    url: '/',
    tag: 'selvee-push-' + Date.now(),
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      vibrate: [200, 100, 200],
      renotify: true,
      data: { url: payload.url || '/' },
    })
  );
});

// Allow client app to request a Service Worker OS notification
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  const p = event.data.payload || {};
  event.waitUntil(
    self.registration.showNotification(p.title || 'Selvee', {
      body: p.body || '',
      icon: p.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: p.tag || 'selvee-alert-' + Date.now(),
      vibrate: [200, 100, 200],
      renotify: true,
      requireInteraction: Boolean(p.important),
      data: { url: p.url || '/' },
    })
  );
});

// Handle clicking on a mobile/desktop OS notification -> focus or open route
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
