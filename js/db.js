// 이 기기 안의 저장소(IndexedDB). PC 앱과 아이폰 웹앱에서 똑같이 동작한다.
const DB_NAME = "plotchat";
const VERSION = 3; // 2: 대화 프로필(personas), 3: 장기 기억(memories) 추가
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("plots")) db.createObjectStore("plots", { keyPath: "id" });
        if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" }).createIndex("plotId", "plotId");
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" }).createIndex("chatId", "chatId");
        if (!db.objectStoreNames.contains("personas")) db.createObjectStore("personas", { keyPath: "id" });
        if (!db.objectStoreNames.contains("memories")) db.createObjectStore("memories", { keyPath: "chatId" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await open();
  const req = fn(db.transaction(storeName, mode).objectStore(storeName));
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const put = (storeName, value) => run(storeName, "readwrite", (s) => s.put(value)).then(() => value);
export const get = (storeName, id) => run(storeName, "readonly", (s) => s.get(id));
export const getAll = (storeName) => run(storeName, "readonly", (s) => s.getAll());
export const getAllBy = (storeName, index, key) => run(storeName, "readonly", (s) => s.index(index).getAll(key));
export const del = (storeName, id) => run(storeName, "readwrite", (s) => s.delete(id));

// 여러 저장소를 한 번에 통째로 바꾼다 (백업 불러오기). 하나라도 실패하면 아무것도 바뀌지 않는다.
// data: { 저장소 이름: [값, ...] }
export async function replaceStores(data) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(Object.keys(data), "readwrite");
    for (const [name, values] of Object.entries(data)) {
      const store = tx.objectStore(name);
      store.clear();
      for (const v of values) store.put(v);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("불러오기가 취소됐어요."));
  });
}

// index 값이 key인 항목을 한 번에 지운다 (예: 어떤 대화의 메시지 전부)
export async function delBy(storeName, index, key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.index(index).getAllKeys(key);
    req.onsuccess = () => req.result.forEach((k) => store.delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
