// 대화와 메시지 저장.
// 메시지는 parentId로 앞 메시지를 가리킨다. 같은 parentId를 가진 메시지가 여러 개면
// 갈림길(재생성, 분기)이고, chat.headId가 지금 보고 있는 줄기의 마지막 메시지다.
import { put, get, getAll, getAllBy, del, delBy } from "./db.js";

const now = () => Date.now();
const newId = () => crypto.randomUUID();

export const getChat = (id) => get("chats", id);
export const getMessage = (id) => get("messages", id);

export async function listChats(plotId) {
  return (await getAllBy("chats", "plotId", plotId)).sort((a, b) => b.updatedAt - a.updatedAt);
}

// 대화방에 지금 걸려 있는 순서: 마지막으로 열었거나(이어하기) 대화한 시각
const activeAt = (c) => Math.max(c.openedAt || 0, c.updatedAt);

// 모든 플롯의 대화, 최근 순 (대화 탭)
export async function listAllChats() {
  return (await getAll("chats")).sort((a, b) => activeAt(b) - activeAt(a));
}

export async function latestChat(plotId) {
  return (await getAllBy("chats", "plotId", plotId)).sort((a, b) => activeAt(b) - activeAt(a))[0] || null;
}

export async function createChat(plot, personaId = null) {
  const chat = { id: newId(), plotId: plot.id, personaId, headId: null, createdAt: now(), updatedAt: now() };
  if (plot.intro) await addMessage(chat, "assistant", plot.intro);
  else await put("chats", chat);
  return chat;
}

export const saveChat = (chat) => put("chats", chat);

// extra: 메시지에 같이 저장할 값 (예: 답변을 만든 모델 이름)
export async function addMessage(chat, role, content, extra = {}) {
  const msg = { id: newId(), chatId: chat.id, parentId: chat.headId, role, content, createdAt: now(), ...extra };
  await put("messages", msg);
  chat.headId = msg.id;
  chat.updatedAt = now();
  await put("chats", chat);
  return msg;
}

export async function setHead(chat, id) {
  chat.headId = id;
  chat.updatedAt = now();
  await put("chats", chat);
}

export const updateMessage = (msg) => put("messages", msg);

// 여기서부터 새로하기: messages(처음부터 고른 메시지까지)를 복사해 새 대화를 만든다. 원래 대화는 그대로 남는다.
// { chat: 새 대화, idMap: 원래 메시지 id → 새 메시지 id }
export async function branchChat(chat, messages) {
  const copy = { id: newId(), plotId: chat.plotId, personaId: chat.personaId, headId: null, createdAt: now(), updatedAt: now() };
  if (chat.choices !== undefined) copy.choices = chat.choices;
  const idMap = {};
  for (const m of messages) {
    const { id, chatId, parentId, ...rest } = m;
    const msg = { ...rest, id: newId(), chatId: copy.id, parentId: copy.headId };
    await put("messages", msg);
    idMap[id] = msg.id;
    copy.headId = msg.id;
  }
  await put("chats", copy);
  return { chat: copy, idMap };
}

export async function deleteMessages(ids) {
  for (const id of ids) await del("messages", id);
}

// ---- 메시지 나무 ----
// 대화 전체를 불러와 byId(아이디 → 메시지)와 children(부모 아이디 → 자식들, 오래된 순)으로 정리한다
const ROOT = "root";

export async function loadTree(chat) {
  const all = await getAllBy("messages", "chatId", chat.id);
  all.sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map(all.map((m) => [m.id, m]));
  const children = new Map();
  for (const m of all) {
    const key = m.parentId || ROOT;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(m);
  }
  return { byId, children };
}

// 지금 줄기: head에서 parentId를 따라 처음까지 거슬러 올라간다
export function pathOf(tree, headId) {
  const path = [];
  for (let m = tree.byId.get(headId); m; m = tree.byId.get(m.parentId)) path.push(m);
  return path.reverse();
}

// 같은 자리의 다른 버전들 (재생성으로 생긴 답변 등)
export function siblingsOf(tree, msg) {
  return (tree.children.get(msg.parentId || ROOT) || []).filter((s) => s.role === msg.role);
}

// 이 메시지에서 이어지는 가장 최근 줄기의 끝
export function latestLeaf(tree, msg) {
  let m = msg;
  for (;;) {
    const kids = tree.children.get(m.id);
    if (!kids?.length) return m;
    m = kids[kids.length - 1];
  }
}

export function descendantsOf(tree, msg) {
  const out = [];
  const stack = [...(tree.children.get(msg.id) || [])];
  while (stack.length) {
    const m = stack.pop();
    out.push(m);
    stack.push(...(tree.children.get(m.id) || []));
  }
  return out;
}

export async function deleteChat(id) {
  await delBy("messages", "chatId", id);
  await del("memories", id);
  await del("chats", id);
}

export async function deleteChatsOfPlot(plotId) {
  for (const chat of await getAllBy("chats", "plotId", plotId)) await deleteChat(chat.id);
}
