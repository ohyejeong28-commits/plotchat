// 채팅 화면 (제타의 대화방)
import { loadSettings, saveSettings, unlimitedFor } from "../settings.js";
import { ask, limitOf, modelLadder, currentAutoModel, AUTO, REASON_LABEL } from "../ai.js";
import { buildSystem, buildSuggestSystem, buildMessages, fillVars, choicesOn, SUGGEST_REQUEST, skipTurnRequest } from "../prompt.js";
import { getPlot } from "../plots.js";
import { getPersona, personaForChat } from "../personas.js";
import { getMemory, saveMemory, memoryWindow, needsSummary, summarize } from "../memory.js";
import {
  getChat, latestChat, createChat, saveChat, addMessage, setHead, updateMessage, deleteMessages, branchChat,
  loadTree, pathOf, siblingsOf, latestLeaf, descendantsOf
} from "../chats.js";
import { renderText, splitBlocks, splitSegments, renderStatus, paintAvatar, modelLabel, modelShort } from "../render.js";
import { openDrawer, openSheet, closeOverlays, askText, menuItem, showToast, ICONS } from "../ui.js";
import { openPersonaSheet } from "./personas.js";
import { register, go, goReplace, back, replaceTop, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
const SEND_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';

let plot = null;
let chat = null;
let persona = null; // 이 대화에서 내가 연기하는 프로필 (없으면 null)
let memory = null; // 이 대화의 장기 기억 (요약 + 유저노트)
let tree = null; // 이 대화의 모든 메시지 (갈림길 포함)
let path = []; // 지금 보고 있는 줄기
let controller = null; // 답변을 받는 중이면 중지용 컨트롤러가 들어 있다
let deleteFrom = null; // 대화 삭제 모드에서 고른 시작 메시지 id (모드가 아니면 undefined)
let suggest = { pages: [], index: -1, headId: null, loading: false }; // ⚡ 답변 추천
let suggestController = null;
let lastSkipNote = ""; // 같은 모델 대체 알림을 매번 띄우지 않게

export function initChat() {
  register("chat", openChat);
  $("chatBack").addEventListener("click", () => back("chats"));
  $("chatMenu").addEventListener("click", openMenu);
  $("chatModel").addEventListener("change", (e) => saveSettings({ model: e.target.value }));
  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (controller) controller.abort();
    else send();
  });
  const input = $("chatInput");
  input.addEventListener("keydown", (e) => {
    // 한글 조합 중의 Enter는 무시해야 마지막 글자가 잘리거나 두 번 보내지지 않는다
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!controller && input.value.trim()) send(); // 빈 칸에서 Enter는 아무 일도 안 한다 (턴 넘기기는 버튼으로만)
    }
  });
  input.addEventListener("input", autoGrow);
  $("starBtn").addEventListener("click", () => wrapSelection(input, "*"));
  $("suggestBtn").addEventListener("click", () => ($("suggestPanel").hidden ? openSuggest() : closeSuggest()));
  $("suggestPrev").addEventListener("click", () => {
    if (suggest.index > 0 && !suggest.loading) {
      suggest.index--;
      renderSuggest();
    }
  });
  $("suggestNext").addEventListener("click", nextSuggest);
  $("chatLog").addEventListener("scroll", updateScrollButton);
  $("scrollDown").addEventListener("click", scrollDown);
  $("delCancel").addEventListener("click", exitDeleteMode);
  $("delClear").addEventListener("click", () => markDelete(null));
  $("delConfirm").addEventListener("click", confirmDelete);
  // 채팅 화면을 떠나면 받던 답변을 멈춘다 (받은 만큼은 저장된다)
  document.addEventListener("viewchange", (e) => {
    if (e.detail !== "chat") {
      controller?.abort();
      closeSuggest();
    }
  });
}

