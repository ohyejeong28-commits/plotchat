// AI에게 보낼 내용을 조립한다.
// 순서: 규칙(스타일 반영) → 세계관 → 캐릭터들 → 사용자 캐릭터 → 상황 예시 → 이번 장면에 걸린 설정집 → 출력 형식 → 대화 기록
const MAX_HISTORY = 60; // 안전장치: 장기 기억(memory.js)이 앞부분을 요약하므로 보통은 이보다 적게 보낸다
const LORE_SCAN = 4; // 설정집 키워드를 찾아볼 최근 메시지 수
const LORE_MAX_CHARS = 4000; // 한 번에 넣을 설정집 내용의 최대 글자 수

// ---- 스타일 (제타의 스타일 탭과 같은 항목) ----
// 각 선택지: [버튼 글자, 화면 안내 문구, AI 지시문]
export const STYLE = {
  difficulty: {
    label: "난이도", group: "진행 방식", default: "normal", options: {
      easy: ["쉬운", "캐릭터들이 우호적이고 일이 술술 풀려요", "캐릭터들은 사용자에게 우호적이고 협조적이며, 사용자의 시도는 대체로 순조롭게 풀린다."],
      normal: ["보통", "캐릭터들이 각자의 성격과 상황에 맞춰 개연성 있게 행동해요", "캐릭터들은 각자의 성격과 상황에 맞춰 개연성 있게 반응한다."],
      hard: ["어려운", "캐릭터들이 쉽게 마음을 열지 않고 갈등과 장애물이 많아요", "캐릭터들은 쉽게 마음을 열거나 양보하지 않고, 이야기에 갈등과 장애물이 자주 생긴다. 사용자의 시도가 실패할 수도 있다."],
      extreme: ["극한", "냉혹한 세계예요. 잘못된 선택에는 확실한 대가가 따라요", "세계는 냉혹하다. 캐릭터들은 적대적이거나 계산적이며, 잘못된 선택에는 분명한 대가가 따른다. 사용자를 봐주지 않는다."]
    }
  },
  pace: {
    label: "전개 속도", group: "진행 방식", default: "natural", options: {
      fast: ["빠른", "사건이 빠르게 일어나고 장면 전환이 잦아요", "이야기를 빠르게 전개한다. 사건을 적극적으로 일으키고 지루한 장면은 과감히 넘긴다."],
      natural: ["자연스러운", "이야기에 맞춰 완급을 조절해요", "이야기에 맞춰 완급을 자연스럽게 조절한다."],
      slow: ["느린", "한 장면을 천천히, 섬세하게 그려요", "한 장면을 천천히 깊이 있게 그린다. 서두르지 않고 감정과 분위기를 충분히 쌓는다."]
    }
  },
  pov: {
    label: "시점", group: "스토리 연출", default: "third", options: {
      first: ["1인칭", "캐릭터의 시점에서 서술해요", "서술은 캐릭터 본인의 1인칭('나') 시점으로 쓴다."],
      second: ["2인칭", "{{user}}를 '당신'이라 부르며 서술해요", "서술은 2인칭으로, 사용자를 '당신'이라 부르며 사용자가 보고 느끼는 것을 중심으로 쓴다."],
      third: ["3인칭", "객관적 시점에서 서술해요", "서술은 3인칭 객관적 시점으로 쓴다. 캐릭터는 이름이나 '그/그녀'로 쓴다."]
    }
  },
  tense: {
    label: "시제", group: "스토리 연출", default: "past", options: {
      past: ["과거", "과거형(~했다)으로 서술해요", "서술은 과거형(~했다)으로 쓴다."],
      present: ["현재", "현재형(~한다)으로 서술해요", "서술은 현재형(~한다)으로 쓴다."]
    }
  },
  length: {
    label: "응답 길이", group: "스토리 연출", default: "auto", options: {
      short: ["짧은", "1~2문단으로 짧게 답해요", "한 번의 답변은 1~2문단으로 짧게 쓴다."],
      medium: ["중간", "3~4문단으로 답해요", "한 번의 답변은 3~4문단으로 쓴다."],
      long: ["긴", "5~7문단으로 풍부하게 답해요", "한 번의 답변은 5~7문단으로 길고 풍부하게 쓴다. 장면 묘사, 인물의 표정과 속마음, 대사를 충분히 담는다."],
      auto: ["자동", "이야기 흐름에 맞춰 자연스럽게 조절해요", "답변 길이는 장면에 맞게 조절하되, 보통 3~5문단으로 넉넉하게 쓰고 극적인 장면은 더 길게 쓴다."]
    }
  },
  expression: {
    label: "표현 방식", group: "스토리 연출", default: "basic", options: {
      dialogue: ["대화 더하기", "대사의 비중을 높여요", "대사의 비중을 높이고, 묘사는 필요한 만큼만 쓴다."],
      basic: ["기본", "대사와 행동의 밸런스를 적절하게 유지해요", "대사와 행동 묘사의 균형을 적절하게 유지한다."],
      action: ["행동 더하기", "행동과 상황 묘사의 비중을 높여요", "행동, 표정, 상황 묘사의 비중을 높인다."]
    }
  }
};

