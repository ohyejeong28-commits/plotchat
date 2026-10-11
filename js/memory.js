// 장기 기억: 대화가 길어지면 앞부분을 요약해 두고, AI에게는 "요약 + 최근 대화"만 보낸다.
// 대화마다 기억 하나: { chatId, summary, upToId, userNote, updatedAt }
//   summary에는 upToId 메시지까지의 내용이 들어 있다. 되돌리기/재생성으로 줄기가 바뀌어
//   upToId가 지금 줄기에 없으면 그 요약은 쓰지 않는다 (나중에 다시 요약한다).
//   대화 기록(chats)과 따로 저장해서, 대화를 저장할 때 기억이 덮어써지지 않게 한다.
import { ask } from "./ai.js";
import { get, put } from "./db.js";
import { buildSummaryRequest } from "./prompt.js";

export const SUMMARIZE_AT = 40; // 요약 안 된 메시지가 이만큼 쌓이면 정리한다
export const RECENT_KEEP = 20; // 정리할 때도 최근 메시지는 이만큼 그대로 둔다
export const NOTE_MAX = 1000;

export async function getMemory(chatId) {
  return (await get("memories", chatId)) || { chatId, summary: "", upToId: null, userNote: "", updatedAt: 0 };
}

export const saveMemory = (memory) => put("memories", memory);

// 지금 줄기에서 AI에게 보낼 것: 쓸 수 있는 요약과, 그 뒤의 최근 메시지
export function memoryWindow(memory, path) {
  // 직접 적어 둔 요약(기준점 없음)은 대화 전체와 함께 그대로 쓴다
  if (!memory?.upToId) return { summary: memory?.summary || "", recent: path, summarizedCount: 0 };
  const idx = path.findIndex((m) => m.id === memory.upToId);
  if (idx < 0) return { summary: "", recent: path, summarizedCount: 0 };
  return { summary: memory.summary, recent: path.slice(idx + 1), summarizedCount: idx + 1 };
}

export function needsSummary(memory, path) {
  return memoryWindow(memory, path).recent.length >= SUMMARIZE_AT;
}

// 요약을 한 번 진행한다. force면 40개가 안 돼도 최근 20개를 뺀 나머지를 정리한다.
// 성공하면 새 기억을, 정리할 게 없으면 null을 돌려준다.
export async function summarize(chatId, path, plot, persona, { force = false } = {}) {
  const before = await getMemory(chatId);
  const { summary, recent } = memoryWindow(before, path);
  const cut = recent.length - RECENT_KEEP;
  if (cut <= 0 || (!force && recent.length < SUMMARIZE_AT)) return null;
  const chunk = recent.slice(0, cut);
  const request = buildSummaryRequest(plot, persona, summary, chunk);
  const text = (await ask({ system: request.system, messages: [{ role: "user", content: request.content }] })).text.trim();
  if (!text) throw new Error("요약을 만들지 못했어요. 잠시 후 다시 해 주세요.");
  const latest = await getMemory(chatId); // 요약하는 사이에 유저노트가 바뀌었을 수 있다
  const next = { ...latest, summary: text, upToId: chunk[chunk.length - 1].id, updatedAt: Date.now() };
  await saveMemory(next);
  return next;
}
