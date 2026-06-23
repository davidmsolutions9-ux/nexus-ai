const CACHE = 'nexus-v3'
const OFFLINE_URL = '/offline'

// Cache app shell on install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(['/', '/chat', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'])
    )
  )
  self.skipWaiting()
})

// Clean old caches on activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Push notification received
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Nexus', body: 'Tienes un recordatorio', icon: '/icons/icon-192.png' }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon  || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-192.png',
      tag:   data.tag   || 'nexus-reminder',
      renotify: true,
      requireInteraction: false,
    })
  )
})

// Notification click → open app
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const existing = cs.find((c) => c.url.includes('/chat'))
      if (existing) return existing.focus()
      return clients.openWindow('/chat')
    })
  )
})

// Network first, fall back to cache for navigation; cache first for assets
self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/chat') ?? caches.match('/'))
    )
    return
  }
  if (request.destination === 'image' || request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    e.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(request, clone))
        return res
      }))
    )
  }
})
