// 플롯 상세: 커버, 소개, 등장인물, 대화 시작, 저장된 대화
import { getPlot, deletePlot } from "../plots.js";
import { listChats, getMessage, deleteChat } from "../chats.js";
import { paintAvatar, paintCover, previewText, formatDate } from "../render.js";
import { fillVars } from "../prompt.js";
import { personaForChat } from "../personas.js";
import { register, go, back, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
let plotId = null;

export function initPlot() {
  register("plot", openPlot);
  $("plotBack").addEventListener("click", () => back("home"));
  $("plotContinue").addEventListener("click", () => go("chat", plotId));
  $("plotNewChat").addEventListener("click", () => go("chat", plotId, "new"));
  $("plotEdit").addEventListener("click", () => go("edit", plotId));
  $("plotDelete").addEventListener("click", async () => {
    const plot = await getPlot(plotId);
    if (!confirm(`'${plot.title}' 플롯과 저장된 대화를 모두 지울까요?\n되돌릴 수 없어요.`)) return;
    await deletePlot(plotId);
    go("home");
  });
}

async function openPlot(id) {
  const plot = await getPlot(id);
  if (!plot) return go("home");
  plotId = id;
  paintCover($("plotCover"), plot, { letter: false });
  $("plotTitle").textContent = plot.title;
  $("plotDesc").textContent = plot.description;

  const tags = $("plotTags");
  tags.innerHTML = "";
  for (const t of plot.tags) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = "#" + t;
    tags.appendChild(span);
  }

  const cast = $("plotCast");
  cast.innerHTML = "";
  for (const c of plot.characters) {
    const item = document.createElement("div");
    item.className = "cast-item";
    item.innerHTML = `<div class="avatar"></div><span></span>`;
    paintAvatar(item.querySelector(".avatar"), c);
    item.querySelector("span").textContent = c.name;
    cast.appendChild(item);
  }

  const chats = await listChats(id);
  $("plotContinue").textContent = chats.length ? "이어서 대화하기" : "대화 시작";
  $("plotNewChat").hidden = !chats.length;

  const list = $("chatList");
  list.innerHTML = "";
  for (const chat of chats) {
    const head = chat.headId ? await getMessage(chat.headId) : null;
    const row = document.createElement("div");
    row.className = "chat-row";
    row.innerHTML = `<button type="button" class="chat-row-open"><div class="chat-row-preview"></div><div class="chat-row-meta"></div></button>
      <button type="button" class="chat-row-del" aria-label="대화 삭제">✕</button>`;
    row.querySelector(".chat-row-preview").textContent = head
      ? (head.role === "user" ? "나: " : "") + previewText(fillVars(head.content, plot, await personaForChat(chat)))
      : "(빈 대화)";
    row.querySelector(".chat-row-meta").textContent = formatDate(chat.updatedAt);
    row.querySelector(".chat-row-open").addEventListener("click", () => go("chat", id, chat.id));
    row.querySelector(".chat-row-del").addEventListener("click", async () => {
      if (!confirm("이 대화를 지울까요? 되돌릴 수 없어요.")) return;
      await deleteChat(chat.id);
      openPlot(id);
    });
    list.appendChild(row);
  }
  $("chatListEmpty").hidden = chats.length > 0;
  showView("plot");
}