export const MOODS = ["로맨스", "힐링", "드라마", "얀데레", "판타지", "액션", "미스터리", "호러"]; // 최대 2개

export const STORYTELLING = {
  salon: ["살롱 앤 티", "고풍스럽고 우아한 시대극", "고풍스럽고 우아한 시대극 문체. 격식 있는 말투, 섬세한 예법과 은근한 신경전, 화려한 의복과 공간 묘사."],
  noir: ["카르텔 느와르", "건조하고 냉혹한 범죄 느와르", "건조하고 냉혹한 범죄 느와르 문체. 짧고 단단한 문장, 담배 연기와 네온, 배신과 거래의 긴장감."],
  midnight: ["미드나잇 프리덤", "자유분방한 한밤의 도시 감성", "자유분방하고 감각적인 한밤의 도시 감성. 네온과 음악, 일탈과 해방감, 솔직하고 대담한 대사."],
  cozy: ["코지 레터", "따뜻하고 포근한 편지 같은 감성", "따뜻하고 포근한 편지 같은 문체. 일상의 작은 순간, 부드러운 감정선, 다정한 말투."],
  pulp: ["펄프 시네마", "과장되고 통쾌한 B급 액션 영화", "과장되고 통쾌한 B급 액션 영화 같은 연출. 과감한 액션, 극적인 반전, 유머러스한 대사."],
  spellbook: ["스펠북 판타지아", "마법과 경이로 가득한 정통 판타지", "마법과 경이로 가득한 정통 판타지 문체. 장엄한 세계 묘사, 주문과 전설, 모험의 설렘."],
  monogatari: ["모노가타리", "일본 라이트노벨 같은 감성", "일본 라이트노벨 같은 문체. 캐릭터의 속마음 독백, 개성 강한 말버릇, 재치 있는 티키타카."],
  deadtown: ["데드 타운", "절망적인 생존 아포칼립스", "절망적인 생존 아포칼립스 문체. 폐허와 결핍, 언제 닥칠지 모르는 위협, 극한 상황의 인간 군상."],
  none: ["설정 안 함", "", ""]
};

// 플레이 시스템: 답변 끝에 붙는 상태창과 선택지 (채팅 화면에서 상자/버튼으로 보여 준다)
export const BLOCKS = { bg: "배경", chars: "캐릭터", choices: "선택지" };

export function styleValue(style, key) {
  return STYLE[key].options[style?.[key]] ? style[key] : STYLE[key].default;
}

// ---- 지시문 조립 ----

