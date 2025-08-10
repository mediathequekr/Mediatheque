self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('wigglypaint-cache-v2').then(cache=>cache.addAll([
    './','./index.html','./manifest.webmanifest'
  ])));
});
self.addEventListener('activate', (e)=>{ self.clients.claim(); });
self.addEventListener('fetch', (e)=>{
  e.respondWith(caches.match(e.request).then(res=> res || fetch(e.request)));
});
