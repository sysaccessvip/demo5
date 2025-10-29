// sw.js — leve, seguro. Nota: NO PUEDE BLOQUEAR anuncios dentro de un iframe de youtube.com.
// Sirve para caching offline de tu app y para permitir diagnósticos (registro de fetchs same-origin).

const CACHE_VERSION = 'v1';
const CACHE_NAME = `myapp-shell-${CACHE_VERSION}`;
const FALLBACK_HTML = '/index.html';

self.addEventListener('install', (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([FALLBACK_HTML]).catch(()=>{}))
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  // SOLO intercepta requests same-origin a tu sitio; no puede leer ni bloquear requests cross-origin del iframe de YouTube.
  const req = evt.request;
  // Logging para diagnóstico (solo en desarrollo; puedes quitarlo)
  try {
    const u = new URL(req.url);
    if (u.hostname && u.hostname.indexOf(location.hostname) !== -1) {
      // registro ligero para debug
      // console.log('SW fetch same-origin:', req.url);
    }
  } catch (e){}

  if (req.mode === 'navigate') {
    evt.respondWith(
      fetch(req).catch(() => caches.match(FALLBACK_HTML))
    );
    return;
  }

  evt.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      try {
        if (req.method === 'GET' && res && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
      } catch(e){}
      return res;
    })).catch(() => {})
  );
});

/* Mensajes para debug */
self.addEventListener('message', async (ev) => {
  const data = ev.data || {};
  const port = ev.ports && ev.ports[0];
  try {
    if (data && data.type === 'PING') {
      port && port.postMessage({ok:true, via:'sw'});
    } else {
      port && port.postMessage({ok:false, msg:'unknown'});
    }
  } catch (err) {
    port && port.postMessage({ok:false, msg: String(err)});
  }
});
