// 백업/복원: 이 기기의 모든 데이터(플롯, 대화, 메시지, 대화 프로필, 기억)를 JSON 파일 하나로 내보내고 다시 불러온다.
// 아이폰으로 옮길 때도 이 파일을 쓴다.
import { getAll, replaceStores } from "./db.js";
import { loadSettings, saveSettings } from "./settings.js";

const STORES = ["plots", "chats", "messages", "personas", "memories"];
const FORMAT = "plotchat-backup";

export async function exportData({ includeKey = false } = {}) {
  const stores = {};
  for (const name of STORES) stores[name] = await getAll(name);
  const settings = { ...loadSettings() };
  if (!includeKey) delete settings.apiKey;
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), settings, stores };
}

export function downloadJson(data) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const name = `플롯챗-백업-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

// 지금 데이터를 모두 지우고 백업 내용으로 바꾼다. API 키가 백업에 없으면 지금 키를 그대로 둔다.
export async function importData(data) {
  if (data?.format !== FORMAT || typeof data.stores !== "object") throw new Error("플롯챗 백업 파일이 아니에요.");
  await replaceStores(Object.fromEntries(STORES.map((name) => [name, Array.isArray(data.stores[name]) ? data.stores[name] : []])));
  const current = loadSettings();
  saveSettings({ ...current, ...data.settings, apiKey: data.settings?.apiKey || current.apiKey });
  try {
    localStorage.setItem("plotchat.seeded", "1"); // 예시 플롯을 다시 넣지 않는다
  } catch {}
}

export async function dataStats() {
  const count = async (name) => (await getAll(name)).length;
  return { plots: await count("plots"), chats: await count("chats"), messages: await count("messages"), personas: await count("personas") };
}
