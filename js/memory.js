// 장기 기억: 대화가 길어지면 앞부분을 요약해 두고, AI에게는 "요약 + 최근 대화"만 보낸다.
// 대화마다 기억 하나: { chatId, summary, upToId, userNote, traits, updatedAt }
//   traits: 대화에서 알게 된 인물별 특징 (기억 정리 때 쌓인다)
//   summary에는 upToId 메시지까지의 내용이 들어 있다. 되돌리기/재생성으로 줄기가 바뀌어
//   upToId가 지금 줄기에 없으면 그 요약은 쓰지 않는다 (나중에 다시 요약한다).
//   대화 기록(chats)과 따로 저장해서, 대화를 저장할 때 기억이 덮어써지지 않게 한다.
import { ask } from "./ai.js";
import { get, put } from "./db.js";
import { buildSummaryRequest, buildCompressRequest, buildTraitsCompressRequest } from "./prompt.js";
import { unlimitedFor } from "./settings.js";

export const SUMMARIZE_AT = 40; // 요약 안 된 메시지가 이만큼 쌓이면 정리한다
export const RECENT_KEEP = 20; // 정리할 때도 최근 메시지는 이만큼 그대로 둔다
export const NOTE_MAX = 1000;
const CHUNK_MAX = 60; // 한 번에 요약하는 메시지 수 (가져온 긴 대화는 여러 번에 나눠 따라잡는다. 많이 넣으면 앞부분을 놓친다)
const EVENTS_MAX = 3500; // 사건 목록이 이보다 길어지면 오래된 사건을 압축한다
const STATE_HEAD = "[인물 상태]";
const TRAITS_HEAD = "[알게 된 특징]";
const TRAITS_MAX = 1800; // 특징 노트가 이보다 길어지면 인물별로 합쳐 정리한다

// 요약을 사건 목록과 [인물 상태]로 나눈다
function splitState(text = "") {
  const i = text.indexOf(STATE_HEAD);
  return i < 0 ? [text.trim(), ""] : [text.slice(0, i).trim(), text.slice(i + STATE_HEAD.length).trim()];
}

// 새 요약에서 [알게 된 특징] 부분을 떼어 낸다 → [나머지, 특징]
function splitTraits(text = "") {
  const i = text.indexOf(TRAITS_HEAD);
  if (i < 0) return [text, ""];
  const j = text.indexOf(STATE_HEAD, i);
  const traits = text.slice(i + TRAITS_HEAD.length, j < 0 ? undefined : j).trim();
  return [text.slice(0, i) + (j < 0 ? "" : text.slice(j)), traits];
}

// 특징 노트 합치기: 새 줄을 뒤에 붙이고 똑같은 줄은 뺀다
function mergeTraits(old = "", fresh = "") {
  const lines = [...old.split("\n"), ...fresh.split("\n")].map((l) => l.trim()).filter((l) => l && l !== "-" && !/^[-\s]*\(?없음\)?$/.test(l));
  return [...new Set(lines)].join("\n");
}

export async function getMemory(chatId) {
  return (await get("memories", chatId)) || { chatId, summary: "", upToId: null, userNote: "", traits: "", updatedAt: 0 };
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
  const chunk = recent.slice(0, Math.min(cut, CHUNK_MAX));
  const request = buildSummaryRequest(plot, persona, summary, chunk, before.traits);
  const result = await ask({ system: request.system, messages: [{ role: "user", content: request.content }], unlimited: unlimitedFor(plot) });
  if (result.blocked) throw new Error("요약이 구글 필터에 걸려 끊겨서 저장하지 않았어요."); // 끊긴 요약으로 덮어쓰지 않는다
  const [fresh, freshTraits] = splitTraits(result.text.trim());
  if (!fresh.trim()) throw new Error("요약을 만들지 못했어요. 잠시 후 다시 해 주세요.");
  // 기존 사건 목록 뒤에 새 사건을 덧붙이고, 인물 상태는 최신 것으로 바꾼다
  const [oldEvents, oldState] = splitState(summary);
  const [newEvents, newState] = splitState(fresh);
  let events = [oldEvents, newEvents].filter(Boolean).join("\n");
  if (events.length > EVENTS_MAX) {
    const req = buildCompressRequest(events);
    const squeezed = await ask({ system: req.system, messages: [{ role: "user", content: req.content }], unlimited: unlimitedFor(plot) });
    if (!squeezed.blocked && squeezed.text.trim()) events = squeezed.text.trim();
  }
  const state = newState || oldState; // 새 요약에 인물 상태가 없으면 이전 것을 남긴다
  const text = state ? `${events}\n\n${STATE_HEAD}\n${state}` : events;
  const latest = await getMemory(chatId); // 요약하는 사이에 유저노트·특징 노트가 바뀌었을 수 있다
  // 알게 된 특징은 쌓는다. 너무 길어지면 인물별로 합쳐 정리한다
  let traits = mergeTraits(latest.traits, freshTraits);
  if (traits.length > TRAITS_MAX) {
    const req = buildTraitsCompressRequest(traits);
    const squeezed = await ask({ system: req.system, messages: [{ role: "user", content: req.content }], unlimited: unlimitedFor(plot) });
    if (!squeezed.blocked && squeezed.text.trim()) traits = squeezed.text.trim();
  }
  const next = { ...latest, summary: text, traits, upToId: chunk[chunk.length - 1].id, updatedAt: Date.now() };
  await saveMemory(next);
  return next;
}
