// sw.js — Service Worker untuk Photobooth Pro HD PWA
const CACHE_NAME = 'photobooth-v1';

// File-file inti yang di-cache saat install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './logo.svg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Mono:wght@400;500&family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// ── Install: pre-cache semua aset inti ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Gunakan addAll dengan error handling individual agar 1 URL gagal tidak gagalkan semua
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Gagal cache:', url, err))
        )
      );
    })
  );
  // Langsung aktif tanpa menunggu tab lama ditutup
  self.skipWaiting();
});

// ── Activate: hapus cache lama ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: strategi Cache-First untuk aset, Network-First untuk API ─────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Jangan cache request ke Cloudinary (upload foto) atau API eksternal lain
  if (
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.startsWith('/upload')
  ) {
    return; // Biarkan request jalan normal ke network
  }

  // Untuk Google Fonts CSS → Stale-While-Revalidate agar font selalu up-to-date
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached); // Jika offline, pakai yang di-cache
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Strategi default: Cache-First → cocok untuk aset statis (JS, gambar, dll.)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Hanya cache response yang valid (bukan error, bukan opaque dari CDN lain)
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback: kembalikan index.html untuk navigasi
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
