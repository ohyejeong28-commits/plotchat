// AI 호출 + 모델 사다리.
// "자동"이면 품질 순서 사다리(최신 Flash → Flash-Lite → Gemma)의 맨 위부터 쓰고, 한도가 차면 한 단계씩 내려간다.
// 한도가 찬 모델은 다시 채워질 때까지 기억해 두고 건너뛰므로, 한도가 풀리면 다음 요청부터 자동으로 다시 올라간다.
// 특정 모델을 직접 골랐으면 그 모델을 먼저 쓰고, 막히면 사다리 순서로 내려간다.
import { loadSettings, saveSettings } from "./settings.js";
import { streamChat, listModels } from "./llm.js";

export const AUTO = "auto";
const LIMITS_KEY = "plotchat.limits"; // { 모델: 다시 쓸 수 있는 시각 }
const FIRST_CHUNK_TIMEOUT = 25_000; // 이 시간 안에 답이 시작되지 않으면 (서버가 붐비면) 다음 모델로 넘어간다

// { system, messages, onText, signal, unlimited } → { text, model, skipped }
// skipped: 이번 답변에서 건너뛰거나 실패해서 아래로 내려온 모델들 [{ model, reason: "day" | "busy" | "minute" }]
// blocked: 구글 필터에 걸려 중간에 끊겼으면 안내 문장 (text에는 받은 만큼 들어 있다)
export async function ask({ system, messages, onText, signal, unlimited = false }) {
  const { apiKey, model } = loadSettings();
  const ladder = modelLadder(await knownModels(apiKey));
  const picked = model && model !== AUTO ? model : null;
  // 직접 고른 모델이 있으면 그 모델부터, 막히면 사다리에서 그보다 아래 모델로만 내려간다
  const below = picked && ladder.includes(picked) ? ladder.slice(ladder.indexOf(picked) + 1) : ladder.filter((id) => id !== picked);
  const candidates = picked ? [picked, ...below] : ladder;
  const skipped = [];
  let lastError = null;
  for (const candidate of candidates) {
    const mark = limitOf(candidate);
    // 직접 고른 모델은 오늘 한도가 찬 게 아니면 일단 시도한다
    if (mark && !(candidate === picked && mark.reason !== "day")) {
      skipped.push({ model: candidate, reason: mark.reason });
      continue;
    }
    let started = false;
    let timedOut = false;
    const ctl = new AbortController();
    const relay = () => ctl.abort();
    signal?.addEventListener("abort", relay);
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, FIRST_CHUNK_TIMEOUT);
    try {
      const text = await streamChat({
        apiKey,
        model: candidate,
        system,
        messages,
        unlimited,
        signal: ctl.signal,
        onText: (chunk) => {
          started = true;
          clearTimeout(timer);
          onText?.(chunk);
        }
      });
      return { text, model: candidate, skipped };
    } catch (err) {
      if (signal?.aborted) throw err; // 사용자가 멈춤
      if (err.partial) return { text: err.partial, model: candidate, skipped, blocked: err.message }; // 필터에 걸려 중간에 끊김
      if (timedOut && !started) {
        skipped.push({ model: candidate, reason: markLimited(candidate, { timeout: true }) });
        lastError = new Error("모델이 너무 오래 답하지 않아요. 잠시 후 다시 해 주세요.");
        continue;
      }
      // 이미 답을 받기 시작했거나, 한도/없는 모델/서버 혼잡(5xx) 문제가 아니면 내려가지 않는다
      if (started || !(err.status === 429 || err.status === 404 || err.status >= 500)) throw err;
      skipped.push({ model: candidate, reason: markLimited(candidate, err) });
      lastError = err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    }
  }
  if (!lastError || lastError.quota?.perDay || lastError.quota?.unavailable || lastError.status === 404) {
    throw new Error("쓸 수 있는 무료 모델의 오늘 한도를 모두 썼어요. 한국 시간 오후 4~5시쯤 다시 채워져요.");
  }
  throw lastError;
}

// 품질 순서 사다리. 무료 키로 못 쓰는 모델(Pro, Omni, 이미지, 2.5 등)은 뺀다.
//   최신 Flash(버전 높은 순, 같은 버전이면 정식판 먼저) → flash-latest → Flash-Lite(버전 높은 순) → Gemma(큰 것부터)
export function modelLadder(models) {
  const ids = models.map((m) => m.id)
    .filter((id) => /gemini|gemma/i.test(id) && !/pro|omni|image|banana|tts|transcribe|customtools|gemini-2\./i.test(id));
  const version = (id) => parseFloat(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
  const preview = (id) => (/preview/.test(id) ? 1 : 0);
  const byVersion = (a, b) => version(b) - version(a) || preview(a) - preview(b);
  const flash = ids.filter((id) => /flash/.test(id) && !/lite/.test(id));
  const lite = ids.filter((id) => /flash-lite/.test(id));
  const gemma = ids.filter((id) => /gemma/.test(id));
  const size = (id) => parseInt(id.match(/(\d+)b/)?.[1] || 0, 10);
  return [
    ...flash.filter((id) => version(id)).sort(byVersion),
    ...flash.filter((id) => !version(id)),
    ...lite.filter((id) => version(id)).sort(byVersion),
    ...lite.filter((id) => !version(id)),
    ...gemma.sort((a, b) => size(b) - size(a))
  ];
}

// 자동 모드에서 지금 쓰일 모델 (사다리에서 막히지 않은 맨 위)
export function currentAutoModel() {
  return modelLadder(loadSettings().models).find((id) => !isLimited(id)) || null;
}

// 막힌 이유를 사람 말로 (알림, 모델 목록에 쓴다)
export const REASON_LABEL = { day: "오늘 한도", busy: "서버 붐빔", minute: "잠깐 한도" };

// 모델 목록 (없으면 한 번 받아 둔다)
async function knownModels(apiKey) {
  let { models } = loadSettings();
  if (!models.length) {
    try {
      models = await listModels(apiKey);
      saveSettings({ models });
    } catch {
      return [];
    }
  }
  return models;
}

function limits() {
  try {
    return JSON.parse(localStorage.getItem(LIMITS_KEY) || "{}");
  } catch {
    return {};
  }
}

// 지금 막혀 있으면 { until, reason }, 아니면 null (예전 형식은 숫자만 저장돼 있었다 → 오늘 한도로 본다)
export function limitOf(model) {
  const raw = limits()[model];
  const mark = typeof raw === "number" ? { until: raw, reason: "day" } : raw;
  return mark && mark.until > Date.now() ? mark : null;
}

export function isLimited(model) {
  return !!limitOf(model);
}

// 막힌 모델을 기억하고 이유를 돌려준다
function markLimited(model, err) {
  let reason = "minute";
  let until = Date.now() + Math.max(err.quota?.retryMs || 0, 60_000);
  if (err.timeout || err.status >= 500) {
    reason = "busy"; // 서버가 붐비거나 답이 없음: 1분 뒤 다시 위 모델부터
    until = Date.now() + 60_000;
  } else if (err.status === 404 || err.quota?.unavailable || err.quota?.perDay) {
    reason = "day";
    until = nextQuotaReset();
  }
  try {
    localStorage.setItem(LIMITS_KEY, JSON.stringify({ ...limits(), [model]: { until, reason } }));
  } catch {}
  return reason;
}

// Google 무료 한도는 미국 태평양 시간 자정에 다시 채워진다
function nextQuotaReset() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23"
  }).formatToParts(new Date()).map((p) => [p.type, Number(p.value)]));
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  return Date.now() + 24 * 3600 * 1000 - elapsed;
}
