// Service worker: guarda la app en el celular para que funcione sin conexión.
// Cambiá VERSION cada vez que publiques cambios (el workflow lo hace solo).
const VERSION = "dev";
const CACHE = "pseint-movil-" + VERSION;
const ARCHIVOS = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/editor.js",
  "js/console.js",
  "js/storage.js",
  "js/profiles.js",
  "js/worker.js",
  "js/pseint-runtime.js",
  "pseint.wasm",
  "perfiles.json",
  "ejemplos.json",
  "fonts/Inconsolata-Regular.ttf",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pseint-movil-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero lo guardado (rápido y sin conexión); si no está, de la red
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)),
  );
});
