/* TrackApt 서비스 워커 (v6.3) — 목적은 '홈 화면에 설치'가 되게 하는 것.
   자료는 항상 네트워크에서 먼저 받고(늘 최신), 네트워크가 안 될 때만 마지막 사본을 보여 준다.
   API 응답(/api/)은 저장하지 않는다. */
var CACHE = "trackapt-v3";   /* v9.43: 화면(HTML)은 항상 서버에서 새로 — 브라우저 캐시 사본을 쓰지 않는다 */
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.pathname.indexOf("/api/") === 0) return;                 /* 실거래 조회는 그대로 통과 */
  var net = req.mode === "navigate" ? fetch(req.url, { cache: "no-store", credentials: "same-origin" }) : fetch(req);
  e.respondWith(
    net.then(function (res) {
      if (res && res.ok && (url.origin === location.origin || /cdnjs|jsdelivr|clarity/.test(url.host))) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/index.html");
      });
    })
  );
});
