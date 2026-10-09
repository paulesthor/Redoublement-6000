/* Service worker : l'appli démarre instantanément depuis le cache, puis se met à jour en arrière-plan. */
const V = 'cw-v4';
const SHELL = ['/', 'style.css', 'fonts.css', 'app.js', 'reveal.js', 'pack.js', 'qrcode.js', 'fonts/inter-latin.woff2', 'fonts/sora-latin.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/ws') return;   // l'API et le temps réel passent toujours par le réseau
  e.respondWith(caches.open(V).then(async cache => {
    const hit = await cache.match(r, { ignoreSearch: false });
    const net = fetch(r.url, { cache: 'no-cache' }).then(res => { if (res.ok && (u.pathname === '/' || /\.(js|css|woff2|png|ico|svg|webmanifest)$/.test(u.pathname))) cache.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;   // cache d'abord, mise à jour en arrière-plan (stale-while-revalidate)
  }));
});

/* Notifications push : le serveur réveille l'appareil sans contenu ; on lit alors le texte en attente puis on l'affiche (marche écran verrouillé). */
self.addEventListener('push', e => e.waitUntil((async () => {
  let list = [];
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const r = await fetch('/api/push/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub?.endpoint }) });
    list = (await r.json()).msgs || [];
  } catch { /* réseau absent : message générique ci-dessous */ }
  if (!list.length) list = [{ title: 'Clodo Wiki', body: 'Du nouveau dans le jeu !', tag: 'generic' }];
  for (const m of list) await self.registration.showNotification(m.title, { body: m.body, tag: m.tag || undefined, icon: 'icon-192.png', badge: 'favicon-48.png', data: { url: '/' } });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow(e.notification.data?.url || '/');
  }));
});

/* Mise à jour demandée par l'appli : on retélécharge tout le socle en contournant tous les caches, puis on prévient la page. */
self.addEventListener('message', e => {
  if (e.data?.t !== 'refresh') return;
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(SHELL.map(async u => { try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) await c.put(u, r); } catch { /* hors ligne : on garde l'ancien */ } }));
    e.source?.postMessage({ t: 'refreshed' });
  })());
});