// chatId: 없으면 지금 걸려 있는 대화, "new"면 새 대화
async function openChat(plotId, chatId) {
  controller?.abort();
  plot = await getPlot(plotId);
  if (!plot) return go("home");
  const defaultPersona = loadSettings().defaultPersonaId || null;
  if (chatId === "new") chat = await createChat(plot, defaultPersona);
  else chat = (chatId && (await getChat(chatId))) || (await latestChat(plotId)) || (await createChat(plot, defaultPersona));
  chat.openedAt = Date.now(); // 이어하기로 연 대화가 이 플롯의 "지금 대화"가 된다
  await saveChat(chat);
  replaceTop("chat", plotId, chat.id); // 뒤로 갔다 다시 올 때 새 대화가 또 생기지 않게
  persona = await personaForChat(chat);
  memory = await getMemory(chat.id);

  $("chatName").textContent = plot.name;
  fillModelPicker();
  exitDeleteMode(false);
  closeSuggest();
  suggest = { pages: [], index: -1, headId: null, loading: false };
  notice("");
  await refresh();
  showView("chat");
  scrollDown();
  autoGrow();
  $("chatInput").focus();
}

// 저장소에서 다시 읽어 화면을 그린다 (smooth: 맨 아래로 부드럽게 내려간다)
async function refresh(options) {
  tree = await loadTree(chat);
  path = pathOf(tree, chat.headId);
  renderAll(options);
}

// ---- 보내기 / 답변 받기 ----

async function send() {
  const input = $("chatInput");
  const text = input.value.trim();
  if (!hasKey()) return;
  if (!text) return skipTurn();
  input.value = "";
  autoGrow();
  notice("");
  closeSuggest();
  await addMessage(chat, "user", text);
  await refresh({ smooth: true });
  $("chatLog").lastElementChild?.classList.add("enter");
  await generate();
}

// 턴 넘기기: 입력칸이 빈 채로 ▶를 누르면 내 차례를 넘기고 이야기를 이어서 받는다
async function skipTurn() {
  if (!path.length) return;
  notice("");
  closeSuggest();
  await generate(undefined, undefined, { skip: true });
}

// 지금 줄기 끝에 캐릭터 답변을 하나 받는다.
// fallbackHeadId: 실패하면 되돌아갈 답변 (재생성 전 답변), rewrite: "달라지면 좋을 점" 요청,
// skip: 턴 넘기기 (마지막이 캐릭터 답변이면 "지켜본다"는 신호를 AI에게만 덧붙인다)
async function generate(fallbackHeadId, rewrite, { skip = false } = {}) {
  if (!hasKey()) return;
  const { model } = loadSettings();
  // 답변을 받는 도중 다른 대화로 옮겨 가도 원래 대화에 저장되도록 붙잡아 둔다
  const thisPlot = plot;
  const thisChat = chat;
  const thisPersona = persona;
  const { summary, recent: history } = memoryWindow(memory, path); // 요약된 앞부분은 요약으로, 나머지는 그대로
  const userNote = memory.userNote;
  const unlimited = unlimitedFor(thisPlot);

  const pending = appendTurn({ role: "assistant", content: "" });
  pending.classList.add("typing", "enter");
  fillTurn(pending, { role: "assistant", content: "" });
  scrollDown(true);
  setBusy(true);
  // 받은 글자를 타자 치듯 일정한 속도로 보여 주고, 화면도 글자를 따라 부드럽게 올라간다
  const typer = createTyper((shown) => {
    fillTurn(pending, { role: "assistant", content: closeOpenStar(shown) });
    followBottom();
  });
  controller.signal.addEventListener("abort", () => typer.stop());

  let reply = "";
  let error = "";
  let usedModel = model;
  let skipped = [];
  try {
    const result = await ask({
      system: buildSystem(thisPlot, thisPersona, history, { chat: thisChat, rewrite, summary, userNote, unlimited, voiceFrom: path, traits: memory.traits }),
      messages: skip && history.at(-1)?.role === "assistant"
        ? [...buildMessages(history, thisPlot, thisPersona), { role: "user", content: skipTurnRequest(thisPersona) }]
        : buildMessages(history, thisPlot, thisPersona),
      unlimited,
      signal: controller.signal,
      onText: (chunk) => {
        reply += chunk;
        typer.push(reply);
      }
    });
    usedModel = result.model;
    skipped = result.skipped || [];
    if (result.blocked) error = result.blocked; // 받은 만큼은 저장하고, 끊긴 이유를 알린다
  } catch (err) {
    if (err.name !== "AbortError") error = err.message;
  } finally {
    await typer.finish(); // 받은 글자를 다 보여 준 뒤에 저장하고 다시 그린다
    setBusy(false);
  }

  // 중간에 멈추거나 오류가 나도 받은 만큼은 저장한다
  if (reply.trim()) await addMessage(thisChat, "assistant", reply, { model: usedModel });
  else if (fallbackHeadId) await setHead(thisChat, fallbackHeadId);

  if (reply.trim()) maybeSummarize(thisChat, thisPlot, thisPersona); // 기다리지 않고 뒤에서 정리
  if (thisChat !== chat) return;
  await refresh();
  fillModelPicker(); // 한도가 찬 모델 표시를 갱신
  if (error) notice(error);
  else if (skipped.length) {
    // 짧은 알림으로 (이유별로 묶어서). 같은 상황이 이어지면 다시 띄우지 않는다
    const key = skipped.map((s) => s.model + s.reason).join("|") + usedModel;
    if (key !== lastSkipNote) {
      lastSkipNote = key;
      const groups = {};
      for (const s of skipped) (groups[s.reason] ||= []).push(modelShort(s.model));
      const why = Object.entries(groups).map(([r, ms]) => `${ms.join("·")} ${REASON_LABEL[r] || "막힘"}`).join(", ");
      showToast(`${why} → ${modelShort(usedModel)}(으)로 답했어요`);
    }
  } else lastSkipNote = "";
}

