/* Build replaces the version and asset list with a content-addressed snapshot. */
const PREFIX = 'structogram:' + self.registration.scope + ':';
const VERSION = '__VERSION__';
const CACHE = PREFIX + VERSION;
const ASSETS = __ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.filter(client => client.url.startsWith(self.registration.scope)).map(async client => {
      // Current pages save through the editor before reloading. Legacy pages lack
      // this handshake; a normal navigation triggers their existing pagehide save.
      const channel = new MessageChannel();
      const reply = new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 1500);
        channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data); };
      });
      client.postMessage({ type: 'STRUCTOGRAM_UPDATE', version: VERSION }, [channel.port2]);
      const answer = await reply;
      channel.port1.close();
      if (answer === null) void client.navigate(client.url).catch(() => {});
    }));
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    // Reopening the ordinary URL always checks the published site first.
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) return response;
    } catch { /* The complete installed snapshot remains available offline. */ }
    const cache = await caches.open(CACHE);
    const home = new URL('./', self.registration.scope).href;
    const key = event.request.mode === 'navigate' && (url.pathname === new URL(home).pathname || url.pathname === new URL('index.html', home).pathname)
      ? new URL('index.html', home).href : event.request;
    return (await cache.match(key, { ignoreSearch: true })) || Response.error();
  })());
});
