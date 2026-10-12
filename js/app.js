import { loadSettings } from "./settings.js";
import { go } from "./router.js";
import { initSettings } from "./views/settings.js";
import { initPersonas } from "./views/personas.js";
import { initHome } from "./views/home.js";
import { initCreate } from "./views/create.js";
import { initRecent } from "./views/recent.js";
import { initPlot } from "./views/plot.js";
import { initEdit } from "./views/edit.js";
import { initChat } from "./views/chat.js";
import { initSaves } from "./views/saves.js";
import { initMemory } from "./views/memory.js";
import { initBackup } from "./views/backup.js";
import { initOverlays, showToast } from "./ui.js";
import { initViewport, viewportInfo } from "./viewport.js";
import { isDesktop, markDirty, receiveFromPC } from "./sync.js";
import { receivedText } from "./views/backup.js";
import { VERSION } from "./version.js";

// 아래 탭 바, 그리고 data-go="화면이름"이 붙은 버튼들
document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

initSettings();
initPersonas();
initHome();
initCreate();
initRecent();
initPlot();
initEdit();
initChat();
initSaves();
initMemory();
initBackup();
initOverlays();
initViewport();

go(loadSettings().apiKey ? "home" : "my");

// PC 앱: 폰으로 보낼 파일을 최신으로 써 둔다 / 폰: PC에서 보낸 새 플롯이 있으면 받아서 합친다
document.body.classList.toggle("is-desktop", isDesktop());
// 앱 버전 + 화면 높이 확인용 숫자 (화면 · 창 · 보이는 영역 · 앱). 마이페이지를 열 때마다 새로 잰다
const showVersion = () => (document.getElementById("appVersion").textContent = `앱 버전 ${VERSION} · ${viewportInfo()}`);
showVersion();
document.querySelector('.nav-item[data-view="my"]')?.addEventListener("click", () => setTimeout(showVersion, 300));
if (isDesktop()) markDirty();
else receiveNewPlots();

async function receiveNewPlots() {
  try {
    const r = await receiveFromPC();
    if (!r) return;
    showToast(receivedText(r));
    if (document.getElementById("view-home").classList.contains("active")) go("home"); // 홈 목록을 새로
  } catch (err) {
    showToast(err.message);
  }
}

// 웹(아이폰)에서 열었을 때만: 오프라인 실행과 업데이트를 위한 서비스 워커 (PC 앱은 파일로 열려서 필요 없다)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// 새 버전이 올라왔으면 한 번 새로 고친다: 홈 화면 앱은 완전히 꺼지지 않으면 예전 화면을 계속 붙잡고 있다.
// 켤 때와 앱으로 돌아올 때 서버의 버전 번호를 확인한다. AI 답변을 받는 중이면 건드리지 않고,
// 같은 버전으로는 한 번만 새로 고친다 (혹시 예전 파일이 또 와도 계속 새로 고치지 않게).
async function checkUpdate() {
  if (!location.protocol.startsWith("http") || document.getElementById("chatSend")?.classList.contains("stop")) return;
  try {
    const res = await fetch(`js/version.js?t=${Date.now()}`, { cache: "no-store" });
    const latest = (await res.text()).match(/VERSION = "([^"]+)"/)?.[1];
    if (!latest || latest === VERSION || sessionStorage.getItem("plotchat.reloadedFor") === latest) return;
    sessionStorage.setItem("plotchat.reloadedFor", latest);
    location.reload();
  } catch {
    // 인터넷이 안 되면 다음에 다시 확인한다
  }
}
checkUpdate();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkUpdate();
});
