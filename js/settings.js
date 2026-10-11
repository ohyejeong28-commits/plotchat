// 앱 설정(API 키, 모델)을 이 기기에만 저장한다. 코드나 파일에는 키를 넣지 않는다.
const KEY = "plotchat.settings";
// models: 연결 확인 때 받아 둔 모델 목록 (채팅 화면 위쪽 모델 선택에 쓴다)
const DEFAULTS = { provider: "gemini", apiKey: "", model: "", models: [], defaultPersonaId: "" };

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
