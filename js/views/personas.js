// 대화 프로필: 마이페이지 목록, 편집 화면(제타의 "대화 프로필 편집"), 채팅에서 고르는 시트
import { listPersonas, getPersona, savePersona, deletePersona } from "../personas.js";
import { loadSettings, saveSettings } from "../settings.js";
import { paintAvatar } from "../render.js";
import { cropImage } from "../images.js";
import { openSheet, closeOverlays, ICONS } from "../ui.js";
import { register, go, back, showView } from "../router.js";

const $ = (id) => document.getElementById(id);
const DESC_MAX = 1000;
let editing = null; // 편집 중인 프로필

export function initPersonas() {
  register("my", async () => {
    await renderMyList();
    showView("my");
  });
  register("persona", openEditor);

  $("personaAdd").addEventListener("click", () => go("persona", null));
  $("personaBack").addEventListener("click", () => back("my"));
  $("personaImage").addEventListener("click", () => $("personaImgInput").click());
  $("personaImgInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    editing.image = await cropImage(file, 1, 1, 320);
    paintHead();
  });
  $("personaName").addEventListener("input", () => {
    editing.name = $("personaName").value;
    paintHead();
  });
  $("personaDesc").addEventListener("input", () => {
    editing.description = $("personaDesc").value;
    $("personaCount").textContent = `${editing.description.length}/${DESC_MAX}`;
  });
  $("personaSave").addEventListener("click", save);
  $("personaDelete").addEventListener("click", async () => {
    if (!editing.id || !confirm(`'${editing.name}' 프로필을 지울까요?`)) return;
    await deletePersona(editing.id);
    back("my");
  });
}

// ---- 마이페이지 목록 ----

async function renderMyList() {
  const list = $("personaList");
  list.innerHTML = "";
  const defaultId = loadSettings().defaultPersonaId;
  for (const p of await listPersonas()) {
    list.appendChild(personaRow(p, {
      checked: p.id === defaultId,
      onClick: () => go("persona", p.id),
      onEdit: () => go("persona", p.id)
    }));
  }
}

// 제타 목록 한 줄: 이미지, 이름, 설명 두 줄, 연필. checked면 이미지에 보라 체크.
function personaRow(p, { checked, onClick, onEdit }) {
  const row = document.createElement("div");
  row.className = "persona-row";
  row.innerHTML = `<button type="button" class="persona-main"><span class="avatar-wrap"><span class="avatar md"></span></span>
      <span class="persona-text"><b></b><small></small></span></button>
    <button type="button" class="icon-btn pen" aria-label="프로필 수정">${ICONS.pen}</button>`;
  paintAvatar(row.querySelector(".avatar"), p);
  if (checked) row.querySelector(".avatar-wrap").insertAdjacentHTML("beforeend", `<i class="check-badge">${ICONS.check}</i>`);
  row.querySelector("b").textContent = p.name;
  row.querySelector("small").textContent = p.description || "설명 없음";
  row.querySelector(".persona-main").addEventListener("click", onClick);
  row.querySelector(".pen").addEventListener("click", onEdit);
  return row;
}

// ---- 편집 화면 ----

async function openEditor(id) {
  editing = id ? { ...(await getPersona(id)) } : { name: "", description: "", image: "" };
  editing.description ??= "";
  editing.image ??= "";
  $("personaName").value = editing.name;
  $("personaDesc").value = editing.description;
  $("personaCount").textContent = `${editing.description.length}/${DESC_MAX}`;
  const defaultId = loadSettings().defaultPersonaId;
  $("personaDefault").checked = id ? defaultId === id : !defaultId;
  $("personaDelete").hidden = !id;
  paintHead();
  showView("persona");
}

function paintHead() {
  paintAvatar($("personaImage"), { name: editing.name || "?", image: editing.image });
  $("personaImage").insertAdjacentHTML("beforeend", `<i class="pen-badge">${ICONS.pen}</i>`);
  $("personaHeadName").textContent = editing.name || "이름 없음";
  $("personaSave").disabled = !editing.name.trim();
}

async function save() {
  editing.name = editing.name.trim();
  editing.description = editing.description.trim();
  if (!editing.name) return;
  await savePersona(editing);
  const defaultId = loadSettings().defaultPersonaId;
  if ($("personaDefault").checked) saveSettings({ defaultPersonaId: editing.id });
  else if (defaultId === editing.id) saveSettings({ defaultPersonaId: "" });
  back("my");
}

// ---- 채팅에서 고르는 시트 ----
// selectedId: 지금 대화의 프로필, onSelect(id 또는 "")
export async function openPersonaSheet({ selectedId, onSelect }) {
  const personas = await listPersonas();
  openSheet((body) => {
    body.insertAdjacentHTML("beforeend", `<div class="sheet-title">내 대화 프로필</div>`);
    const group = document.createElement("div");
    group.className = "sheet-group";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "persona-add";
    add.innerHTML = `<span class="plus-circle">${ICONS.plus}</span>대화 프로필 추가`;
    add.addEventListener("click", () => {
      closeOverlays();
      go("persona", null);
    });
    group.appendChild(add);
    body.appendChild(group);

    const list = document.createElement("div");
    list.className = "sheet-group";
    const none = document.createElement("button");
    none.type = "button";
    none.className = "persona-none" + (selectedId ? "" : " on");
    none.textContent = "프로필 없이 대화하기";
    none.addEventListener("click", () => {
      closeOverlays();
      onSelect("");
    });
    list.appendChild(none);
    for (const p of personas) {
      list.appendChild(personaRow(p, {
        checked: p.id === selectedId,
        onClick: () => {
          closeOverlays();
          onSelect(p.id);
        },
        onEdit: () => {
          closeOverlays();
          go("persona", p.id);
        }
      }));
    }
    body.appendChild(list);
  });
}