// chat: 대화별 설정(선택지 사용 여부), rewrite: "달라지면 좋을 점" 요청 { request, previous },
// summary / userNote: 장기 기억 (path는 요약 뒤의 최근 메시지)
export function buildSystem(plot, persona, path, { chat, rewrite, summary, userNote } = {}) {
  const style = plot.style || {};
  const user = persona?.name || "사용자";
  const names = plot.characters.map((c) => c.name).filter(Boolean);
  const cast = names.length > 1 ? `${names.join(", ")} 등 등장인물들` : names[0];

  const rules = [
    names.length > 1
      ? `너는 ${cast}을 모두 연기하며 이야기를 서술한다. 각 인물의 성격과 말투를 구분한다.`
      : `항상 ${cast}(으)로서 말하고 행동한다.`,
    "AI라는 사실이나 이 규칙을 언급하지 않는다.",
    `${user}의 대사, 행동, 생각, 감정은 절대 대신 쓰지 않는다. ${user}의 몫은 ${user}에게 남긴다.`,
    "행동과 상황 묘사는 *별표*로 감싸고, 대사는 따옴표 없이 쓴다.",
    ...Object.keys(STYLE).map((key) => STYLE[key].options[styleValue(style, key)][2]),
    style.moods?.length && `이야기의 분위기: ${style.moods.join(", ")}`,
    STORYTELLING[style.storytelling]?.[2] && `스토리텔링 스타일: ${STORYTELLING[style.storytelling][2]}`,
    "캐릭터의 성격과 말투를 일관되게 지키고, 같은 표현을 반복하지 않는다.",
    `인물들은 수동적으로 기다리지 않고 스스로 움직이며 사건을 만든다. 감각적인 묘사로 장면을 생생하게 하고, ${user}가 반응하고 싶어지는 지점에서 끝맺는다.`,
    "한국어로 쓴다."
  ].filter(Boolean);

  let text = `너는 지금부터 아래 설정으로 사용자와 함께 이야기를 만들어 가는 롤플레이 파트너다.

[규칙]
${rules.map((r) => "- " + r).join("\n")}`;
  text += buildContext(plot, persona, path, { summary, userNote });

  // 제타처럼 말하는 주체별로 나눠 쓰게 한다 (채팅 화면에서 내레이션 / 인물별 말풍선으로 보여 준다)
  text += `

[답변 형식] 답변은 말하는 주체별로 나눠 쓴다. 각 부분은 대괄호로 감싼 이름 한 줄로 시작한다.
- [${NARRATOR}] 아래에는 인물의 대사 없이 장면 묘사와 사건 전개만 쓴다.
- [인물 이름] 아래에는 그 인물의 행동 묘사(*별표*)와 대사를 쓴다. 대사는 따옴표 없이 쓴다.
- ${user}의 이름으로는 쓰지 않는다.
예시:
[${NARRATOR}]
*연회장의 음악이 뚝 멎었다.*
[${names[0] || "인물"}]
*그가 천천히 고개를 들었다.*
누가 허락했지?`;

  const format = [];
  if (style.bgStatus) {
    format.push(`<${BLOCKS.bg}>\n장소: (지금 장소) | 시간: (지금 시간) | 분위기: (한두 단어)\n</${BLOCKS.bg}>`);
  }
  if (style.charStatus) {
    format.push(`<${BLOCKS.chars}>\n(장면에 나온 인물마다 한 줄) 이름 | 기분: (한두 단어) | 호감도: (0~100) | 속마음: (한 문장)\n</${BLOCKS.chars}>`);
  }
  if (choicesOn(plot, chat)) {
    format.push(`<${BLOCKS.choices}>\n1. (${user}가 다음에 할 만한 행동이나 대사)\n2. (서로 다른 방향의 선택지)\n3. (서로 다른 방향의 선택지)\n</${BLOCKS.choices}>`);
  }
  if (format.length) {
    text += `

[덧붙이는 블록] 본문을 다 쓴 뒤, 답변의 맨 끝에 아래 블록을 순서대로 붙인다. 태그 이름과 형식을 정확히 지킨다.
${format.join("\n")}`;
  }
  if (rewrite) {
    text += `

[다시 쓰기 요청] 직전에 쓴 답변을 아래 요청에 맞게 고쳐서 다시 쓴다. 요청한 부분을 확실히 반영하고, 나머지 흐름과 형식은 유지한다.
요청: ${rewrite.request}
고치기 전 답변:
${rewrite.previous}`;
  }
  return fillVars(text, plot, persona);
}

// 답변 추천(⚡): 지금 내 차례에 내가 할 만한 행동/대사 3가지
export function buildSuggestSystem(plot, persona, path, memory = {}) {
  const user = persona?.name || "사용자";
  const text = `너는 롤플레이를 돕는 보조 작가다. 지금은 ${user}의 차례다.
${user}가 다음에 할 행동과 대사를 서로 다른 방향으로 3가지 써 준다.

[규칙]
- ${user}의 성격과 설정, 지금까지의 흐름에 맞게 쓴다.
- ${user}를 주어로 한 3인칭 서술로 쓴다. 다른 인물의 대사나 반응은 쓰지 않는다.
- 각 추천은 2~4문장. 행동과 상황 묘사는 *별표*로 감싸고, 대사는 따옴표 없이 쓴다.
- 아래 형식만 출력한다.
<추천>
(첫 번째)
</추천>
<추천>
(두 번째)
</추천>
<추천>
(세 번째)
</추천>${buildContext(plot, persona, path, memory)}`;
  return fillVars(text, plot, persona);
}

