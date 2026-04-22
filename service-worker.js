const CACHE_NAME = 'schedsync-v5';

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

// Fetch Event: Network-First Strategy with error handling
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Ignore non-http/https requests
  if (!event.request.url.startsWith('http')) return;
  // Ignore Firestore/Firebase scripts
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('firebasejs')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Only cache if valid and successful (200)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});