// 요약 안 된 메시지가 많이 쌓였으면 장기 기억을 정리한다. 실패해도 대화에는 지장이 없다 (다음 답변 뒤에 다시 시도).
async function maybeSummarize(thisChat, thisPlot, thisPersona) {
  try {
    const fullPath = pathOf(await loadTree(thisChat), thisChat.headId);
    if (!needsSummary(await getMemory(thisChat.id), fullPath)) return;
    const next = await summarize(thisChat.id, fullPath, thisPlot, thisPersona);
    if (next && chat?.id === thisChat.id) memory = next;
  } catch {
    // 무료 한도 초과 등: 조용히 넘어가고 다음 기회에 다시 정리한다
  }
}

// ---- 메시지 동작 ----

async function regenerate(msg, rewrite) {
  notice("");
  await setHead(chat, msg.parentId);
  path = pathOf(tree, msg.parentId);
  renderAll();
  await generate(msg.id, rewrite);
}

// 🪄 달라지면 좋을 점: 요청을 받아 그 답변을 고쳐 다시 쓴다 (새 버전으로 쌓인다)
async function rewriteWithRequest(msg) {
  const request = await askText({
    title: "어떻게 고쳐드릴까요?",
    message: "어떤 점이 달라지면 좋을지 알려주세요",
    placeholder: "예시) 대사만 부끄러워하는 말투로 바꿔줘.",
    okLabel: "수정"
  });
  if (request) await regenerate(msg, { request, previous: msg.content });
}

async function switchVariant(msg, step) {
  const sibs = siblingsOf(tree, msg);
  const target = sibs[sibs.indexOf(msg) + step];
  if (!target) return;
  await setHead(chat, latestLeaf(tree, target).id);
  await refresh();
}

function startEdit(turn, msg) {
  turn.classList.add("editing");
  turn.querySelector(".turn-foot").hidden = true;
  turn.querySelector(".extras").hidden = true;
  const content = turn.querySelector(".turn-content");
  content.innerHTML = `<div class="edit-box"><textarea class="edit-area"></textarea>
    <div class="row edit-bar"><button type="button" class="secondary small">취소</button><button type="button" class="primary small">저장</button></div></div>`;
  const area = content.querySelector("textarea");
  area.value = msg.content;
  const fit = () => {
    area.style.height = "auto";
    area.style.height = area.scrollHeight + 2 + "px";
  };
  area.addEventListener("input", fit);
  const [cancelBtn, saveBtn] = content.querySelectorAll("button");
  cancelBtn.addEventListener("click", () => renderAll());
  saveBtn.addEventListener("click", async () => {
    const text = area.value.trim();
    if (!text) return;
    msg.content = text;
    await updateMessage(msg);
    await refresh();
  });
  fit();
  area.focus();
}

// ---- 대화 삭제 모드: 시작점을 고르면 그 메시지부터 뒤를 모두 지운다 ----

