// 대화 프로필: 대화에서 사용자가 연기하는 캐릭터 (이름 + 설명)
import { put, get, getAll, del } from "./db.js";
import { loadSettings, saveSettings } from "./settings.js";
import { markDirty } from "./sync.js";

export async function listPersonas() {
  return (await getAll("personas")).sort((a, b) => a.createdAt - b.createdAt);
}

export const getPersona = (id) => (id ? get("personas", id) : Promise.resolve(null));

export async function savePersona(persona) {
  const now = Date.now();
  if (!persona.id) {
    persona.id = crypto.randomUUID();
    persona.createdAt = now;
  }
  persona.updatedAt = now;
  await put("personas", persona);
  markDirty();
  // 첫 프로필은 자동으로 기본 프로필이 된다
  if (!loadSettings().defaultPersonaId) saveSettings({ defaultPersonaId: persona.id });
  return persona;
}

export async function deletePersona(id) {
  await del("personas", id);
  markDirty();
  if (loadSettings().defaultPersonaId === id) saveSettings({ defaultPersonaId: "" });
}

// 대화에 쓸 프로필: 대화에 정해 둔 게 없으면(예전 대화) 기본 프로필
export async function personaForChat(chat) {
  const id = chat.personaId === undefined ? loadSettings().defaultPersonaId : chat.personaId;
  return (await getPersona(id)) || null;
}
