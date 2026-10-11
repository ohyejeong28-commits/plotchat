// 마이페이지의 "데이터" 카드: 백업 파일 만들기 / 불러오기
import { exportData, exportPlots, importPlots, downloadJson, importData, dataStats } from "../backup.js";
import { sendToPhone, receiveFromPC, lastSent, lastReceived } from "../sync.js";

const $ = (id) => document.getElementById(id);

export function initBackup() {
  // 폰과 플롯 맞추기: PC는 보내기, 폰은 받기
  $("syncSend").addEventListener("click", async () => {
    $("syncSend").disabled = true;
    setStatus("보내는 중…", "", "syncStatus");
    try {
      await sendToPhone();
      setStatus("보냈어요. 1~2분 뒤 폰에서 앱을 열면 자동으로 받아져요.", "ok", "syncStatus");
      showSyncInfo();
    } catch (err) {
      setStatus(err.message, "err", "syncStatus");
    } finally {
      $("syncSend").disabled = false;
    }
  });
  $("syncReceive").addEventListener("click", async () => {
    $("syncReceive").disabled = true;
    setStatus("받는 중…", "", "syncStatus");
    try {
      const r = await receiveFromPC({ force: true });
      setStatus(r ? receivedText(r) : "PC에서 보낸 플롯이 아직 없어요. PC 앱에서 \"폰으로 보내기\"를 눌러 주세요.", r ? "ok" : "", "syncStatus");
      showSyncInfo();
      showStats();
    } catch (err) {
      setStatus(err.message, "err", "syncStatus");
    } finally {
      $("syncReceive").disabled = false;
    }
  });
  // 플롯 옮기기 (대화는 그대로)
  $("plotsExport").addEventListener("click", async () => {
    const data = await exportPlots();
    const name = downloadJson(data, "플롯");
    setStatus(`플롯 ${data.plots.length}개를 '${name}' 파일로 만들었어요.`, "ok", "plotsStatus");
  });
  $("plotsImport").addEventListener("click", () => $("plotsFile").click());
  $("plotsFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { added, updated } = await importPlots(JSON.parse(await file.text()));
      setStatus(`플롯 ${added}개를 추가하고 ${updated}개를 새 내용으로 바꿨어요. 대화는 그대로예요.`, "ok", "plotsStatus");
      showStats();
    } catch (err) {
      setStatus(err instanceof SyntaxError ? "파일을 읽지 못했어요. 플롯챗 파일이 맞는지 확인해 주세요." : err.message, "err", "plotsStatus");
    }
  });

  document.addEventListener("viewchange", (e) => {
    if (e.detail !== "my") return;
    showStats();
    showSyncInfo();
    setStatus("");
    setStatus("", "", "plotsStatus");
    setStatus("", "", "syncStatus");
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

export const receivedText = (r) =>
  `PC에서 플롯 ${r.added + r.updated}개${r.chats ? `와 대화 ${r.chats}개` : ""}를 받았어요${r.added ? ` (새 플롯 ${r.added}개)` : ""}.` +
  (r.chats ? " 폰에서 하던 대화는 그대로 두고 합쳤어요." : " 폰의 대화는 그대로예요.");

function showSyncInfo() {
  const when = (ts) => new Date(ts).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  $("syncSendInfo").textContent = lastSent() ? `마지막으로 보낸 시각: ${when(lastSent())}` : "";
  $("syncReceiveInfo").textContent = lastReceived() ? `마지막으로 받은 플롯: ${when(lastReceived())}에 PC에서 보낸 것` : "";
}

async function showStats() {
  const s = await dataStats();
  $("dataStats").textContent = `지금 저장된 데이터: 플롯 ${s.plots}개 · 대화 ${s.chats}개 · 메시지 ${s.messages}개 · 대화 프로필 ${s.personas}개`;
}

function setStatus(text, kind = "", id = "backupStatus") {
  const el = $(id);
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}
