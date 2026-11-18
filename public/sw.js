// Service worker: keeps the app installable, but NEVER serves an old copy.
// On activation it deletes every cache left by earlier versions, then reloads
// open tabs so they run the latest build. All requests go straight to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.length > 0;
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (hadOld) {
      const tabs = await self.clients.matchAll({ type: 'window' });
      tabs.forEach((t) => t.navigate(t.url).catch(() => {}));
    }
  })());
});
self.addEventListener('fetch', () => { /* network only */ });
