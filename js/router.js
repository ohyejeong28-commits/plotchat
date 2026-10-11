// 화면 전환. 각 화면은 register로 "여는 함수"를 등록하고, 다른 화면에서는 go로 부른다.
// 아래 탭 바가 있는 기본 화면(홈/만들기/대화/마이페이지)과, 탭 바 없이 꽉 차는 화면(플롯/편집/채팅 등)이 있다.
// 뒤로 가기를 위해 지나온 화면을 기록한다 (기본 화면으로 가면 기록을 비운다).
const openers = {};
const ROOT_VIEWS = ["home", "create", "chats", "my"];
const stack = [];

export function register(name, open) {
  openers[name] = open;
}

export function go(name, ...args) {
  if (ROOT_VIEWS.includes(name)) stack.length = 0;
  const top = stack[stack.length - 1];
  if (!top || top.name !== name || JSON.stringify(top.args) !== JSON.stringify(args)) stack.push({ name, args });
  return openers[name] ? openers[name](...args) : showView(name);
}

// 지금 화면을 기록에서 빼고 이동한다 (예: 저장을 마친 편집 화면으로는 돌아오지 않게)
export function goReplace(name, ...args) {
  stack.pop();
  return go(name, ...args);
}

// 지금 화면의 기록을 고쳐 쓴다 (예: "새 대화"로 연 채팅을 그 대화의 id로)
export function replaceTop(name, ...args) {
  if (stack.length) stack[stack.length - 1] = { name, args };
}

export function back(fallback = "home") {
  stack.pop();
  const prev = stack.pop();
  return prev ? go(prev.name, ...prev.args) : go(fallback);
}

export function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".nav-item").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  document.body.classList.toggle("full", !ROOT_VIEWS.includes(name));
  document.getElementById("views").scrollTop = 0;
  document.dispatchEvent(new CustomEvent("viewchange", { detail: name }));
}
