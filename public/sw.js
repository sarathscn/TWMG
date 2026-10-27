// Offline app shell for the TWMG Android app (registered only inside the app, never by the website).
// Pages: network first, falling back to the last copy, so the app opens without a connection.
// Build assets: cache first (their names change with every release). API calls and sign-in routes
// are never cached: finance data lives in the app's own device copy, not here.
const SHELL = 'twmg-shell-v1', ASSETS = 'twmg-assets-v1';
const NEVER = [/^\/api\//, /^\/auth\//, /^\/logout/];
self.addEventListener('install', event => { event.waitUntil(caches.open(SHELL).then(c => c.addAll(['/']).catch(() => undefined))); self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || NEVER.some(p => p.test(url.pathname))) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // A slow network falls back to the saved page after a few seconds instead of a blank screen.
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(url.pathname === '/login' ? '/login' : '/', copy)); }
        return res;
      } catch {
        return (await caches.match(url.pathname === '/login' ? '/login' : '/')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || /\.(?:svg|png|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(req, copy)); } return res; })));
  }
});
