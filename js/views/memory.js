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
  $("memoryRebuild").addEventListener("click", rebuild);
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

// 요약을 비우고 대화 처음부터 다시 정리한다 (긴 대화는 여러 번에 나눠서). 실패하면 원래 요약으로 되돌린다.
async function rebuild() {
  const { apiKey } = loadSettings();
  if (!apiKey) return setInfo("마이페이지에서 AI 연결을 먼저 해 주세요.", true);
  if (!confirm("지금까지의 요약을 지우고 대화 처음부터 다시 정리할까요?\n대화가 길면 몇 분 걸리고 AI를 여러 번 불러요. 유저노트는 그대로예요.")) return;
  const old = await getMemory(ctx.chat.id);
  await saveMemory({ ...old, userNote: $("userNote").value.trim(), summary: "", upToId: null, updatedAt: Date.now() });
  $("memoryRebuild").disabled = $("memoryRefresh").disabled = $("memorySave").disabled = true;
  try {
    for (let round = 0; round < 100; round++) {
      setInfo(`처음부터 다시 정리하는 중… (${memoryWindow(await getMemory(ctx.chat.id), ctx.path).summarizedCount}/${ctx.path.length})`);
      const next = await summarize(ctx.chat.id, ctx.path, ctx.plot, ctx.persona, { force: true });
      if (!next) break;
      ctx.memory = next;
    }
    ctx.memory = await getMemory(ctx.chat.id);
    render("처음부터 다시 정리했어요.");
  } catch (err) {
    await saveMemory(old); // 중간에 실패하면 원래 요약으로 되돌린다
    ctx.memory = old;
    render();
    setInfo(`다시 정리하지 못해 원래 요약으로 되돌렸어요. (${err.message})`, true);
  } finally {
    $("memoryRebuild").disabled = $("memoryRefresh").disabled = $("memorySave").disabled = false;
  }
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
