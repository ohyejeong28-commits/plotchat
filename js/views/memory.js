// 기억 화면: 유저노트(항상 기억할 메모)와 장기 기억 요약을 보고 고친다
import { getPlot } from "../plots.js";
import { getChat, loadTree, pathOf } from "../chats.js";
import { personaForChat } from "../personas.js";
import { getMemory, saveMemory, memoryWindow, summarize, SUMMARIZE_AT, RECENT_KEEP, NOTE_MAX } from "../memory.js";
import { loadSettings } from "../settings.js";
import { register, back, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
let ctx = null; // { plot, chat, path, persona, memory }

export function initMemory() {
  register("memory", openMemory);
  $("memoryBack").addEventListener("click", () => back("chats"));
  $("userNote").addEventListener("input", updateNoteCount);
  $("memorySave").addEventListener("click", async () => {
    const latest = await getMemory(ctx.chat.id);
    const summary = $("memorySummary").value.trim();
    // 요약을 모두 지우면 처음부터 다시 정리하도록 기준점도 지운다
    await saveMemory({ ...latest, userNote: $("userNote").value.trim(), summary, upToId: summary ? latest.upToId : null });
    back("chats");
  });
  $("memoryRefresh").addEventListener("click", async () => {
    const { apiKey, model } = loadSettings();
    if (!apiKey || !model) return setInfo("마이페이지에서 AI 연결을 먼저 해 주세요.", true);
    // 화면에서 고친 내용(유저노트, 요약)을 먼저 저장한 뒤 그걸 바탕으로 정리한다
    const latest = await getMemory(ctx.chat.id);
    await saveMemory({ ...latest, userNote: $("userNote").value.trim(), summary: $("memorySummary").value.trim() });
    $("memoryRefresh").disabled = true;
    setInfo("정리하는 중…");
    try {
      const next = await summarize(ctx.chat.id, ctx.path, ctx.plot, ctx.persona, { force: true });
      if (next) ctx.memory = next;
      render(next ? "정리했어요." : `정리할 만큼 대화가 쌓이지 않았어요. (최근 ${RECENT_KEEP}개는 그대로 기억해요)`);
    } catch (err) {
      setInfo(err.message, true);
    } finally {
      $("memoryRefresh").disabled = false;
    }
  });
}

async function openMemory(plotId, chatId) {
  const plot = await getPlot(plotId);
  const chat = await getChat(chatId);
  if (!plot || !chat) return back("chats");
  const path = pathOf(await loadTree(chat), chat.headId);
  ctx = { plot, chat, path, persona: await personaForChat(chat), memory: await getMemory(chatId) };
  $("userNote").value = ctx.memory.userNote || "";
  render();
  showView("memory");
}

function render(message) {
  const { summary, summarizedCount, recent } = memoryWindow(ctx.memory, ctx.path);
  $("memorySummary").value = summary;
  updateNoteCount();
  if (message) return setInfo(message);
  if (summarizedCount) {
    const when = new Date(ctx.memory.updatedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    setInfo(`앞 메시지 ${summarizedCount}개를 요약해 기억하고 있어요 · ${when}`);
  } else {
    setInfo(`아직 요약한 내용이 없어요. 메시지가 ${SUMMARIZE_AT}개 쌓이면 자동으로 정리해요. (지금 ${recent.length}개)`);
  }
}

function updateNoteCount() {
  $("userNoteCount").textContent = `${$("userNote").value.length}/${NOTE_MAX}`;
}

function setInfo(text, isError = false) {
  $("memoryInfo").textContent = text;
  $("memoryInfo").classList.toggle("err", isError);
}
