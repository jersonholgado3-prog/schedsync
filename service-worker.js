const CACHE_NAME = 'schedsync-v9';

const STATIC_EXTS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff2', '.woff'];

function isStatic(url) {
  return STATIC_EXTS.some(ext => url.includes(ext));
}

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (!url.startsWith('http')) return;
  if (url.includes('firestore.googleapis.com') || url.includes('firebasejs') || url.includes('googleapis.com')) return;

  if (isStatic(url)) {
    // Cache-first: serve from cache instantly, update in background
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(res => {
            if (res && res.status === 200 && res.type === 'basic') cache.put(e.request, res.clone());
            return res;
          });
          return cached || fetchPromise;
        })
      )
    );
  } else {
    // Network-first for HTML pages
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
