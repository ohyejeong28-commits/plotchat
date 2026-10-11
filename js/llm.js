// AI 연결부. 다른 회사 API나 로컬 모델로 바꿀 때는 이 파일만 바꾸면 된다.
// 대화 형식: [{ role: "user" | "assistant", content: "..." }]
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// 대화용이 아닌 모델(음성, 이미지, 임베딩 등)은 목록에서 뺀다
const NON_CHAT = /tts|image|audio|live|embed|robotics|computer|veo|imagen|aqa|native|transcribe/i;

export async function listModels(apiKey) {
  const models = [];
  let pageToken = "";
  do {
    const url = `${BASE}/models?pageSize=1000${pageToken ? "&pageToken=" + pageToken : ""}`;
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    if (!res.ok) throw await apiError(res);
    const data = await res.json();
    models.push(...(data.models || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .filter((m) => /gemini|gemma/i.test(m.name) && !NON_CHAT.test(m.name))
    .map((m) => ({ id: m.name, label: m.displayName || m.name.replace("models/", "") }));
}

// 답변을 조각조각 받아 onText로 넘기고, 끝나면 전체 답변을 돌려준다
export async function streamChat({ apiKey, model, system, messages, onText, signal }) {
  // Gemini는 대화가 user로 시작하고 user/model이 번갈아 나와야 안전하다.
  // 같은 쪽 메시지가 연달아 있으면 하나로 합치고, 캐릭터 인트로로 시작하면 앞에 시작 신호를 넣는다.
  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + m.content;
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  if (contents[0]?.role === "model") contents.unshift({ role: "user", parts: [{ text: "(대화 시작)" }] });

  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw await apiError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let blocked = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const chunk = JSON.parse(line.slice(5));
      const cand = chunk.candidates?.[0];
      const text = (cand?.content?.parts || [])
        .filter((p) => !p.thought)
        .map((p) => p.text || "")
        .join("");
      if (text) {
        full += text;
        onText?.(text);
      }
      if (chunk.promptFeedback?.blockReason) blocked = chunk.promptFeedback.blockReason;
      if (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") blocked = cand.finishReason;
    }
  }
  if (!full && blocked) throw new Error(`안전 필터 때문에 답변이 막혔어요 (${blocked}).`);
  return full;
}

// 오류를 사람이 읽을 문장으로 바꾼다. 한도 초과(429)는 err.quota에 { perDay, limit, retryMs }를 담는다.
async function apiError(res) {
  let error = {};
  try {
    error = (await res.json()).error || {};
  } catch {}
  const message = error.message || "";
  if (res.status === 400 && /api key/i.test(message)) return withStatus(new Error("API 키가 올바르지 않아요. 다시 확인해 주세요."), 400);
  if (res.status === 429) {
    const quota = readQuota(error);
    const text = quota.unavailable
      ? "이 모델은 무료 키로는 쓸 수 없어요. 다른 모델을 골라 주세요."
      : quota.perDay
      ? `오늘 무료 한도${quota.limit ? `(하루 ${quota.limit}회)` : ""}를 다 썼어요. 한국 시간 오후 4~5시쯤 다시 채워져요.`
      : `잠깐 사이에 너무 많이 보냈어요.${quota.retryMs ? ` ${Math.ceil(quota.retryMs / 1000)}초 뒤에` : " 잠시 후"} 다시 해 주세요.`;
    return Object.assign(withStatus(new Error(text), 429), { quota });
  }
  if (res.status === 403) return withStatus(new Error("이 키로는 쓸 수 없는 기능이에요. " + message), 403);
  if (res.status === 404) return withStatus(new Error("이 모델은 지금 쓸 수 없어요. 다른 모델을 골라 보세요."), 404);
  return withStatus(new Error(`오류 ${res.status}: ${message || res.statusText}`), res.status);
}

function withStatus(err, status) {
  err.status = status;
  return err;
}

// Google 한도 오류에서 하루 한도인지, 한도 숫자, 다시 시도까지 남은 시간을 꺼낸다
function readQuota(error) {
  const details = error.details || [];
  const violation = details.flatMap((d) => d.violations || [])[0] || {};
  const retry = details.find((d) => d.retryDelay)?.retryDelay || "";
  const message = error.message || "";
  const perDay = /PerDay/i.test(violation.quotaId || "") || (!/PerMinute/i.test(violation.quotaId || "") && /per ?day|daily/i.test(message));
  const limit = Number(violation.quotaValue) || Number(message.match(/limit:\s*(\d+)/)?.[1]) || 0;
  const seconds = parseFloat(retry) || parseFloat(message.match(/retry in ([\d.]+)s/i)?.[1]) || 0;
  const unavailable = violation.quotaValue === "0" || /limit:\s*0\b/.test(message); // 무료 등급에서 아예 막힌 모델 (Pro 등)
  return { perDay, limit, retryMs: seconds * 1000, unavailable };
}
