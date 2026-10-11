// 이어하기: 이 플롯에서 저장된 대화 목록 (제타의 "2026-03-16 00:05에 저장된 대화")
import { getPlot } from "../plots.js";
import { listChats, latestChat, getMessage, deleteChat } from "../chats.js";
import { previewText } from "../render.js";
import { fillVars } from "../prompt.js";
import { personaForChat } from "../personas.js";
import { openSheet, closeOverlays, menuItem, ICONS } from "../ui.js";
import { register, go, back, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
const MAX_SAVES = 100;
let plotId = null;

export function initSaves() {
  register("saves", openSaves);
  $("savesBack").addEventListener("click", () => back("chats"));
}

async function openSaves(id) {
  const plot = await getPlot(id);
  if (!plot) return go("home");
  plotId = id;
  const chats = await listChats(id);
  const current = await latestChat(id);
  $("savesCount").textContent = `${chats.length}/${MAX_SAVES}`;
  const list = $("savesList");
  list.innerHTML = "";
  for (const chat of chats) {
    const head = chat.headId ? await getMessage(chat.headId) : null;
    const row = document.createElement("div");
    row.className = "save-row";
    row.innerHTML = `<button type="button" class="save-main"><b></b><small><span class="save-date"></span><i></i><span class="save-preview"></span></small></button>
      <button type="button" class="icon-btn" aria-label="더 보기">${ICONS.more}</button>`;
    row.querySelector("b").textContent = `${stamp(chat.updatedAt)}에 저장된 대화`;
    if (chat.id === current?.id) row.querySelector("b").insertAdjacentHTML("beforeend", ' <span class="badge">진행 중</span>');
    row.querySelector(".save-date").textContent = short(chat.createdAt);
    row.querySelector(".save-preview").textContent = head
      ? previewText(fillVars(head.content, plot, await personaForChat(chat)), 60)
      : "(빈 대화)";
    row.querySelector(".save-main").addEventListener("click", () => go("chat", id, chat.id));
    row.querySelector(".icon-btn").addEventListener("click", () => openSheet((body) => {
      const group = document.createElement("div");
      group.className = "sheet-group";
      group.append(
        menuItem({ label: "이어하기", onClick: () => { closeOverlays(); go("chat", id, chat.id); } }),
        menuItem({
          label: "삭제", danger: true, onClick: async () => {
            closeOverlays();
            if (!confirm("이 대화를 지울까요? 되돌릴 수 없어요.")) return;
            await deleteChat(chat.id);
            openSaves(id);
          }
        })
      );
      body.appendChild(group);
    }));
    list.appendChild(row);
  }
  showView("saves");
}

const pad = (n) => String(n).padStart(2, "0");
function stamp(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function short(ts) {
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
