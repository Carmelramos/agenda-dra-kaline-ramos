const CACHE_NAME = "kaline-agenda-v1";
const urlsToCache = [
  "./",
  "./index.html",
  "./styles.css",
  "./appointments.js",
  "./patients.js",
  "./supabaseConfig.js",
  "./android-chrome-512x512.png",
  "./favicon.ico"
];

// Instala o service worker e faz cache dos arquivos
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Busca primeiro no cache, depois na rede
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// Atualiza o cache quando houver nova versão
self.addEventListener("activate", event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(names.map(name => !cacheWhitelist.includes(name) && caches.delete(name)))
    )
  );
});
