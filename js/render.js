import { BLOCKS } from "./prompt.js";

const HEADER = /^\s*\[([^\]\n]{1,30})\]\s*$/;
const NARRATOR_NAMES = /^(나레이션|내레이션|나레이터|내레이터|narration|narrator)$/i;
const PERSON_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>';

// 캐릭터 답변 본문을 말하는 주체별로 나눈다: [나레이션] / [인물 이름] 머리줄 기준.
// 머리줄이 없는 답변(인트로, 예전 답변)은 대표 캐릭터 하나로 본다.
export function splitSegments(body, plot) {
  const lines = body.split("\n");
  if (lines.length && /^\s*\[[^\]\n]*$/.test(lines[lines.length - 1])) lines.pop(); // 받는 중인 머리줄
  const segs = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m) {
      cur = { speaker: m[1].trim(), lines: [] };
      segs.push(cur);
      continue;
    }
    if (!cur) {
      cur = { speaker: null, lines: [] };
      segs.push(cur);
    }
    cur.lines.push(line);
  }
  return segs
    .map((s) => ({ ...speakerOf(s.speaker, plot), text: s.lines.join("\n").trim() }))
    .filter((s) => s.text);
}

function speakerOf(speaker, plot) {
  if (!speaker) return { kind: "char", name: plot.name, who: plot.characters[0] };
  if (NARRATOR_NAMES.test(speaker)) return { kind: "narrator" };
  const who = plot.characters.find((c) => c.name && (c.name === speaker || speaker.includes(c.name) || c.name.includes(speaker)));
  return { kind: "char", name: speaker, who: who || { name: speaker, image: "", generic: true } };
}

// 모델 이름 줄임: models/gemini-3.6-flash → 3.6-flash
export const modelLabel = (id = "") => id.replace(/^models\//, "").replace(/^gemini-/, "");
// 더 짧게 (위쪽 모델 버튼용): 3.8-flash → 3.8, 3.5-flash-lite → 3.5 lite, gemma-4-31b-it → gemma 31b
export const modelShort = (id = "") => {
  const label = modelLabel(id);
  if (/^gemma/.test(label)) return "gemma " + (label.match(/(\d+)b/)?.[1] || "") + "b";
  return label.replace(/-flash/, "").replace(/-preview/, " 미리보기").replace(/-/g, " ") || label;
};

// 본문 표시: *서술*은 회색 기울임, **강조**는 굵게.
// 제타처럼 빈 줄로 나뉜 덩어리는 문단(사이를 띄운다), 한 줄 바꿈은 같은 문단 안에서 다음 줄로.
export function renderText(text) {
  const inline = (line) => escapeHtml(line)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, '<em class="narr">$1</em>');
  return text.split(/\n\s*\n/)
    .map((para) => para.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length)
    .map((lines) => `<p>${lines.map(inline).join("<br>")}</p>`)
    .join("");
}

// 캐릭터 답변을 본문 / 상태창(bg, chars) / 선택지(choices)로 나눈다.
// 답변을 받는 중이라 아직 닫히지 않은 블록은 숨긴다.
export function splitBlocks(text) {
  const out = {};
  let body = text;
  for (const [key, tag] of Object.entries(BLOCKS)) {
    const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    if (m) {
      out[key] = m[1].trim();
      body = body.replace(m[0], "");
    }
  }
  const open = body.search(new RegExp(`<(${Object.values(BLOCKS).join("|")})>`));
  if (open >= 0) body = body.slice(0, open);
  out.body = body.replace(/<[^>\n]{0,4}$/, "").trim();
  if (out.choices) {
    out.choices = out.choices.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  }
  return out;
}

// 상태창 HTML: 배경은 한 줄 칩, 캐릭터는 인물마다 한 줄
export function renderStatus(parts) {
  let html = "";
  if (parts.bg) {
    const items = parts.bg.split(/\s*\|\s*|\n/).filter(Boolean);
    html += `<div class="status-box bg">${items.map((i) => `<span>${escapeHtml(i)}</span>`).join("")}</div>`;
  }
  if (parts.chars) {
    const rows = parts.chars.split("\n").filter((l) => l.trim());
    html += `<div class="status-box chars">${rows.map((r) => {
      const [name, ...rest] = r.split("|").map((s) => s.trim());
      return `<div class="status-row"><b>${escapeHtml(name)}</b>${rest.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>`;
    }).join("")}</div>`;
  }
  return html;
}

// 목록 미리보기용 한 줄: 상태창과 [이름] 머리줄을 걷어 낸다 (제타처럼 *별표*는 그대로 둔다)
export function previewText(text, max = 70) {
  const body = splitBlocks(text).body.split("\n").filter((l) => !HEADER.test(l)).join(" ");
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

// 프로필 이미지 (캐릭터, 플롯의 대표 캐릭터, 대화 프로필). 없으면 이름 첫 글자 + 이름마다 다른 색,
// 플롯에 없는 인물(generic)은 기본 사람 모양
export function paintAvatar(el, who) {
  el.classList.toggle("generic", !!who.generic && !who.image);
  if (who.image) {
    el.textContent = "";
    el.style.backgroundImage = `url("${who.image}")`;
    return;
  }
  el.style.backgroundImage = "";
  if (who.generic) {
    el.innerHTML = PERSON_ICON;
    return;
  }
  const name = who.name || "?";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) % 360;
  el.textContent = name.slice(0, 1);
  el.style.setProperty("--h", hash);
}

// 카드/상세 화면에 쓸 커버: 커버 이미지 → 대표 캐릭터 이미지 → 없으면 이름 첫 글자와 색
export const coverOf = (plot) => plot.cover || plot.image || "";

export function paintCover(el, plot, { letter = true } = {}) {
  const src = coverOf(plot);
  el.classList.toggle("letter", !src);
  if (src) {
    el.style.backgroundImage = `url("${src}")`;
    if (letter) el.textContent = "";
    return;
  }
  el.style.backgroundImage = "";
  const name = plot.name || plot.title || "?";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) % 360;
  el.style.setProperty("--h", hash);
  if (letter) el.textContent = name.slice(0, 1);
}

export function formatCount(n) {
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "만";
  return n.toLocaleString();
}

export function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
