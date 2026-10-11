// 앱 설정(API 키, 모델)을 이 기기에만 저장한다. 코드나 파일에는 키를 넣지 않는다.
const KEY = "plotchat.settings";
// models: 연결 확인 때 받아 둔 모델 목록 (채팅 화면 위쪽 모델 선택에 쓴다)
// model: "auto"(품질 순서 사다리, ai.js) 또는 직접 고른 모델 id
// chatMode: 제타의 대화 모드. "safe"(세이프) 또는 "unlimited"(언리밋, 언리밋 플롯에서만 적용)
const DEFAULTS = { provider: "gemini", apiKey: "", model: "auto", models: [], defaultPersonaId: "", chatMode: "safe" };

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    // 자동 모드가 생기기 전에 모델을 직접 골라 둔 설정은 한 번만 자동으로 바꾼다
    if (!stored.autoModelSince) {
      stored.model = "auto";
      stored.autoModelSince = Date.now();
      localStorage.setItem(KEY, JSON.stringify(stored));
    }
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

// 이 플롯과의 대화가 언리밋인지: 대화 모드가 언리밋이고, 플롯도 언리밋을 켜 둔 경우만
export function unlimitedFor(plot) {
  return loadSettings().chatMode === "unlimited" && !!plot?.unlimited;
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
