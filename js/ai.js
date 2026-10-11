// AI 호출 + 한도 자동 전환.
// 고른 모델이 무료 한도에 걸리면(429) 무료로 되는 다른 모델로 자동으로 다시 보낸다.
// 한도가 찬 모델은 다시 채워질 때까지 기억해 두고 건너뛴다.
import { loadSettings, saveSettings } from "./settings.js";
import { streamChat, listModels } from "./llm.js";

// 바꿔 탈 모델 순서: 품질 좋은 Flash → 가벼운 Flash-Lite → Gemma
const FALLBACK_ORDER = [
  /gemini-3\.\d+-flash$/, /gemini-3-flash/, /gemini-flash-latest/,
  /gemini-3\.\d+-flash-lite$/, /flash-lite/, /gemma/
];
const LIMITS_KEY = "plotchat.limits"; // { 모델: 다시 쓸 수 있는 시각 }

const FIRST_CHUNK_TIMEOUT = 45_000; // 이 시간 안에 답이 시작되지 않으면 다른 모델로 넘어간다

// { system, messages, onText, signal } → { text, model, switchedFrom }
export async function ask({ system, messages, onText, signal }) {
  const { apiKey, model } = loadSettings();
  const candidates = [model, ...(await fallbackModels(apiKey, model))];
  let lastError = null;
  for (const candidate of candidates) {
    if (isLimited(candidate)) continue;
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
        signal: ctl.signal,
        onText: (chunk) => {
          started = true;
          clearTimeout(timer);
          onText?.(chunk);
        }
      });
      return { text, model: candidate, switchedFrom: candidate === model ? null : model };
    } catch (err) {
      if (signal?.aborted) throw err; // 사용자가 멈춤
      if (timedOut && !started) {
        markLimited(candidate, { timeout: true });
        lastError = new Error("모델이 너무 오래 답하지 않아요. 잠시 후 다시 해 주세요.");
        continue;
      }
      // 이미 답을 받기 시작했거나, 한도/없는 모델 문제가 아니면 바꿔 타지 않는다
      if (started || ![429, 404].includes(err.status)) throw err;
      markLimited(candidate, err);
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

// 모델 목록에서 바꿔 탈 후보를 순서대로 고른다 (목록이 없으면 한 번 받아 둔다)
async function fallbackModels(apiKey, current) {
  let { models } = loadSettings();
  if (!models.length) {
    try {
      models = await listModels(apiKey);
      saveSettings({ models });
    } catch {
      return [];
    }
  }
  const ids = models.map((m) => m.id).filter((id) => id !== current && !/pro|image|tts/i.test(id));
  const picked = [];
  for (const pattern of FALLBACK_ORDER) {
    for (const id of ids) if (pattern.test(id) && !picked.includes(id)) picked.push(id);
  }
  return picked;
}

function limits() {
  try {
    return JSON.parse(localStorage.getItem(LIMITS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function isLimited(model) {
  return (limits()[model] || 0) > Date.now();
}

function markLimited(model, err) {
  const until = err.timeout
    ? Date.now() + 10 * 60_000
    : err.status === 404 || err.quota?.unavailable || err.quota?.perDay
      ? nextQuotaReset()
      : Date.now() + Math.max(err.quota?.retryMs || 0, 60_000);
  try {
    localStorage.setItem(LIMITS_KEY, JSON.stringify({ ...limits(), [model]: until }));
  } catch {}
}

// Google 무료 한도는 미국 태평양 시간 자정에 다시 채워진다
function nextQuotaReset() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23"
  }).formatToParts(new Date()).map((p) => [p.type, Number(p.value)]));
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  return Date.now() + 24 * 3600 * 1000 - elapsed;
}
