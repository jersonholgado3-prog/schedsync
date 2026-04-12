const CACHE_NAME = 'schedsync-v4'; // Incremented version

// Activate Event: Cleanup old caches 🧹
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SchedSync SW: Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Claim clients immediately
  self.clients.claim();
});

// Fetch Event: Network-First Strategy for development 🚀
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('firebasejs')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Update cache
        return caches.open(CACHE_NAME).then((cache) => {
          if (event.request.url.startsWith('http')) {
             cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});
