// /service-worker.js

const SW_VERSION = "v1.0.4";
const CACHE_NAME = `app-shell-${SW_VERSION}`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",

  "/css/home.css",
  "/css/micro.css",

  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // 失敗してもSWが死なないように個別にprecache
    for (const path of APP_SHELL) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
        await cache.put(path, res);
      } catch (e) {
        console.warn("[SW] precache skip:", path, e);
      }
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 古いキャッシュ削除
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("app-shell-") && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 自サイトのみ
  if (url.origin !== self.location.origin) return;

  // ES Modulesの不整合を避けるため JS はSWで触らない
  if (url.pathname.endsWith(".js")) return;

  // ✅ ページ遷移（HTML）は Network First
  // これをしないと「どのリンクも index.html が返る」事故が起きやすい
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // まずネットで本物のHTMLを取得（kensaku.html / mypage.html が開ける）
        const netRes = await fetch(req);

        // 成功したらHTMLも一応キャッシュしておく（任意）
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, netRes.clone());

        return netRes;
      } catch (e) {
        // ネットが死んでる時はキャッシュへ
        const cached = await caches.match(req);
        return cached || caches.match("/index.html");
      }
    })());
    return;
  }

  // それ以外（CSS/画像など）は Cache First
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    const res = await fetch(req);

    // 同一オリジンのGETだけキャッシュ
    if (req.method === "GET" && res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
