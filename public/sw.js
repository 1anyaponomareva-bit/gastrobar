/* GASTROBAR: оставляем файл для старых установок, но fetch не перехватываем.
   Регистрация с сайта снята; без обработчика fetch запросы идут в сеть по умолчанию. */
self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      if (self.caches && self.caches.keys) {
        const keys = await self.caches.keys();
        await Promise.all(
          keys.map(function (k) {
            return self.caches.delete(k);
          })
        );
      }
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
    })()
  );
});

// Намеренно НЕТ fetch: перехват ломал навигацию/чанки Next в Safari при сбоях сети.
