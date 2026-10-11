// 플롯 상세: 커버, 소개, 등장인물, 대화 시작, 저장된 대화
import { getPlot, deletePlot } from "../plots.js";
import { listChats, getMessage, deleteChat } from "../chats.js";
import { paintAvatar, paintCover, previewText, formatDate, splitBlocks, splitSegments, renderText, escapeHtml } from "../render.js";
import { fillVars } from "../prompt.js";
import { personaForChat, defaultPersona } from "../personas.js";
import { register, go, back, showView } from "../router.js";
import { openSheet, closeOverlays, menuItem, ICONS } from "../ui.js";

const $ = (id) => document.getElementById(id);
let plotId = null;

export function initPlot() {
  register("plot", openPlot);
  $("plotBack").addEventListener("click", () => back("home"));
  $("plotContinue").addEventListener("click", () => go("chat", plotId));
  $("plotNewChat").addEventListener("click", () => go("chat", plotId, "new"));
  $("plotMore").addEventListener("click", () => openSheet((body) => {
    const g = document.createElement("div");
    g.className = "sheet-group";
    g.append(
      menuItem({ label: "새 대화", sub: "처음부터 새로 시작해요", onClick: () => { closeOverlays(); go("chat", plotId, "new"); } }),
      menuItem({ label: "플롯 수정", onClick: () => { closeOverlays(); go("edit", plotId); } }),
      menuItem({ label: "플롯 삭제", danger: true, onClick: () => { closeOverlays(); removePlot(); } })
    );
    body.appendChild(g);
  }));
  $("charViewerClose").addEventListener("click", () => ($("charViewer").hidden = true));
  // 더보기 / 접기
  document.getElementById("view-plot").addEventListener("click", (e) => {
    const btn = e.target.closest(".fold-btn");
    if (!btn) return;
    const open = btn.previousElementSibling.classList.toggle("open");
    btn.textContent = open ? "접기" : "더보기";
  });
}

async function removePlot() {
  const plot = await getPlot(plotId);
  if (!confirm(`'${plot.title}' 플롯과 저장된 대화를 모두 지울까요?\n되돌릴 수 없어요.`)) return;
  await deletePlot(plotId);
  go("home");
}

async function openPlot(id) {
  const plot = await getPlot(id);
  if (!plot) return go("home");
  plotId = id;
  paintCover($("plotCover"), plot, { letter: false });
  $("plotTitle").textContent = plot.title;
  const me = await defaultPersona(); // 소개 글의 {{user}}에 넣을 이름
  $("plotDesc").textContent = fillVars(plot.description, plot, me);

  const tags = $("plotTags");
  tags.innerHTML = "";
  for (const t of plot.tags) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = "#" + t;
    tags.appendChild(span);
  }

  $("plotBadges").hidden = !plot.unlimited;

  // 소개: 세계관(기본 설정)
  $("plotAboutSec").hidden = !plot.world.trim();
  $("plotAbout").innerHTML = richText(fillVars(plot.world.trim(), plot, me));

  // 캐릭터: 사진, 이름, 소개 글. 사진을 누르면 크게 본다
  const cast = $("plotCast");
  cast.innerHTML = "";
  for (const c of plot.characters.filter((c) => c.name)) {
    const desc = fillVars(c.desc.trim(), plot, me);
    const card = document.createElement("div");
    card.className = "char-card";
    card.innerHTML = `<button type="button" class="avatar char-img"></button><div class="char-name"></div>
      <div class="fold-box"><div class="fold plain-text"></div><button type="button" class="fold-btn">더보기</button></div>`;
    paintAvatar(card.querySelector(".char-img"), c);
    card.querySelector(".char-name").textContent = c.name;
    card.querySelector(".plain-text").innerHTML = richText(desc);
    card.querySelector(".char-img").addEventListener("click", () => openCharViewer(c, desc));
    cast.appendChild(card);
  }

  // 인트로: 대화를 시작하면 처음 나오는 장면. 제타처럼 채팅 화면과 같은 말풍선으로 보여 준다
  $("plotIntroSec").hidden = !plot.intro.trim();
  const intro = $("plotIntro");
  intro.innerHTML = "";
  for (const seg of splitSegments(splitBlocks(fillVars(plot.intro, plot, me)).body, plot)) {
    const el = document.createElement("div");
    if (seg.kind === "narrator") {
      el.className = "narrator";
      el.innerHTML = `${ICONS.lines}<div class="narrator-text">${renderText(seg.text)}</div>`;
    } else {
      el.className = "speaker";
      el.innerHTML = `<span class="avatar"></span><div class="seg-body"><div class="seg-name"></div><div class="bubble">${renderText(seg.text)}</div></div>`;
      paintAvatar(el.querySelector(".avatar"), seg.who);
      el.querySelector(".seg-name").textContent = seg.name;
    }
    intro.appendChild(el);
  }

  const chats = await listChats(id);
  $("plotContinue").textContent = chats.length ? "이어서 대화하기" : "대화 시작하기";
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
  $("charViewer").hidden = true;
  showView("plot");
  // 접힌 글이 짧으면 더보기 단추를 숨긴다 (화면에 보인 뒤에 잰다)
  requestAnimationFrame(() => {
    for (const fold of document.querySelectorAll("#view-plot .plot-body .fold")) {
      fold.classList.remove("open");
      const btn = fold.nextElementSibling;
      btn.textContent = "더보기";
      btn.hidden = fold.scrollHeight <= fold.clientHeight + 2;
    }
  });
}

// 소개/설정 글을 제타처럼 보여 준다: "* " 또는 "- "로 시작하는 줄은 글머리 기호, "***"·"---"만 있는 줄은 구분선, **굵게**
function richText(text) {
  return text.split("\n").map((line) => {
    if (/^\s*([*\-_=―─])\1{2,}\s*$/.test(line)) return '<hr class="soft">';
    const html = escapeHtml(line)
      .replace(/^\s*[*\-•]\s+/, "• ")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/`([^`\n]+)`/g, '<b class="label">$1</b>');
    return html;
  }).join("\n").replace(/\n?<hr class="soft">\n?/g, '<hr class="soft">');
}

function openCharViewer(character, desc) {
  if (!character.image) return;
  $("charViewerName").textContent = character.name;
  $("charViewerDesc").innerHTML = richText(desc);
  $("charViewerImg").src = character.image;
  $("charViewer").hidden = false;
  const fold = $("charViewerDesc");
  fold.classList.remove("open");
  requestAnimationFrame(() => {
    fold.nextElementSibling.textContent = "더보기";
    fold.nextElementSibling.hidden = fold.scrollHeight <= fold.clientHeight + 2;
  });
}
