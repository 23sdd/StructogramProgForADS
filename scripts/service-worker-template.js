/* Build replaces the version and asset list with a content-addressed snapshot. */
const PREFIX = 'structogram:' + self.registration.scope + ':';
const CACHE = PREFIX + '__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(ASSETS); }
    catch (error) { await caches.delete(CACHE); throw error; }
  })());
  // Let existing tabs finish using their version; never reload unsaved work.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const home = new URL('./', self.registration.scope).href;
    const key = event.request.mode === 'navigate' && (url.pathname === new URL(home).pathname || url.pathname === new URL('index.html', home).pathname)
      ? new URL('index.html', home).href : event.request;
    return (await cache.match(key)) || fetch(event.request);
  })());
});
