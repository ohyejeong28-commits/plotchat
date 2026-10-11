// 만들기 탭: 내가 만든 플롯 관리 (누르면 수정 화면)
import { listPlots } from "../plots.js";
import { paintCover, formatDate } from "../render.js";
import { register, go, showView } from "../router.js";

const $ = (id) => document.getElementById(id);

export function initCreate() {
  register("create", openCreate);
}

async function openCreate() {
  const plots = await listPlots();
  const list = $("myPlotList");
  list.innerHTML = "";
  for (const plot of plots) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "my-plot";
    row.innerHTML = `<div class="thumb"></div><div class="meta"><div class="t"></div><div class="s"></div><div class="d"></div></div>`;
    paintCover(row.querySelector(".thumb"), plot);
    row.querySelector(".t").textContent = plot.title;
    row.querySelector(".s").textContent = [plot.characters.map((c) => c.name).join(", "), plot.description].filter(Boolean).join(" · ");
    row.querySelector(".d").textContent = "수정 " + formatDate(plot.updatedAt);
    row.addEventListener("click", () => go("edit", plot.id));
    list.appendChild(row);
  }
  $("createEmpty").hidden = plots.length > 0;
  showView("create");
}
