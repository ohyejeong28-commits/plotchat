// 마이페이지의 "데이터" 카드: 백업 파일 만들기 / 불러오기
import { exportData, downloadJson, importData, dataStats } from "../backup.js";

const $ = (id) => document.getElementById(id);

export function initBackup() {
  document.addEventListener("viewchange", (e) => {
    if (e.detail === "my") showStats();
  });
  $("backupExport").addEventListener("click", async () => {
    const name = downloadJson(await exportData({ includeKey: $("backupKey").checked }));
    setStatus(`'${name}' 파일을 만들었어요.`, "ok");
  });
  $("backupImport").addEventListener("click", () => $("backupFile").click());
  $("backupFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = data?.stores;
      if (!n) throw new Error("플롯챗 백업 파일이 아니에요.");
      const summary = `플롯 ${n.plots?.length || 0}개, 대화 ${n.chats?.length || 0}개, 메시지 ${n.messages?.length || 0}개`;
      if (!confirm(`백업(${summary})으로 바꿀까요?\n지금 이 기기에 있는 데이터는 모두 지워져요.`)) return;
      await importData(data);
      alert("불러왔어요. 앱을 다시 시작할게요.");
      location.reload();
    } catch (err) {
      setStatus(err instanceof SyntaxError ? "파일을 읽지 못했어요. 플롯챗 백업 파일이 맞는지 확인해 주세요." : err.message, "err");
    }
  });
}

async function showStats() {
  const s = await dataStats();
  $("dataStats").textContent = `지금 저장된 데이터: 플롯 ${s.plots}개 · 대화 ${s.chats}개 · 메시지 ${s.messages}개 · 대화 프로필 ${s.personas}개`;
  setStatus("");
}

function setStatus(text, kind = "") {
  const el = $("backupStatus");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}
