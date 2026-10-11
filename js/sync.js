// PC → 폰 플롯 보내기.
// PC 앱은 플롯과 대화 프로필을 API 키로 암호화한 파일(sync/plots.json)을 앱 폴더에 써 두고, 앱과 같이 GitHub에 올린다.
// 저장소가 공개라서 암호화한다: 같은 API 키를 가진 기기만 풀 수 있다.
// 폰(웹)은 앱을 열 때 더 새로운 파일이 있으면 받아서 합친다. 대화는 건드리지 않는다.
import { getAll, put } from "./db.js";
import { loadSettings } from "./settings.js";

const FILE = "sync/plots.json";
const FORMAT = "plotchat-sync";
const APPLIED_KEY = "plotchat.syncApplied"; // 폰: 마지막으로 받은 파일의 시각
const SENT_KEY = "plotchat.syncSent"; // PC: 마지막으로 폰에 보낸 시각

export const isDesktop = () => !!window.desktop;
export const isWeb = () => location.protocol.startsWith("http");

// ---- 암호화 (API 키 → PBKDF2 → AES-GCM) ----

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(secret, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encrypt(obj, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  // 큰 데이터(이미지 포함)는 한 번에 btoa하면 터질 수 있어 나눠서 바꾼다
  let text = "";
  for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return { salt: b64(salt), iv: b64(iv), data: btoa(text) };
}

async function decrypt(file, secret) {
  const key = await deriveKey(secret, unb64(file.salt));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(file.iv) }, key, unb64(file.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---- PC ----

async function buildFile() {
  const { apiKey } = loadSettings();
  if (!apiKey) throw new Error("마이페이지에서 API 키를 먼저 넣어 주세요.");
  const data = { plots: await getAll("plots"), personas: await getAll("personas") };
  return JSON.stringify({ format: FORMAT, version: 1, updatedAt: Date.now(), ...(await encrypt(data, apiKey)) });
}

// 플롯이나 대화 프로필이 바뀌면 잠시 뒤 파일을 다시 써 둔다 (다음 업데이트 때 같이 올라간다)
let writeTimer = 0;
export function markDirty() {
  if (!isDesktop()) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await window.desktop.writeSync(await buildFile());
    } catch {}
  }, 1500);
}

// 지금 바로 폰으로 보낸다: 파일을 쓰고 GitHub에 올린다
export async function sendToPhone() {
  const result = await window.desktop.publishSync(await buildFile());
  if (!result.ok) throw new Error("보내지 못했어요. 인터넷 연결을 확인해 주세요. (" + result.message.split("\n")[0] + ")");
  try {
    localStorage.setItem(SENT_KEY, String(Date.now()));
  } catch {}
}

export const lastSent = () => Number(localStorage.getItem(SENT_KEY) || 0);

// ---- 폰 ----

// 더 새로운 파일이 있으면 받아서 합친다. 받은 게 없으면 null.
export async function receiveFromPC({ force = false } = {}) {
  if (!isWeb()) return null;
  const { apiKey } = loadSettings();
  if (!apiKey) return null;
  const res = await fetch(`${FILE}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const file = await res.json();
  if (file.format !== FORMAT) return null;
  if (!force && file.updatedAt <= lastReceived()) return null;
  let data;
  try {
    data = await decrypt(file, apiKey);
  } catch {
    throw new Error("PC와 같은 API 키를 넣어야 PC의 플롯을 받을 수 있어요.");
  }
  const existing = new Set((await getAll("plots")).map((p) => p.id));
  let added = 0;
  let updated = 0;
  for (const plot of data.plots || []) {
    await put("plots", plot);
    if (existing.has(plot.id)) updated++;
    else added++;
  }
  for (const persona of data.personas || []) await put("personas", persona);
  try {
    localStorage.setItem(APPLIED_KEY, String(file.updatedAt));
    localStorage.setItem("plotchat.seeded", "1");
  } catch {}
  return { added, updated, personas: (data.personas || []).length, updatedAt: file.updatedAt };
}

export const lastReceived = () => Number(localStorage.getItem(APPLIED_KEY) || 0);
