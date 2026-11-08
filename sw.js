// Pam's Gallery: a tiny helper so a lost connection shows a friendly page instead of the browser's error.
// It only steps in when a page can't be fetched at all; everything else comes fresh from the site.
const V = 'pg-offline-1';
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(['/offline.html', '/icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
});
