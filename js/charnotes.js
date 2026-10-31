// 캐릭터 노트: 플롯의 기존 대화를 분석해 인물별 성격·말투·감정 반응을 정리해 두고, 그 플롯의 모든 대화에서 지키게 한다.
// 제타처럼 "대화를 많이 할수록 캐릭터가 또렷해지는" 효과를 모델 학습 없이 흉내 낸다.
import { listChats, loadTree, pathOf } from "./chats.js";
import { getPlot, savePlot } from "./plots.js";
import { personaForChat } from "./personas.js";
import { buildCharNotesRequest } from "./prompt.js";
import { ask } from "./ai.js";
import { unlimitedFor } from "./settings.js";

export const NOTES_MIN_MESSAGES = 12; // 이보다 짧은 대화로는 분석하지 않는다
const NOTES_REFRESH_EVERY = 120; // 분석 뒤 메시지가 이만큼 더 쌓이면 다시 분석한다
const building = new Set();

// 플롯에서 가장 긴 대화 줄기 { chat, path }
async function longestPath(plotId) {
  let best = null;
  for (const chat of await listChats(plotId)) {
    const path = pathOf(await loadTree(chat), chat.headId);
    if (!best || path.length > best.path.length) best = { chat, path };
  }
  return best;
}

// 지금 분석할 때인가: 노트가 없거나, 분석 뒤 대화가 많이 늘었을 때
export function needsCharNotes(plot, msgCount) {
  if (msgCount < NOTES_MIN_MESSAGES) return false;
  const n = plot.charNotes;
  return !n?.text || msgCount - (n.msgCount || 0) >= NOTES_REFRESH_EVERY;
}

// 분석해서 플롯에 저장한다. 성공하면 새 노트, 분석할 게 없으면 null
export async function buildCharNotes(plotId, { force = false } = {}) {
  if (building.has(plotId)) return null;
  building.add(plotId);
  try {
    const plot = await getPlot(plotId);
    const best = await longestPath(plotId);
    if (!plot || !best) return null;
    if (!force && !needsCharNotes(plot, best.path.length)) return null;
    if (best.path.length < NOTES_MIN_MESSAGES) throw new Error(`대화가 ${NOTES_MIN_MESSAGES}개는 쌓여야 분석할 수 있어요.`);
    const persona = await personaForChat(best.chat);
    const req = buildCharNotesRequest(plot, persona, best.path);
    const result = await ask({ system: req.system, messages: [{ role: "user", content: req.content }], unlimited: unlimitedFor(plot) });
    const text = result.text.trim();
    if (result.blocked || !text) throw new Error("캐릭터 노트를 만들지 못했어요. 잠시 후 다시 해 주세요.");
    const fresh = await getPlot(plotId); // 분석하는 사이 플롯이 바뀌었을 수 있다
    fresh.charNotes = { text, builtAt: Date.now(), msgCount: best.path.length, chatId: best.chat.id, model: result.model };
    await savePlot(fresh);
    return fresh.charNotes;
  } finally {
    building.delete(plotId);
  }
}
