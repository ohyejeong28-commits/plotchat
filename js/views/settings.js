import { loadSettings, saveSettings } from "../settings.js";
import { listModels } from "../llm.js";
import { modelLadder, AUTO } from "../ai.js";
import { receiveFromPC, isDesktop } from "../sync.js";
import { showToast } from "../ui.js";

const $ = (id) => document.getElementById(id);

export function initSettings() {
  const settings = loadSettings();
  $("apiKey").value = settings.apiKey;
  if (settings.models.length) fillModels(settings.models, settings.model);

  $("toggleKey").addEventListener("click", () => {
    const input = $("apiKey");
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    $("toggleKey").textContent = hidden ? "숨기기" : "보기";
  });

  $("checkBtn").addEventListener("click", async () => {
    const apiKey = $("apiKey").value.trim();
    if (!apiKey) return setStatus("API 키를 먼저 넣어 주세요.", "err");
    saveSettings({ apiKey });
    setStatus("확인 중…");
    $("checkBtn").disabled = true;
    try {
      const models = await listModels(apiKey);
      if (!models.length) throw new Error("쓸 수 있는 대화 모델이 없어요.");
      const saved = loadSettings().model;
      const pick = models.some((m) => m.id === saved) ? saved : AUTO; // 기본은 자동 (품질 순서 사다리)
      fillModels(models, pick);
      saveSettings({ model: pick, models });
      setStatus(`연결됐어요 · 대화 모델 ${models.length}개`, "ok");
      if (!isDesktop()) {
        receiveFromPC()
          .then((r) => r && showToast(`PC에서 플롯 ${r.added + r.updated}개를 받았어요.`))
          .catch((err) => showToast(err.message));
      }
    } catch (err) {
      setStatus(err.message, "err");
    } finally {
      $("checkBtn").disabled = false;
    }
  });

  $("model").addEventListener("change", (e) => saveSettings({ model: e.target.value }));

  // 대화 모드 (제타처럼 세이프 / 언리밋). 언리밋은 성인 확인을 한 번 받는다.
  paintChatMode();
  $("chatMode").addEventListener("click", (e) => {
    const mode = e.target.closest("[data-mode]")?.dataset.mode;
    if (!mode || mode === loadSettings().chatMode) return;
    if (mode === "unlimited" && !confirm("언리밋 모드는 만 19세 이상만 쓸 수 있어요.\n성인이 맞나요?")) return;
    saveSettings({ chatMode: mode });
    paintChatMode();
    showToast(mode === "unlimited" ? "언리밋 모드로 바꿨어요. 언리밋 플롯에 적용돼요." : "세이프 모드로 바꿨어요.");
  });
}

function paintChatMode() {
  const current = loadSettings().chatMode;
  $("chatMode").querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === current));
}

// 맨 위 "자동", 그 아래 무료로 쓸 수 있는 모델을 품질 순서로
function fillModels(models, selectedId) {
  const select = $("model");
  select.innerHTML = "";
  const add = (value, text) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  };
  add(AUTO, "자동 · 좋은 모델부터, 한도가 차면 다음 모델로");
  for (const id of modelLadder(models)) add(id, id.replace("models/", ""));
  select.value = selectedId;
  if (select.value !== selectedId) select.value = AUTO;
  select.disabled = false;
}

function setStatus(text, kind = "") {
  const el = $("checkStatus");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}