function enterDeleteMode() {
  deleteFrom = null;
  $("view-chat").classList.add("select-mode");
  closeSuggest();
  markDelete(null);
}

function exitDeleteMode(redraw = true) {
  deleteFrom = undefined;
  $("view-chat").classList.remove("select-mode");
  if (redraw && tree) renderAll();
}

function markDelete(id) {
  deleteFrom = id;
  let after = false;
  document.querySelectorAll("#chatLog .turn").forEach((t) => {
    const start = t.dataset.id === id;
    after ||= start;
    t.classList.toggle("del-start", start);
    t.classList.toggle("del-after", after && !start);
  });
  $("delConfirm").disabled = !id;
}

async function confirmDelete() {
  const msg = tree.byId.get(deleteFrom);
  if (!msg) return;
  const ids = [msg.id, ...descendantsOf(tree, msg).map((m) => m.id)];
  if (!confirm(`선택한 메시지부터 ${ids.length}개를 지울까요? 되돌릴 수 없어요.`)) return;
  await deleteMessages(ids);
  await setHead(chat, msg.parentId || null);
  exitDeleteMode(false);
  await refresh();
}

// ---- ≡ 메뉴 ----

function openMenu() {
  openDrawer((body) => {
    const group = (...items) => {
      const g = document.createElement("div");
      g.className = "drawer-group";
      g.append(...items);
      body.appendChild(g);
    };
    group(
      menuItem({ label: "새로하기", sub: "현재 내용을 저장하고 다시 시작할 수 있어요", onClick: () => goReplace("chat", plot.id, "new") }),
      menuItem({ label: "이어하기", chevron: true, onClick: () => go("saves", plot.id) }),
      menuItem({ label: "대화 삭제", onClick: () => { closeOverlays(); enterDeleteMode(); } })
    );
    group(
      menuItem({ label: "대화 프로필", value: persona?.name || "없음", chevron: true, onClick: pickPersona }),
      menuItem({ label: "기억", sub: "유저노트와 지금까지의 이야기 요약", chevron: true, onClick: () => go("memory", plot.id, chat.id) }),
      menuItem({ label: "선택지", value: choicesOn(plot, chat) ? "사용" : "사용 안 함", chevron: true, onClick: pickChoices })
    );
    group(
      menuItem({ label: "플롯 정보", onClick: () => go("plot", plot.id) }),
      menuItem({ label: "플롯 수정", onClick: () => go("edit", plot.id) })
    );
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "drawer-leave";
    leave.innerHTML = `${ICONS.exit}<span>대화방 나가기</span>`;
    leave.addEventListener("click", () => back("chats"));
    body.appendChild(leave);
  });
}

function pickPersona() {
  openPersonaSheet({
    selectedId: persona?.id || "",
    onSelect: async (id) => {
      chat.personaId = id || null;
      await saveChat(chat);
      persona = await getPersona(chat.personaId);
      suggest = { pages: [], index: -1, headId: null, loading: false };
      renderAll();
    }
  });
}

function pickChoices() {
  openSheet((body) => {
    body.insertAdjacentHTML("beforeend", `<div class="sheet-title">선택지</div>`);
    const g = document.createElement("div");
    g.className = "sheet-group";
    const set = async (value) => {
      if (value === undefined) delete chat.choices;
      else chat.choices = value;
      await saveChat(chat);
      closeOverlays();
    };
    const current = chat.choices;
    g.append(
      menuItem({ label: "사용", sub: "답변 끝에 내가 고를 수 있는 행동 3개를 보여 줘요", value: current === true ? "✓" : "", onClick: () => set(true) }),
      menuItem({ label: "사용 안 함", value: current === false ? "✓" : "", onClick: () => set(false) }),
      menuItem({ label: "플롯 설정 따르기", sub: `지금 플롯 설정: ${plot.style?.choices ? "사용" : "사용 안 함"}`, value: current === undefined ? "✓" : "", onClick: () => set(undefined) })
    );
    body.appendChild(g);
  });
}

// ---- ⚡ 답변 추천 ----

