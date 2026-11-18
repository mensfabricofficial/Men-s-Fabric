// Lightweight Selvee Notification Service Worker
// Does NOT cache JS/HTML app bundles so live site updates & data always load cleanly.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Handle native Web Push payloads
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
      renotify: false,
      data: { url: payload.url || '/' },
    })
  );
});

// Allow client app to show a Service Worker OS notification (required on Android Chrome)
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
      renotify: false,
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
