/* SKYQ service worker — offline-first cache. */
'use strict';
const CACHE = 'skyq-v1790533029494';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/data.js', './js/countries.js', './js/engine.js', './js/ads.js', './js/bureau.js', './js/routemap.js', './js/app.js',
  './assets/world-map.json',
  './assets/fonts/BarlowCondensed-500.woff2', './assets/fonts/BarlowCondensed-600.woff2', './assets/fonts/BarlowCondensed-700.woff2',
  './assets/fonts/Barlow-400.woff2', './assets/fonts/Barlow-500.woff2', './assets/fonts/Barlow-600.woff2', './assets/fonts/Barlow-700.woff2',
  './assets/fonts/IBMPlexMono-400.woff2', './assets/fonts/IBMPlexMono-500.woff2', './assets/fonts/IBMPlexMono-600.woff2',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/icon-32.png',
  './assets/icons/apple-touch-icon.png', './assets/icons/og-cover.png',
];
self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET' || !ev.request.url.startsWith(self.location.origin)) return;
  ev.respondWith(
    caches.match(ev.request).then(hit => hit || fetch(ev.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(ev.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
