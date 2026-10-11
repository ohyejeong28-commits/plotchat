// 화면 위에 뜨는 것들: 아래에서 올라오는 시트, 오른쪽 메뉴(서랍), 한 줄 입력 창(모달)
const $ = (id) => document.getElementById(id);

export const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  wand: '<svg viewBox="0 0 24 24"><path d="M4 20L15 9"/><path d="M13 7l4 4"/><path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M9 3v2M8 4h2"/></svg>',
  regen: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  lines: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/></svg>'
};

export function openSheet(build) {
  closeOverlays();
  $("sheetBody").innerHTML = "";
  build($("sheetBody"));
  $("overlay").hidden = false;
  $("sheet").hidden = false;
}

export function openDrawer(build) {
  closeOverlays();
  $("drawerBody").innerHTML = "";
  build($("drawerBody"));
  $("overlay").hidden = false;
  $("drawer").hidden = false;
}

export function closeOverlays() {
  $("overlay").hidden = true;
  $("sheet").hidden = true;
  $("drawer").hidden = true;
}

// 한 줄 입력을 받는다. 취소하면 null.
export function askText({ title, message, placeholder, okLabel = "확인" }) {
  return new Promise((resolve) => {
    $("modalTitle").textContent = title;
    $("modalMessage").textContent = message;
    const input = $("modalInput");
    input.value = "";
    input.placeholder = placeholder;
    $("modalOk").textContent = okLabel;
    const ok = $("modalOk");
    const sync = () => (ok.disabled = !input.value.trim());
    sync();
    const done = (value) => {
      $("modal").hidden = true;
      input.removeEventListener("input", sync);
      input.removeEventListener("keydown", onKey);
      ok.onclick = null;
      $("modalCancel").onclick = null;
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && input.value.trim()) done(input.value.trim());
      if (e.key === "Escape") done(null);
    };
    input.addEventListener("input", sync);
    input.addEventListener("keydown", onKey);
    ok.onclick = () => done(input.value.trim());
    $("modalCancel").onclick = () => done(null);
    $("modal").hidden = false;
    input.focus();
  });
}

// 시트/서랍 안의 한 줄 항목
export function menuItem({ label, sub = "", value = "", chevron = false, danger = false, onClick }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "menu-item" + (danger ? " danger" : "");
  b.innerHTML = `<span class="menu-text"><span class="menu-label"></span><small></small></span><span class="menu-value"></span>${chevron ? ICONS.chevron : ""}`;
  b.querySelector(".menu-label").textContent = label;
  b.querySelector("small").textContent = sub;
  b.querySelector(".menu-value").textContent = value;
  b.addEventListener("click", onClick);
  return b;
}

// 위쪽에 잠깐 떴다 사라지는 안내
let toastTimer = 0;
export function showToast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

export function initOverlays() {
  $("overlay").addEventListener("click", closeOverlays);
  document.addEventListener("viewchange", closeOverlays);
}
