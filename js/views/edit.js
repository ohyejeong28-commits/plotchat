// 플롯 만들기 / 수정. 제타처럼 탭(프롬프트 · 설정집 · 스타일 · 인트로 · 소개)으로 나뉜 전체 화면.
import { getPlot, savePlot, normalizePlot, promptLength, LIMITS } from "../plots.js";
import { STYLE, MOODS, STORYTELLING, styleValue } from "../prompt.js";
import { cropImage } from "../images.js";
import { register, goReplace, back, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let draft = null; // 편집 중인 플롯
let snapshot = ""; // 열었을 때 내용 (나갈 때 바뀐 게 있는지 확인용)
let pane = "prompt";
let imageTarget = null; // 이미지 파일을 고르면 실행할 함수

export function initEdit() {
  register("edit", openEditor);
  $("editBack").addEventListener("click", close);
  $("editSave").addEventListener("click", save);
  $("editTabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane)));

  bindText("editTitle", (v) => (draft.title = v));
  bindText("editWorld", (v) => (draft.world = v));
  bindText("editExamples", (v) => (draft.examples = v));
  bindText("editIntro", (v) => (draft.intro = v));
  bindText("editDesc", (v) => (draft.description = v));
  $("editUnlimited").addEventListener("change", (e) => (draft.unlimited = e.target.checked));

  $("charAdd").addEventListener("click", () => {
    if (draft.characters.length >= LIMITS.characters) return;
    draft.characters.push({ name: "", image: "", desc: "" });
    renderCharacters();
    [...document.querySelectorAll(".char-name")].pop().focus();
  });
  $("loreAdd").addEventListener("click", () => {
    if (draft.lore.length >= LIMITS.lore) return;
    draft.lore.push({ keys: "", content: "" });
    renderLore();
    [...document.querySelectorAll(".lore-keys")].pop().focus();
  });

  $("imgInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !imageTarget) return;
    try {
      await imageTarget(file);
    } catch {
      alert("이미지를 불러오지 못했어요.");
    }
  });
  $("coverPick").addEventListener("click", () => pickImage(async (file) => {
    draft.cover = await cropImage(file, 3, 4, 600);
    renderCover();
  }));
  $("coverClear").addEventListener("click", () => {
    draft.cover = "";
    renderCover();
  });

  $("tagAdd").addEventListener("click", addTag);
  $("tagInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addTag();
    }
  });

  // 인트로 입력 도우미: {{user}} 넣기, *서술* 감싸기
  document.querySelectorAll("#view-edit [data-insert]").forEach((b) =>
    b.addEventListener("click", () => insertAtCursor($("editIntro"), b.dataset.insert)));
  document.querySelectorAll("#view-edit [data-wrap]").forEach((b) =>
    b.addEventListener("click", () => wrapSelection($("editIntro"), b.dataset.wrap)));
}

async function openEditor(id) {
  const plot = id ? await getPlot(id) : null;
  draft = normalizePlot(plot ? structuredClone(plot) : { title: "", characters: [{ name: "", image: "", desc: "" }] });
  snapshot = JSON.stringify(draft);
  $("editTitle").value = draft.title || "";
  $("editWorld").value = draft.world;
  $("editExamples").value = draft.examples;
  $("editIntro").value = draft.intro;
  $("editDesc").value = draft.description;
  $("editUnlimited").checked = draft.unlimited;
  renderCharacters();
  renderLore();
  renderStyle();
  renderCover();
  renderTags();
  showView("edit");
  showPane("prompt");
}

function close() {
  if (JSON.stringify(draft) !== snapshot && !confirm("저장하지 않은 내용이 있어요. 나갈까요?")) return;
  back("create");
}

async function save() {
  const errors = validate();
  if (errors.prompt) return showPane("prompt");
  if (errors.intro) return showPane("intro");
  draft.title = draft.title.trim();
  draft.characters = draft.characters.map((c) => ({ ...c, name: c.name.trim(), desc: c.desc.trim() }));
  draft.lore = draft.lore.map((e) => ({ keys: e.keys.trim(), content: e.content.trim() })).filter((e) => e.keys && e.content);
  await savePlot(draft);
  snapshot = JSON.stringify(draft);
  goReplace("plot", draft.id);
}

