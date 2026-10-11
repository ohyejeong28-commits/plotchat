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
import { initOverlays } from "./ui.js";

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

go(loadSettings().apiKey ? "home" : "my");

// 웹(아이폰)에서 열었을 때만: 오프라인 실행과 업데이트를 위한 서비스 워커 (PC 앱은 파일로 열려서 필요 없다)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