function openSuggest() {
  if (!hasKey()) return;
  $("suggestPanel").hidden = false;
  $("suggestBtn").classList.add("open");
  $("view-chat").classList.add("suggesting");
  if (suggest.headId !== chat.headId || !suggest.pages.length) {
    suggest = { pages: [], index: -1, headId: chat.headId, loading: false };
    nextSuggest();
  } else {
    renderSuggest();
  }
}

function closeSuggest() {
  $("suggestPanel").hidden = true;
  $("suggestBtn").classList.remove("open");
  $("view-chat").classList.remove("suggesting");
  suggestController?.abort();
}

async function nextSuggest() {
  if (suggest.loading) return;
  if (suggest.index < suggest.pages.length - 1) {
    suggest.index++;
    return renderSuggest();
  }
  suggest.loading = true;
  suggest.partial = [];
  renderSuggest();
  suggestController = new AbortController();
  const { summary, recent } = memoryWindow(memory, path);
  const unlimited = unlimitedFor(plot);
  let text = "";
  try {
    await ask({
      system: buildSuggestSystem(plot, persona, recent, { summary, userNote: memory.userNote, traits: memory.traits, unlimited }),
      messages: [...buildMessages(recent, plot, persona), { role: "user", content: SUGGEST_REQUEST }],
      unlimited,
      signal: suggestController.signal,
      onText: (chunk) => {
        // 쓰이는 대로 카드에 보여 준다
        text += chunk;
        suggest.partial = parseSuggestions(text, true);
        renderSuggest();
      }
    });
    const items = parseSuggestions(text, false);
    if (!items.length) throw new Error("추천을 만들지 못했어요. 다시 눌러 주세요.");
    suggest.pages.push(items);
    suggest.index = suggest.pages.length - 1;
  } catch (err) {
    if (err.name !== "AbortError") notice(err.message);
  } finally {
    suggest.loading = false;
    suggestController = null;
    renderSuggest();
  }
}

// <추천>…</추천> 블록을 꺼낸다. partial이면 아직 닫히지 않은 마지막 블록도 쓰는 중인 글로 넣는다.
function parseSuggestions(text, partial) {
  const items = [...text.matchAll(/<추천>([\s\S]*?)<\/추천>/g)].map((m) => m[1].trim()).filter(Boolean);
  if (partial) {
    const open = text.lastIndexOf("<추천>");
    if (open > text.lastIndexOf("</추천>")) {
      const tail = text.slice(open + 4).replace(/<\/?추?천?>?$/, "").trim();
      if (tail) items.push(tail);
    }
  }
  return items.slice(0, 3);
}

function renderSuggest() {
  const list = $("suggestList");
  list.innerHTML = "";
  if (suggest.loading) {
    // 다 쓴 추천과 쓰는 중인 추천은 바로 보여 주고, 아직 안 나온 자리는 빙글빙글
    const shown = suggest.partial || [];
    for (const item of shown) list.insertAdjacentHTML("beforeend", `<div class="suggest-card writing">${renderText(closeOpenStar(item))}</div>`);
    for (let i = shown.length; i < 3; i++) list.insertAdjacentHTML("beforeend", `<div class="suggest-card loading"><span class="spinner"></span></div>`);
  } else {
    for (const item of suggest.pages[suggest.index] || []) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "suggest-card";
      card.innerHTML = renderText(item);
      card.addEventListener("click", () => {
        const input = $("chatInput");
        input.value = item;
        autoGrow();
        closeSuggest();
        input.focus();
      });
      list.appendChild(card);
    }
  }
  $("suggestPrev").disabled = suggest.loading || suggest.index <= 0;
  $("suggestNext").disabled = suggest.loading;
}

// ---- 화면 그리기 ----

function renderAll({ smooth = false } = {}) {
  const log = $("chatLog");
  const keep = log.scrollTop; // 다시 그리는 동안 스크롤이 맨 위로 튀지 않게
  log.innerHTML = "";
  path.forEach((msg, i) => appendTurn(msg, i === path.length - 1));
  if (deleteFrom !== undefined) markDelete(deleteFrom);
  log.scrollTop = keep;
  scrollDown(smooth);
}

