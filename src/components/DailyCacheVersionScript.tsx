import Script from "next/script";

/**
 * Синхронно при первом парсе HTML: сравнение даты с `gastrobar_app_version`,
 * при смене дня — очистка Cache Storage (не localStorage с избранным) и один reload.
 * Защита от петли: `gastrobar_version_bust_pending` в sessionStorage.
 */
const DAILY_CACHE_BUST = `(function(){
  var v = new Date().toISOString().slice(0, 10);
  var key = "gastrobar_app_version";
  var bustOnce = "gastrobar_version_bust_pending";
  try {
    var s = localStorage.getItem(key);
    if (s && s !== v) {
      if (sessionStorage.getItem(bustOnce) === "1") {
        sessionStorage.removeItem(bustOnce);
        try { localStorage.setItem(key, v); } catch (e) {}
        return;
      }
      try { localStorage.setItem(key, v); } catch (e) { return; }
      sessionStorage.setItem(bustOnce, "1");
      function reload() { location.reload(); }
      function afterCaches() {
        if ("caches" in window && window.caches && window.caches.keys) {
          return window.caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(k) { return window.caches.delete(k); }));
          }).then(reload, reload);
        }
        reload();
        return null;
      }
      if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          return Promise.all(regs.map(function(r) { return r.unregister(); }));
        }).then(afterCaches, afterCaches);
      } else {
        void afterCaches();
      }
      return;
    }
    if (!s) { try { localStorage.setItem(key, v); } catch (e) {} }
    if (s === v) sessionStorage.removeItem(bustOnce);
  } catch (e) {}
})();`;

export function DailyCacheVersionScript() {
  return (
    <Script
      id="gastrobar-daily-app-version"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: DAILY_CACHE_BUST }}
    />
  );
}
