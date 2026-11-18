const CACHE_NAME = 'js-baking-house-shell-v2'
const SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/badge-96.png',
  '/manifest.webmanifest',
]

const isCacheable = (url) =>
  url.origin === self.location.origin &&
  (SHELL.includes(url.pathname) || url.pathname.startsWith('/assets/'))

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('js-baking-house-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

// Network-first keeps the demo current. Only static application files are
// cached, so future authenticated API responses cannot be written to CacheStorage.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request)
      if (response.ok && isCacheable(new URL(event.request.url))) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(event.request, response.clone())
      }
      return response
    } catch {
      const cached = await caches.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') return caches.match('/index.html')
      return Response.error()
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const requested = event.notification.data?.url || '/notifications'
  let target = new URL('/notifications', self.location.origin)
  try {
    const candidate = new URL(requested, self.location.origin)
    if (candidate.origin === self.location.origin) target = candidate
  } catch {
    // Keep the safe default above.
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((entry) => entry.url === target.href) || clients[0]
      if (client && 'focus' in client) {
        if (client.url !== target.href) await client.navigate(target.href)
        return client.focus()
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