// 메시지 하나 = turn. 내 메시지는 오른쪽, 캐릭터 답변은 내레이션/인물별 말풍선으로 나뉜다.
function appendTurn(msg, isLast = false) {
  const turn = document.createElement("div");
  turn.className = `turn ${msg.role === "user" ? "me" : "ai"}${isLast ? " last" : ""}`;
  turn.dataset.id = msg.id || "";
  turn.innerHTML = `<div class="turn-content"></div><div class="extras"></div><div class="turn-foot"></div>`;
  fillTurn(turn, msg);
  // 제타처럼 버튼은 맨 아래 메시지에만: 중간 메시지를 고치면 그 뒤 답변과 요약 기억이 어긋난다
  if (msg.id && isLast) buildActions(turn, msg);
  turn.addEventListener("click", () => {
    if (deleteFrom !== undefined && msg.id) markDelete(msg.id);
  });
  if (msg.id) bindMessageMenu(turn, msg);
  $("chatLog").appendChild(turn);
  return turn;
}

// ---- 메시지 메뉴 (제타처럼 오른쪽 클릭, 폰에서는 길게 누르기) ----

function bindMessageMenu(turn, msg) {
  turn.addEventListener("contextmenu", (e) => {
    if (e.target.closest("textarea, .edit-box")) return; // 고치는 중인 글상자는 보통 메뉴
    e.preventDefault();
    openMessageMenu(msg);
  });
  let timer = 0;
  let start = null;
  const cancel = () => clearTimeout(timer);
  turn.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return; // 마우스는 오른쪽 클릭으로
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      turn.dataset.longPress = "1";
      openMessageMenu(msg);
    }, 500);
  });
  turn.addEventListener("pointermove", (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  turn.addEventListener("pointerup", cancel);
  turn.addEventListener("pointercancel", cancel);
  // 길게 눌러 메뉴를 연 뒤 따라오는 클릭은 무시한다
  turn.addEventListener("click", (e) => {
    if (turn.dataset.longPress) {
      delete turn.dataset.longPress;
      e.stopImmediatePropagation();
    }
  }, true);
}

function openMessageMenu(msg) {
  if (controller || deleteFrom !== undefined) return; // 답변을 받는 중이거나 삭제 모드면 열지 않는다
  openSheet((body) => {
    const group = (...items) => {
      const g = document.createElement("div");
      g.className = "sheet-group";
      g.append(...items);
      body.appendChild(g);
    };
    group(menuItem({ label: "여기서부터 새로하기", sub: "이 메시지까지 담은 새 대화를 만들어요", onClick: () => { closeOverlays(); branchFrom(msg); } }));
    group(
      menuItem({ label: "복사", onClick: () => { closeOverlays(); copyMessage(msg); } }),
      menuItem({ label: "삭제", sub: "이 메시지부터 아래를 지워요", danger: true, onClick: () => { closeOverlays(); enterDeleteMode(); markDelete(msg.id); } })
    );
  });
}

async function branchFrom(msg) {
  if (!confirm("여기서부터 새로 할까요?\n기존 대화는 '이어하기'에서 언제든 다시 할 수 있어요.")) return;
  const upto = path.slice(0, path.findIndex((m) => m.id === msg.id) + 1);
  if (!upto.length) return;
  const { chat: next, idMap } = await branchChat(chat, upto);
  // 기억: 유저노트는 그대로, 요약은 이 메시지 앞까지 정리된 경우만 가져간다
  const old = memory || {};
  const copy = { chatId: next.id, userNote: old.userNote || "", summary: "", upToId: null, updatedAt: Date.now() };
  if (old.upToId && idMap[old.upToId]) Object.assign(copy, { summary: old.summary, upToId: idMap[old.upToId] });
  else if (!old.upToId && old.summary) copy.summary = old.summary; // 직접 적어 둔 요약
  if (copy.userNote || copy.summary) await saveMemory(copy);
  goReplace("chat", plot.id, next.id);
  showToast("여기서부터 새로 시작해요. 기존 대화는 이어하기에 있어요.");
}

async function copyMessage(msg) {
  // [이름] 머리줄은 빼고 본문만
  const text = fillVars(msg.content, plot, persona).split("\n").filter((l) => !/^\s*\[[^\]\n]{1,30}\]\s*$/.test(l)).join("\n").trim();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast("복사했어요.");
}