// ---- 탭 ----

function showPane(name) {
  pane = name;
  $("editTabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.pane === name));
  document.querySelectorAll("#view-edit .pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
  $("views").scrollTop = 0;
  refresh();
}

// 글자 수, 빈 필수 칸, 등록 버튼 상태를 다시 그린다
function refresh() {
  const counter = $("editCounter");
  counter.classList.remove("over");
  if (pane === "prompt") {
    const n = promptLength(draft);
    counter.textContent = `${n.toLocaleString()}/${LIMITS.prompt.toLocaleString()}자`;
    counter.classList.toggle("over", n > LIMITS.prompt);
  } else if (pane === "intro") {
    counter.textContent = `${draft.intro.length.toLocaleString()}/${LIMITS.intro.toLocaleString()}자`;
  } else {
    counter.textContent = "";
  }
  document.querySelectorAll("#view-edit [data-count-for]").forEach((el) => {
    const input = $(el.dataset.countFor);
    el.textContent = `${input.value.length.toLocaleString()}/${Number(input.maxLength).toLocaleString()}${el.tagName === "EM" ? "" : "자"}`;
  });
  document.querySelectorAll(".char-box").forEach((box, i) => {
    box.querySelector(".input-count em").textContent = `${draft.characters[i].name.length}/${LIMITS.name}`;
  });
  validate();
}

// 제타처럼 빈 필수 칸은 바로 빨갛게 표시하고, 탭에 ! 를 띄운다
function validate() {
  const titleMissing = !draft.title.trim();
  $("editTitle").closest(".field").classList.toggle("invalid", titleMissing);
  let nameMissing = false;
  document.querySelectorAll(".char-box").forEach((box, i) => {
    const missing = !draft.characters[i].name.trim();
    box.querySelector(".name-field").classList.toggle("invalid", missing);
    nameMissing ||= missing;
  });
  const introMissing = !draft.intro.trim();
  document.querySelector('#view-edit .pane[data-pane="intro"]').classList.toggle("invalid", introMissing);
  const errors = { prompt: titleMissing || nameMissing, intro: introMissing };
  $("editTabs").querySelector('[data-pane="prompt"]').classList.toggle("err", errors.prompt);
  $("editTabs").querySelector('[data-pane="intro"]').classList.toggle("err", errors.intro);
  $("editSave").classList.toggle("ready", !errors.prompt && !errors.intro);
  return errors;
}

function bindText(id, set) {
  $(id).addEventListener("input", (e) => {
    set(e.target.value);
    refresh();
  });
}

// ---- 캐릭터 ----

function renderCharacters() {
  const list = $("charList");
  list.innerHTML = "";
  draft.characters.forEach((c, i) => {
    const box = document.createElement("div");
    box.className = "box char-box";
    box.innerHTML = `<div class="char-head"><span>캐릭터 ${i + 1}${i === 0 ? " · 대표" : ""}</span>
        ${i > 0 ? `<button type="button" class="icon-btn" data-del aria-label="캐릭터 삭제">${X_ICON}</button>` : ""}</div>
      <button type="button" class="img-pick square"><span>+<br>캐릭터 이미지</span></button>
      <div class="center"><button type="button" class="text-btn" data-clear hidden>이미지 지우기</button></div>
      <label class="field name-field"><span class="label req">이름</span>
        <span class="input-count"><input class="char-name" maxlength="${LIMITS.name}" placeholder="짧은 이름이 부르기 편해요. 예) 수현"><em></em></span>
        <small class="field-err">캐릭터의 이름을 입력해주세요</small></label>
      <label class="field"><span class="label">설명</span>
        <textarea class="char-desc" rows="7" placeholder="캐릭터의 특징, 행동, 감정 표현에 대해서 써주시면 개성 있는 캐릭터를 만들 수 있어요.&#10;예) 수현은 말이 험하고 온갖 비속어를 휘황찬란하게 사용한다."></textarea></label>`;
    const pick = box.querySelector(".img-pick");
    const clear = box.querySelector("[data-clear]");
    pick.classList.toggle("has-img", !!c.image);
    pick.style.backgroundImage = c.image ? `url("${c.image}")` : "";
    clear.hidden = !c.image;
    pick.addEventListener("click", () => pickImage(async (file) => {
      c.image = await cropImage(file, 1, 1, 512);
      renderCharacters();
    }));
    clear.addEventListener("click", () => {
      c.image = "";
      renderCharacters();
    });
    const name = box.querySelector(".char-name");
    name.value = c.name;
    name.addEventListener("input", () => {
      c.name = name.value;
      refresh();
    });
    const desc = box.querySelector(".char-desc");
    desc.value = c.desc;
    desc.addEventListener("input", () => {
      c.desc = desc.value;
      refresh();
    });
    box.querySelector("[data-del]")?.addEventListener("click", () => {
      draft.characters.splice(i, 1);
      renderCharacters();
    });
    list.appendChild(box);
  });
  $("charCount").textContent = `${draft.characters.length}/${LIMITS.characters}`;
  $("charAdd").disabled = draft.characters.length >= LIMITS.characters;
  refresh();
}

// ---- 설정집 ----

function renderLore() {
  const list = $("loreList");
  list.innerHTML = "";
  draft.lore.forEach((entry, i) => {
    const item = document.createElement("div");
    item.className = "lore-item";
    item.innerHTML = `<div class="row">
        <input class="lore-keys" placeholder="키워드 (쉼표로 구분) · 예: 늑대단, 검은 늑대">
        <button type="button" class="icon-btn" aria-label="설정 삭제">${X_ICON}</button>
      </div>
      <textarea class="lore-content" rows="3" placeholder="키워드가 대화에 나오면 AI에게 알려 줄 설정"></textarea>`;
    const keys = item.querySelector(".lore-keys");
    const content = item.querySelector(".lore-content");
    keys.value = entry.keys;
    content.value = entry.content;
    keys.addEventListener("input", () => (entry.keys = keys.value));
    content.addEventListener("input", () => (entry.content = content.value));
    item.querySelector("button").addEventListener("click", () => {
      draft.lore.splice(i, 1);
      renderLore();
    });
    list.appendChild(item);
  });
  $("loreCount").textContent = `${draft.lore.length}/${LIMITS.lore}`;
  $("loreAdd").disabled = draft.lore.length >= LIMITS.lore;
}

// ---- 스타일 ----

function renderStyle() {
  const s = draft.style;
  const root = $("stylePane");
  root.innerHTML = "";
  const group = (title, rows) => {
    const h = document.createElement("h3");
    h.className = "style-group-title";
    h.textContent = title;
    const box = document.createElement("div");
    box.className = "style-group";
    box.append(...rows);
    root.append(h, box);
  };
  group("플레이 시스템", [
    toggleRow("유저 턴에 선택지 제공", "답변 끝에 내가 고를 수 있는 행동 3개를 보여 줘요", "choices"),
    toggleRow("배경 상태창", "장소, 시간, 분위기를 답변 아래에 보여 줘요", "bgStatus"),
    toggleRow("캐릭터 상태창", "인물의 기분, 호감도, 속마음을 답변 아래에 보여 줘요", "charStatus")
  ]);
  group("진행 방식", [segRow("difficulty"), segRow("pace")]);
  group("스토리 연출", [segRow("pov"), segRow("tense"), segRow("length"), segRow("expression"), moodRow(), storyRow()]);

  function toggleRow(label, help, key) {
    const row = document.createElement("label");
    row.className = "toggle-row";
    row.innerHTML = `<span>${label}<small>${help}</small></span><input type="checkbox" class="switch">`;
    const box = row.querySelector("input");
    box.checked = !!s[key];
    box.addEventListener("change", () => (s[key] = box.checked));
    return row;
  }

  function segRow(key) {
    const def = STYLE[key];
    const row = document.createElement("div");
    row.className = "style-row";
    row.innerHTML = `<div class="style-row-label">${def.label}</div><div class="seg"></div><div class="seg-help"></div>`;
    const seg = row.querySelector(".seg");
    const update = () => {
      const current = styleValue(s, key);
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.value === current));
      row.querySelector(".seg-help").textContent = def.options[current][1].replace("{{user}}", "나");
    };
    for (const [value, [label]] of Object.entries(def.options)) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.value = value;
      b.textContent = label;
      b.addEventListener("click", () => {
        s[key] = value;
        update();
      });
      seg.appendChild(b);
    }
    update();
    return row;
  }

  function moodRow() {
    const row = document.createElement("div");
    row.className = "style-row";
    row.innerHTML = `<div class="style-row-label">분위기<small>(최대 2개 선택 가능)</small></div><div class="chips"></div>`;
    s.moods ??= [];
    for (const mood of MOODS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = mood;
      b.classList.toggle("on", s.moods.includes(mood));
      b.addEventListener("click", () => {
        if (s.moods.includes(mood)) s.moods = s.moods.filter((m) => m !== mood);
        else if (s.moods.length < 2) s.moods.push(mood);
        b.classList.toggle("on", s.moods.includes(mood));
      });
      row.querySelector(".chips").appendChild(b);
    }
    return row;
  }

  function storyRow() {
    const row = document.createElement("div");
    row.className = "style-row";
    row.innerHTML = `<div class="style-row-label">스토리텔링 스타일</div><div class="story-grid"></div><div class="seg-help"></div>`;
    const grid = row.querySelector(".story-grid");
    const update = () => {
      const current = STORYTELLING[s.storytelling] ? s.storytelling : "none";
      grid.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.value === current));
      row.querySelector(".seg-help").textContent = STORYTELLING[current][1];
    };
    for (const [value, [label]] of Object.entries(STORYTELLING)) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.value = value;
      b.textContent = label;
      b.addEventListener("click", () => {
        s.storytelling = value;
        update();
      });
      grid.appendChild(b);
    }
    update();
    return row;
  }
}

