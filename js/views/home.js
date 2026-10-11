// 홈: 제타처럼 세로로 긴 커버 카드 2열
import { listPlots } from "../plots.js";
import { listChats } from "../chats.js";
import { paintCover, formatCount } from "../render.js";
import { register, go, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
const CHAT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3C6.8 3 2.5 6.6 2.5 11c0 2.3 1.2 4.4 3.1 5.9L5 21l4.3-2.4c.9.2 1.8.3 2.7.3 5.2 0 9.5-3.6 9.5-8S17.2 3 12 3z"/></svg>';

export function initHome() {
  register("home", openHome);
}

async function openHome() {
  const plots = await listPlots();
  const grid = $("plotGrid");
  grid.innerHTML = "";
  for (const plot of plots) {
    const chats = await listChats(plot.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "plot-card";
    card.innerHTML = `<div class="cover"></div><div class="shade"></div>
      <span class="count-badge">${CHAT_ICON}<span></span></span>
      <div class="info"><div class="card-title"></div><div class="card-desc"></div><div class="card-tags"></div><div class="card-sub"></div></div>`;
    paintCover(card.querySelector(".cover"), plot);
    card.querySelector(".count-badge span").textContent = formatCount(chats.length);
    card.querySelector(".card-title").textContent = plot.title;
    card.querySelector(".card-desc").textContent = plot.description;
    card.querySelector(".card-tags").textContent = plot.tags.map((t) => "#" + t).join(" ");
    card.querySelector(".card-sub").textContent = plot.characters.map((c) => c.name).filter(Boolean).join(", ");
    card.addEventListener("click", () => go("plot", plot.id));
    grid.appendChild(card);
  }
  $("homeEmpty").hidden = plots.length > 0;
  showView("home");
}