function fillTurn(turn, msg) {
  const content = turn.querySelector(".turn-content");
  const text = fillVars(msg.content, plot, persona);

  if (msg.role === "user") {
    content.innerHTML = `<div class="me-head"><span class="me-name"></span><span class="avatar"></span></div><div class="bubble"></div>`;
    content.querySelector(".me-name").textContent = persona?.name || "나";
    paintAvatar(content.querySelector(".avatar"), persona || { name: "나" });
    content.querySelector(".bubble").innerHTML = renderText(text);
    return;
  }

  const parts = splitBlocks(text);
  const segs = splitSegments(parts.body, plot);
  content.innerHTML = "";
  if (!segs.length) segs.push({ kind: "char", name: plot.name, who: plot.characters[0], text: "" }); // 받기 시작 전: ··· 표시
  for (const seg of segs) {
    const el = document.createElement("div");
    if (seg.kind === "narrator") {
      el.className = "narrator";
      el.innerHTML = `${ICONS.lines}<div class="narrator-text"></div>`;
      el.querySelector(".narrator-text").innerHTML = renderText(seg.text);
    } else {
      el.className = "speaker";
      el.innerHTML = `<span class="avatar"></span><div class="seg-body"><div class="seg-name"></div><div class="bubble"></div></div>`;
      paintAvatar(el.querySelector(".avatar"), seg.who);
      el.querySelector(".seg-name").textContent = seg.name;
      el.querySelector(".bubble").innerHTML = renderText(seg.text);
    }
    content.appendChild(el);
  }
  if (msg.model) content.insertAdjacentHTML("beforeend", `<div class="model-tag">${modelLabel(msg.model)}</div>`);

  const extras = turn.querySelector(".extras");
  extras.innerHTML = renderStatus(parts);
  if (parts.choices?.length && turn.classList.contains("last")) {
    const box = document.createElement("div");
    box.className = "choices";
    for (const choice of parts.choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = choice;
      b.addEventListener("click", () => {
        if (controller) return;
        const input = $("chatInput");
        input.value = choice;
        autoGrow();
        input.focus();
      });
      box.appendChild(b);
    }
    extras.appendChild(box);
  }
}

// 메시지 아래 버튼: 다른 버전이 있으면 ‹ 1/3 ›, 동그란 버튼 ✎ 수정 · 🪄 달라지면 좋을 점 · ↻ 재생성
function buildActions(turn, msg) {
  const foot = turn.querySelector(".turn-foot");
  const sibs = siblingsOf(tree, msg);
  if (sibs.length > 1) {
    const i = sibs.indexOf(msg);
    const nav = document.createElement("span");
    nav.className = "variants";
    nav.append(roundButton("‹", "이전 버전", () => switchVariant(msg, -1), i === 0, "text"),
      Object.assign(document.createElement("span"), { textContent: `${i + 1}/${sibs.length}` }),
      roundButton("›", "다음 버전", () => switchVariant(msg, 1), i === sibs.length - 1, "text"));
    foot.append(nav);
  }
  const acts = document.createElement("span");
  acts.className = "acts";
  acts.append(roundButton(ICONS.pen, "수정", () => startEdit(turn, msg)));
  if (msg.role === "assistant" && msg.parentId) {
    acts.append(roundButton(ICONS.wand, "달라지면 좋을 점", () => rewriteWithRequest(msg)));
    acts.append(roundButton(ICONS.regen, "다시 생성", () => regenerate(msg)));
  }
  if (msg.role === "user") acts.append(roundButton(ICONS.regen, "답변 받기", () => generate()));
  foot.append(acts);
}

function roundButton(icon, label, onClick, disabled = false, kind = "round") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = kind === "text" ? "act-text" : "round-act";
  b.innerHTML = icon;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.disabled = disabled;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!controller) onClick();
  });
  return b;
}

