const APP_BASE = self.registration.scope;
const CACHE_PREFIX = `ponto-pmc-${encodeURIComponent(new URL(APP_BASE).pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = [
  '', 'index.html', 'style.css', 'tokens.css', 'faq.css',
  'script.js', 'faq.js', 'pwa.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png'
].map((path) => new URL(path, APP_BASE).href);

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
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.href.startsWith(APP_BASE)) return;
  const appPath = url.href.slice(APP_BASE.length);
  if (appPath.startsWith('api/') || appPath.startsWith('uploads/') || appPath.startsWith('vendor/')) return;

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
        const home = await caches.match(new URL('index.html', APP_BASE).href);
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
  const destination = new URL(data.url || APP_BASE, APP_BASE);
  if (!destination.href.startsWith(APP_BASE)) destination.href = APP_BASE;

  event.waitUntil(self.registration.showNotification(data.title || 'Ponto.PMC', {
    body: data.body || '',
    icon: new URL('icons/icon-192.png', APP_BASE).href,
    badge: new URL('icons/icon-192.png', APP_BASE).href,
    data: { url: destination.href }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || APP_BASE;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (client.url === target) return client.focus();
    }
    return self.clients.openWindow(target);
  }));
});