// ---- 소개: 커버, 해시태그 ----

function renderCover() {
  const pick = $("coverPick");
  pick.classList.toggle("has-img", !!draft.cover);
  pick.style.backgroundImage = draft.cover ? `url("${draft.cover}")` : "";
  $("coverClear").hidden = !draft.cover;
}

function renderTags() {
  const list = $("tagList");
  list.innerHTML = "";
  draft.tags.forEach((tag, i) => {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = "#" + tag;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.setAttribute("aria-label", tag + " 삭제");
    del.addEventListener("click", () => {
      draft.tags.splice(i, 1);
      renderTags();
    });
    chip.appendChild(del);
    list.appendChild(chip);
  });
  $("tagCount").textContent = `${draft.tags.length}/${LIMITS.tags}`;
  $("tagAdd").disabled = draft.tags.length >= LIMITS.tags;
}

function addTag() {
  const input = $("tagInput");
  const tag = input.value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  input.value = "";
  if (!tag || draft.tags.includes(tag) || draft.tags.length >= LIMITS.tags) return;
  draft.tags.push(tag);
  renderTags();
}

// ---- 이미지 ----

function pickImage(fn) {
  imageTarget = fn;
  $("imgInput").click();
}

// ---- 인트로 입력 도우미 ----

function insertAtCursor(ta, text) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  ta.value = value.slice(0, s) + text + value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  ta.focus();
  ta.dispatchEvent(new Event("input"));
}

function wrapSelection(ta, mark) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e);
  ta.value = value.slice(0, s) + mark + selected + mark + value.slice(e);
  ta.selectionStart = ta.selectionEnd = selected ? e + mark.length * 2 : s + mark.length;
  ta.focus();
  ta.dispatchEvent(new Event("input"));
}
