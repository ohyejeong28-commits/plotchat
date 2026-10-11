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
import { initViewport } from "./viewport.js";
import { isDesktop, markDirty, receiveFromPC } from "./sync.js";
import { receivedText } from "./views/backup.js";

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
