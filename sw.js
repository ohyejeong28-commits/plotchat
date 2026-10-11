// 아이폰/웹에서 쓰는 서비스 워커.
// 인터넷이 되면 항상 서버의 최신 파일을 쓰고(업데이트가 다음 실행에 바로 반영), 안 되면 저장해 둔 파일로 연다.
// AI 호출(Google)은 건드리지 않는다.
const CACHE = "plotchat-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./")))
  );
});
