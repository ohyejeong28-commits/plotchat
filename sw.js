// 아이폰/웹에서 쓰는 서비스 워커.
// 인터넷이 되면 항상 서버의 최신 파일을 쓰고(업데이트가 다음 실행에 바로 반영), 안 되면 저장해 둔 파일로 연다.
// 브라우저가 파일을 잠깐 저장해 두는 것(사이트가 10분으로 정해 둠) 때문에 예전 파일이 쓰이지 않도록,
// 매번 서버에 "바뀌었는지" 확인한다 (안 바뀌었으면 서버가 짧게 대답해서 느려지지 않는다).
// AI 호출(Google)은 건드리지 않는다.
const CACHE = "plotchat-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // 화면 이동 요청(navigate)은 옵션을 붙여 다시 만들 수 없어서 주소로 새로 만든다
  const fresh = e.request.mode === "navigate"
    ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })
    : new Request(e.request, { cache: "no-cache" });
  e.respondWith(
    fetch(fresh)
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
