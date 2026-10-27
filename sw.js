const CACHE_NAME = 'ponto-pmc-v1';
const APP_SHELL = [
  '/', '/index.html', '/style.css', '/tokens.css', '/faq.css',
  '/script.js', '/faq.js', '/pwa.js', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/vendor/')) return;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = await caches.match('/index.html');
        if (home) return home;
      }
      return Response.error();
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch { data = { body: event.data.text() }; }
  }
  if (!data || typeof data !== 'object') data = {};
  const destination = new URL(data.url || '/', self.location.origin);
  if (destination.origin !== self.location.origin) destination.href = self.location.origin + '/';

  event.waitUntil(self.registration.showNotification(data.title || 'Ponto.PMC', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: destination.href }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.location.origin + '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (client.url === target) return client.focus();
    }
    return self.clients.openWindow(target);
  }));
});
