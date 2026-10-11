// 대화 탭: 플롯마다 지금 걸려 있는 대화 하나씩, 최신순 (제타의 대화 목록)
import { getPlot } from "../plots.js";
import { listAllChats, getMessage } from "../chats.js";
import { paintCover, previewText } from "../render.js";
import { fillVars } from "../prompt.js";
import { personaForChat } from "../personas.js";
import { register, go, showView } from "../router.js";

const $ = (id) => document.getElementById(id);

export function initRecent() {
  register("chats", openRecent);
}

async function openRecent() {
  const list = $("recentList");
  list.innerHTML = "";
  const seen = new Set();
  for (const chat of await listAllChats()) {
    if (seen.has(chat.plotId)) continue;
    seen.add(chat.plotId);
    const plot = await getPlot(chat.plotId);
    if (!plot) continue;
    const head = chat.headId ? await getMessage(chat.headId) : null;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "recent";
    row.innerHTML = `<div class="thumb"></div><div class="meta"><div class="name"></div><div class="preview"></div></div>`;
    paintCover(row.querySelector(".thumb"), plot);
    row.querySelector(".name").textContent = plot.name;
    row.querySelector(".preview").textContent = head ? previewText(fillVars(head.content, plot, await personaForChat(chat))) : "";
    row.addEventListener("click", () => go("chat", plot.id, chat.id));
    list.appendChild(row);
  }
  $("chatsEmpty").hidden = seen.size > 0;
  showView("chats");
}