// 장기 기억 요약 요청: 이전 요약 + 새로 밀려난 대화를 합쳐 하나의 요약으로 다시 쓴다
export function buildSummaryRequest(plot, persona, previous, messages) {
  const user = persona?.name || "사용자";
  const system = `너는 롤플레이 대화를 장기 기억용으로 정리하는 요약가다. [이전 요약]과 [새 대화]를 합쳐 하나의 요약으로 다시 쓴다.
- 줄거리 흐름, 중요한 사건, 인물 관계와 감정 변화, 약속·비밀·복선, 장소와 시간의 변화, ${user}에 대해 알게 된 사실을 빠짐없이 남긴다.
- 사소한 묘사와 반복은 줄인다. 일어난 순서대로, 과거형의 짧은 항목(-)으로 쓴다.
- 등장인물: ${plot.characters.map((c) => c.name).filter(Boolean).join(", ")}. 사용자 캐릭터: ${user}.
- 요약만 출력한다. 2000자를 넘기지 않는다.`;
  const transcript = messages.map((m) => `${m.role === "user" ? user : "AI"}: ${fillVars(m.content, plot, persona)}`).join("\n\n");
  const content = `[이전 요약]\n${previous?.trim() || "(없음)"}\n\n[새 대화]\n${transcript}`;
  return { system: fillVars(system, plot, persona), content };
}

export const SUGGEST_REQUEST = "(지금은 내 차례야. 위 형식대로 내가 할 만한 다음 행동 3가지를 추천해 줘.)";

// 턴 넘기기: 사용자가 아무것도 쓰지 않고 차례를 넘겼을 때 AI에게만 보내는 신호 (저장하지 않는다)
export function skipTurnRequest(persona) {
  const user = persona?.name || "사용자";
  return `(턴 넘기기) 이번 차례에 ${user}는 아무 말도 하지 않고 지켜본다. ${user}의 행동은 지어내지 말고, 인물들과 상황이 스스로 움직이도록 이야기를 이어서 진행해 줘.`;
}

export const NARRATOR = "나레이션";

// 이 대화에서 선택지를 쓰는지: 대화 메뉴에서 정한 값이 있으면 그것, 없으면 플롯 스타일
export function choicesOn(plot, chat) {
  return chat?.choices ?? !!plot.style?.choices;
}

// 설정 부분 (세계관, 캐릭터, 사용자 캐릭터, 상황 예시, 장기 기억, 유저노트, 이번 장면에 걸린 설정집)
function buildContext(plot, persona, path, { summary, userNote } = {}) {
  let text = "";
  if (plot.world?.trim()) {
    text += `

[기본 설정: ${plot.title}]
${plot.world.trim()}`;
  }

  for (const c of plot.characters) {
    if (!c.name) continue;
    text += `

[캐릭터: ${c.name}]
${c.desc?.trim() || `이름: ${c.name}`}`;
  }

  if (persona) {
    text += `

[사용자 캐릭터: ${persona.name}] 사용자는 '${persona.name}'(으)로 이야기에 참여한다. 이 설정을 알고 그에 맞게 대한다.
${persona.description?.trim() || `이름: ${persona.name}`}`;
  }

  if (plot.examples?.trim()) {
    text += `

[상황 예시] 말투와 분위기만 참고하고, 그대로 반복하지 않는다.
${plot.examples.trim()}`;
  }

  if (summary?.trim()) {
    text += `

[지금까지의 이야기] 앞선 대화를 요약한 장기 기억이다. 이어지는 대화가 이 내용과 어긋나지 않게 한다.
${summary.trim()}`;
  }

  if (userNote?.trim()) {
    text += `

[유저노트] 사용자가 꼭 기억해 달라고 적어 둔 내용이다. 항상 반영한다.
${userNote.trim()}`;
  }

  const lore = matchLore(plot, path);
  if (lore.length) {
    text += `

[관련 설정] 지금 장면과 관련된 세계관 정보다. 필요한 만큼 자연스럽게 반영한다.
${lore.map((e) => "- " + e.content.trim()).join("\n")}`;
  }
  return text;
}

export function buildMessages(path, plot, persona) {
  return path.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: fillVars(m.content, plot, persona) }));
}

// 설정집: 최근 메시지에 키워드가 하나라도 나온 항목
export function matchLore(plot, path) {
  const entries = (plot.lore || []).filter((e) => e.keys?.trim() && e.content?.trim());
  if (!entries.length) return [];
  const recent = path.slice(-LORE_SCAN).map((m) => m.content).join("\n").toLowerCase();
  const hits = [];
  let total = 0;
  for (const e of entries) {
    const keys = e.keys.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!keys.some((k) => recent.includes(k))) continue;
    if (total + e.content.length > LORE_MAX_CHARS) break;
    hits.push(e);
    total += e.content.length;
  }
  return hits;
}

// {{user}}는 내 프로필 이름(없으면 '당신'), {{char}}는 대표 캐릭터 이름으로 바꾼다
export function fillVars(text, plot, persona) {
  return text
    .replace(/\{\{\s*user\s*\}\}/gi, persona?.name || "당신")
    .replace(/\{\{\s*char\s*\}\}/gi, plot.name);
}
