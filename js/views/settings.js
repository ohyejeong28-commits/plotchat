import { loadSettings, saveSettings } from "../settings.js";
import { listModels } from "../llm.js";
import { receiveFromPC, isDesktop } from "../sync.js";
import { showToast } from "../ui.js";

const $ = (id) => document.getElementById(id);

export function initSettings() {
  const settings = loadSettings();
  $("apiKey").value = settings.apiKey;
  if (settings.models.length) fillModels(settings.models, settings.model);
  else if (settings.model) fillModels([{ id: settings.model, label: settings.model.replace("models/", "") }], settings.model);

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
      const pick = models.find((m) => m.id === saved)
        || models.find((m) => /flash/i.test(m.id) && !/lite/i.test(m.id))
        || models[0];
      fillModels(models, pick.id);
      saveSettings({ model: pick.id, models });
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
}

function fillModels(models, selectedId) {
  const select = $("model");
  select.innerHTML = "";
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label === m.id.replace("models/", "") ? m.label : `${m.label} (${m.id.replace("models/", "")})`;
    select.appendChild(opt);
  }
  select.value = selectedId;
  select.disabled = false;
}

function setStatus(text, kind = "") {
  const el = $("checkStatus");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}