// 위쪽 모델 선택 (제타의 koji/luca 자리)
// 맨 위는 "자동 · 지금 쓰는 모델", 그 아래는 품질 순서 사다리 (막힌 모델은 "· 오늘 한도" / "· 서버 붐빔")
function fillModelPicker() {
  const { model, models } = loadSettings();
  const select = $("chatModel");
  select.innerHTML = "";
  const add = (value, text) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  };
  const ladder = modelLadder(models);
  const top = currentAutoModel();
  add(AUTO, top ? `자동 · ${modelShort(top)}` : "자동");
  for (const id of ladder) {
    const mark = limitOf(id);
    add(id, modelLabel(id) + (mark ? ` · ${REASON_LABEL[mark.reason] || "막힘"}` : ""));
  }
  if (model && model !== AUTO && !ladder.includes(model)) add(model, modelLabel(model));
  select.value = model || AUTO;
}

// ---- 기타 ----

function hasKey() {
  const { apiKey, model } = loadSettings();
  if (apiKey && model) return true;
  notice("마이페이지에서 AI 연결을 먼저 해 주세요.");
  return false;
}

function setBusy(busy) {
  controller = busy ? new AbortController() : null;
  $("chatSend").innerHTML = busy ? STOP_ICON : SEND_ICON;
  $("chatSend").setAttribute("aria-label", busy ? "중지" : "보내기");
  $("chatSend").classList.toggle("stop", busy);
  $("chatLog").classList.toggle("busy", busy);
  if (!busy) autoGrow();
}

// kind: 빨간 오류(기본) 또는 "info"(보라 안내)
function notice(text, kind = "") {
  const el = $("chatNotice");
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle("info", kind === "info");
}

function scrollDown(smooth = false) {
  const log = $("chatLog");
  log.scrollTo({ top: log.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  updateScrollButton();
}

// 답변이 써지는 동안 화면을 글자 끝으로 조금씩 끌어 올린다 (위로 올려 읽는 중이면 그대로 둔다)
function followBottom() {
  const log = $("chatLog");
  const gap = log.scrollHeight - log.scrollTop - log.clientHeight;
  if (gap > 0 && gap < 400) log.scrollTop += Math.ceil(gap * 0.3);
  updateScrollButton();
}

// 받은 글을 일정한 속도로 흘려 보여 준다. 밀린 글자가 많을수록 빨라져서 너무 뒤처지지 않는다.
//   push(전체 글): 지금까지 받은 글, finish(): 남은 글을 다 보여 줄 때까지 기다린다, stop(): 바로 다 보여 준다
function createTyper(render) {
  let target = "";
  let shown = 0;
  let frame = 0;
  let finishing = false;
  let resolveDone = null;
  const tick = () => {
    const backlog = target.length - shown;
    if (backlog > 0) {
      shown = Math.min(target.length, shown + Math.max(2, Math.ceil(backlog / (finishing ? 10 : 28))));
      render(target.slice(0, shown));
    }
    if (shown < target.length) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      if (finishing) resolveDone?.();
    }
  };
  return {
    push(text) {
      target = text;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    finish() {
      finishing = true;
      return new Promise((resolve) => {
        resolveDone = resolve;
        if (shown >= target.length && !frame) resolve();
      });
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      shown = target.length;
      if (target) render(target);
      resolveDone?.();
    }
  };
}

// 쓰는 도중이라 *서술*이 아직 안 닫혔으면 임시로 닫아서 별표가 그대로 보이지 않게 한다
function closeOpenStar(text) {
  return (text.match(/\*/g) || []).length % 2 ? text + "*" : text;
}

function updateScrollButton() {
  const log = $("chatLog");
  $("scrollDown").hidden = log.scrollHeight - log.scrollTop - log.clientHeight < 200;
}

function autoGrow() {
  const input = $("chatInput");
  // 입력칸이 비면 ▶가 회색 "턴 넘기기" 버튼이 된다 (제타와 같다)
  const send = $("chatSend");
  if (!controller) {
    send.classList.toggle("skip", !input.value.trim());
    send.setAttribute("aria-label", input.value.trim() ? "보내기" : "턴 넘기기");
    send.title = input.value.trim() ? "" : "턴 넘기기";
  }
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
  input.style.overflowY = input.scrollHeight > 160 ? "auto" : "hidden";
}

function wrapSelection(ta, mark) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e);
  ta.value = value.slice(0, s) + mark + selected + mark + value.slice(e);
  ta.selectionStart = ta.selectionEnd = selected ? e + mark.length * 2 : s + mark.length;
  ta.focus();
  autoGrow();
}
