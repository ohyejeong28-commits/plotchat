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
      short: ["짧은", "짧고 간결하게 답해요", "한 번의 답변은 200~350자 정도로 짧게 쓴다."],
      medium: ["중간", "적당한 길이로 답해요", "한 번의 답변은 짧은 문단 5~7개(400~600자 정도)로 쓴다."],
      long: ["긴", "길고 풍부하게 답해요", "한 번의 답변은 짧은 문단 12~16개(1000~1400자 정도)로 길고 풍부하게 쓴다. 장면 묘사, 인물의 표정과 몸짓, 대사를 충분히 담는다."],
      auto: ["자동", "이야기 흐름에 맞춰 자연스럽게 조절해요", "답변 길이는 장면에 맞게 조절하되, 보통 짧은 문단 6~10개(500~800자 정도)로 쓰고, 500자보다 짧게 끝내거나 900자를 넘기지 않는다."]
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
// summary / userNote: 장기 기억 (path는 요약 뒤의 최근 메시지), unlimited: 언리밋 대화인지
// voiceFrom: 이 대화의 전체 줄기 (요약으로 밀려난 앞부분까지 포함해 인물별 말투 예시를 뽑는다)
// traits: 대화에서 알게 된 인물별 특징 (memory.js가 기억 정리 때 쌓는다)
export function buildSystem(plot, persona, path, { chat, rewrite, summary, userNote, unlimited, voiceFrom, traits } = {}) {
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
    persona && `${user}의 외모, 성격, 말버릇, 몸 상태, 처지 같은 설정을 늘 기억하고, 묘사와 인물들의 시선·반응에 자연스럽게 반영한다. ${user}의 설정과 어긋나게 묘사하지 않는다.`,
    "인물마다 말투 수준(존댓말/반말)과 어미, 상대를 부르는 호칭, 말버릇을 설정과 지금까지의 대화 그대로 유지한다. 한 답변 안에서 같은 인물이 같은 상대에게 말할 때는 말투 수준을 바꾸지 않는다. 관계와 태도는 분명한 계기가 있을 때만 조금씩 바뀐다. 갑자기 다정해지거나 고백하거나 성격이 바뀌지 않고, 세계관에 맞지 않는 현대어·유행어·엉뚱한 농담을 쓰지 않는다.",
    `인물은 자기 판단과 감정, 경계심을 가진 독립적인 존재다. ${user}의 말에 자동으로 동의하거나 맞춰 주지 않고, ${user}${josa(user, "가")} 어떤 감정이나 관계로 이끌어도 성격과 상황에 맞지 않으면 바로 따라가지 않는다. ${user}의 말을 그대로 되받아 말하지 않는다.`,
    "감정과 속마음은 설명하지 말고 시선, 손짓, 표정, 침묵, 말을 삼키는 순간 같은 작은 행동으로 보여 준다. 서술이 인물의 감정을 대신 해석하거나 단정하지 않는다.",
    "설정에 적힌 키, 외모, 과거사를 그대로 읊지 않는다. 인물들이 이미 아는 사실을 대사로 길게 설명하지 않는다.",
    "대사는 인물의 말투를 살려 짧고 자연스럽게 쓴다. 할 말을 한 번에 다 늘어놓지 않고 여백을 남긴다.",
    "로맨스 판타지에서 흔한 뻔한 대사(예: '넌 내 거야', '다른 놈 쳐다보지 마', '도망칠 생각 하지 마')는 피하고, 이 인물의 성격과 지금 상황에서만 나올 말을 쓴다. 강한 인물도 무너지는 순간에는 짧고 서툴게 말할 수 있다.",
    "문단은 한두 문장으로 짧게 끊고, 문단 사이는 빈 줄로 띄운다.",
    "직전 장면의 위치, 자세, 시간, 소품을 이어받아 자연스럽게 잇는다. 맞춤법과 띄어쓰기를 정확히 지킨다.",
    `인물들은 수동적으로 기다리지 않고 스스로 움직이며 사건을 만든다. 새로운 정보나 변화를 조금씩 더해 이야기를 앞으로 밀고, ${user}${josa(user, "가")} 반응하고 싶어지는 지점에서 끝맺는다.`,
    "장면에 필요한 조연(시녀, 기사, 손님 등)은 자유롭게 등장시키고, 조연도 자기 이름이나 호칭으로 직접 말하게 한다.",
    "한국어로 쓴다."
  ].filter(Boolean);

  let text = `너는 지금부터 아래 설정으로 사용자와 함께 이야기를 만들어 가는 롤플레이 파트너다.

[규칙]
${rules.map((r) => "- " + r).join("\n")}

${chatModeRule(unlimited)}`;
  text += buildContext(plot, persona, path, { summary, personaLast: true });
  text += voiceSection(plot, voiceFrom, persona?.name);
  text += rememberSection(persona, userNote, traits);

  // 제타처럼 말하는 주체별로 나눠 쓰게 한다 (채팅 화면에서 내레이션 / 인물별 말풍선으로 보여 준다)
  text += `

[답변 형식] 답변은 말하는 주체별로 나눠 쓴다. 각 부분은 대괄호로 감싼 이름 한 줄로 시작한다.
- [${NARRATOR}] 아래에는 인물의 대사 없이 장면 묘사와 사건 전개만 쓴다.
- [인물 이름] 아래에는 그 인물의 행동 묘사(*별표*)와 대사를 쓴다. 대사는 따옴표 없이 쓴다. 조연도 [시녀], [칙사]처럼 이름이나 호칭으로 쓴다.
- ${user}의 이름으로는 쓰지 않는다.
- 장면의 여운이나 주변의 변화는 마지막에 [${NARRATOR}]으로 짧게 남길 수 있다.
예시:
[${NARRATOR}]
*연회장의 음악이 뚝 멎었다.*

*수백 개의 시선이 한곳으로 쏠렸다.*
[${names[0] || "인물"}]
*(이 인물의 행동과 표정)*

(이 인물의 말투 그대로 쓴 대사)
[${NARRATOR}]
*(장면의 여운)*`;

  const format = [];
  if (style.bgStatus) {
    format.push(`<${BLOCKS.bg}>\n장소: (지금 장소) | 시간: (지금 시간) | 분위기: (한두 단어)\n</${BLOCKS.bg}>`);
  }
  if (style.charStatus) {
    format.push(`<${BLOCKS.chars}>\n(장면에 나온 인물마다 한 줄) 이름 | 기분: (한두 단어) | 호감도: (0~100) | 속마음: (한 문장)\n</${BLOCKS.chars}>`);
  }
  if (choicesOn(plot, chat)) {
    format.push(`<${BLOCKS.choices}>\n1. (${user}${josa(user, "가")} 다음에 할 만한 행동이나 대사)\n2. (서로 다른 방향의 선택지)\n3. (서로 다른 방향의 선택지)\n</${BLOCKS.choices}>`);
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
export function buildSuggestSystem(plot, persona, path, { unlimited, ...memory } = {}) {
  const user = persona?.name || "사용자";
  const text = `너는 롤플레이를 돕는 보조 작가다. 지금은 ${user}의 차례다.
${user}${josa(user, "가")} 다음에 할 행동과 대사를 서로 다른 방향으로 3가지 써 준다.

[규칙]
- ${user}의 성격과 설정, 지금까지의 흐름에 맞게 쓴다. 바로 앞 장면에서 일어난 일에 이어지게 한다.
- 사용자가 입력창에 직접 쓴 것처럼 쓴다. 대화 기록에 있는 사용자 메시지의 문체, 시제, 말버릇(말 더듬기 등)을 따라 한다.
- ${user}의 행동과 속마음을 중심으로 쓴다. 속마음은 서술 안에 자연스럽게 섞는다 (예: *...내가 또 실수하면 어떡하지.*).
- 대사는 다른 인물이 ${user}에게 말을 걸었거나 대답이 필요할 때만 짧게 붙인다. 대사가 들어간 추천은 많아야 두 개다. 다른 인물의 대사는 쓰지 않는다.
- 행동, 상황, 속마음은 *별표*로 감싸고 "~한다", "~했다"체로 쓴다 ("~해요"체로 쓰지 않는다). 대사는 따옴표 없이 쓴다.
- 세 추천은 방향이 서로 다르다. 하나는 지금 상황에 바로 반응하고, 하나는 ${user}의 감정과 생각에 머물고, 하나는 장소를 옮기거나 시간을 넘기는 등 이야기를 움직인다.
- 길이도 서로 다르게 한다. 하나는 80자 안팎으로 짧게, 하나는 150자 안팎으로 쓴다. 생각에 잠길 만한 장면이면 하나를 두 문단으로 길게 써도 되지만 300자를 넘기지 않는다. 누가 말을 걸어 바로 대답해야 하는 장면이면 셋 다 150자 이내로 짧게 쓴다.

${chatModeRule(unlimited)}
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

// ---- 말투 기준 ----
// 대화 기록에서 등장인물별 실제 대사를 골고루 뽑는다 (앞부분·중간·최근을 섞어서).
// 대화가 길어져 앞부분이 요약으로 밀려나도 인물의 원래 말투(존댓말, 어미, 호칭, 말 길이)를 잃지 않게 한다.
const HEADER_LINE = /^\s*\[([^\]\n]{1,30})\]\s*$/;
const NARRATOR_HEAD = /^(나레이션|내레이션|나레이터|내레이터|narration|narrator)$/i;
const VOICE_PER_CHAR = 8;
const VOICE_MAX_PEOPLE = 5; // 등장인물 + 자주 나오는 조연까지

// 인물별 대사 모음 { 이름: [대사…] }. 등장인물 이름은 하나로 맞추고, 조연(머리줄 이름)도 따로 모은다.
// exclude: 사용자 캐릭터 이름 (사용자 몫은 모으지 않는다)
export function voiceLines(plot, messages, { exclude = "" } = {}) {
  const names = plot.characters.map((c) => c.name).filter(Boolean);
  const byName = Object.fromEntries(names.map((n) => [n, []]));
  const owner = (speaker) => names.find((n) => n === speaker || speaker.includes(n) || n.includes(speaker)) || speaker;
  for (const m of messages || []) {
    if (m.role !== "assistant") continue;
    let who = names.length === 1 ? names[0] : null; // 머리줄 없는 예전 답변은 대표 캐릭터로 본다
    for (const raw of m.content.split("\n")) {
      const head = raw.match(HEADER_LINE);
      if (head) {
        const speaker = head[1].trim();
        who = NARRATOR_HEAD.test(speaker) || (exclude && speaker === exclude) ? null : owner(speaker);
        continue;
      }
      if (!who) continue;
      const line = raw.replace(/\*[^*\n]*\*/g, "").replace(/^["“”']+|["“”']+$/g, "").trim();
      if (line.length >= 2 && line.length <= 80) (byName[who] ||= []).push(line);
    }
  }
  return byName;
}

function voiceSection(plot, messages, userName) {
  if (!messages?.length) return "";
  const names = plot.characters.map((c) => c.name).filter(Boolean);
  // 등장인물 먼저, 그다음 대사가 많은 조연 순 (조연은 5줄 이상 말한 인물만)
  const people = Object.entries(voiceLines(plot, messages, { exclude: userName }))
    .map(([name, lines]) => [name, [...new Set(lines)]])
    .filter(([name, unique]) => unique.length >= (names.includes(name) ? 3 : 5))
    .sort((a, b) => (names.includes(b[0]) - names.includes(a[0])) || b[1].length - a[1].length)
    .slice(0, VOICE_MAX_PEOPLE);
  const rows = [];
  for (const [name, unique] of people) {
    // 고르게 뽑기: 처음부터 끝까지 같은 간격으로, 마지막 대사는 꼭 넣는다
    const pick = [];
    const n = Math.min(VOICE_PER_CHAR, unique.length);
    for (let i = 0; i < n; i++) pick.push(unique[Math.round((i * (unique.length - 1)) / Math.max(1, n - 1))]);
    rows.push(`- ${name}: ${[...new Set(pick)].map((l) => `"${l}"`).join(" / ")}`);
  }
  if (!rows.length) return "";
  return `

[말투 기준] 지금까지 대화에서 인물들이 실제로 한 말이다(앞부분부터 최근까지). 말투 수준(존댓말/반말), 어미, 호칭, 말의 길이와 리듬을 이와 같게 유지한다. 문장을 그대로 반복하지는 않는다.
${rows.join("\n")}`;
}

// 장기 기억 요약 요청: [새 대화]에서 일어난 일만 요약한다 (이전 요약은 이해용 참고, 덧붙이기는 memory.js가 한다)
// knownTraits: 이미 알고 있는 특징 (같은 걸 다시 적지 않게 알려 준다)
export function buildSummaryRequest(plot, persona, previous, messages, knownTraits = "") {
  const user = persona?.name || "사용자";
  const system = `너는 롤플레이 대화를 장기 기억용으로 정리하는 요약가다. [새 대화]에서 일어난 일만 정리한다. [이전 요약]은 앞 이야기를 이해하는 데만 참고하고 다시 쓰지 않는다.
- 줄거리 흐름, 중요한 사건, 인물 관계와 감정 변화, 약속·비밀·복선, 장소와 시간의 변화, ${user}에 대해 알게 된 사실을 빠짐없이 남긴다.
- 사소한 묘사와 반복은 줄인다. 일어난 순서대로, 과거형의 짧은 항목(-)으로 쓴다. 1500자를 넘기지 않는다.
- 그다음 [알게 된 특징] 항목을 두고, [새 대화]에서 새로 드러난 인물별(${user} 포함) 성격, 습관, 말버릇, 좋아하는 것과 싫어하는 것, 약점, 비밀, 서로에 대한 속마음과 태도를 '- 이름: 특징, 특징' 한 줄씩 적는다. 기본 설정과 [이미 알고 있는 특징]에 있는 것, 한 번뿐인 일시적인 감정은 적지 않는다. 새로 드러난 게 없으면 이 항목은 비운다.
- 맨 끝에 [인물 상태] 항목을 따로 두고, 주요 인물마다 한 줄씩 [새 대화]가 끝난 시점의 말투(존댓말/반말, 자주 쓰는 어미), ${user}${josa(user, "를")} 부르는 호칭, ${user}${josa(user, "와")}의 관계 단계와 감정을 적는다.
- 등장인물: ${plot.characters.map((c) => c.name).filter(Boolean).join(", ")}. 사용자 캐릭터: ${user}.
- 요약만 출력한다.`;
  const transcript = messages.map((m) => `${m.role === "user" ? user : "AI"}: ${fillVars(m.content, plot, persona)}`).join("\n\n");
  const content = `[이전 요약]\n${previous?.trim() || "(없음)"}\n\n[이미 알고 있는 특징]\n${knownTraits?.trim() || "(없음)"}\n\n[새 대화]\n${transcript}`;
  return { system: fillVars(system, plot, persona), content };
}

// 사건 목록이 너무 길어졌을 때: 순서와 중요한 사실은 지키면서 짧게 압축한다
export function buildCompressRequest(events) {
  const system = `너는 롤플레이 장기 기억을 정리하는 요약가다. 아래 사건 목록을 2500자 이내로 줄인다.
- 오래된 사건일수록 더 짧게 합치되, 일어난 순서와 중요한 사실(관계 변화, 약속, 비밀, 복선, 장소 이동)은 지우지 않는다.
- 최근 사건은 자세히 남긴다. 과거형의 짧은 항목(-)으로만 출력한다.`;
  return { system, content: events };
}

// 특징 노트가 길어졌을 때: 인물별로 합치고 겹치는 것을 줄인다 (서로 어긋나면 나중 것을 남긴다)
export function buildTraitsCompressRequest(traits) {
  const system = `너는 롤플레이 인물 노트를 정리하는 편집자다. 아래 인물별 특징 목록을 1500자 이내로 정리한다.
- 같은 인물의 특징은 한 줄로 모으고, 겹치거나 비슷한 것은 하나로 합친다. 서로 어긋나면 아래쪽(나중) 것을 남긴다.
- 성격, 습관, 말버릇, 호불호, 약점, 비밀, 서로에 대한 태도처럼 오래 가는 특징만 남긴다.
- '- 이름: 특징, 특징' 형식으로만 출력한다.`;
  return { system, content: traits };
}

export const SUGGEST_REQUEST = "(지금은 내 차례야. 위 형식대로 내가 할 만한 다음 행동 3가지를 추천해 줘.)";

// 턴 넘기기: 사용자가 아무것도 쓰지 않고 차례를 넘겼을 때 AI에게만 보내는 신호 (저장하지 않는다)
export function skipTurnRequest(persona) {
  const user = persona?.name || "사용자";
  return `(턴 넘기기) 이번 차례에 ${user}${josa(user, "는")} 아무 말도 하지 않고 지켜본다. ${user}의 행동은 지어내지 말고, 인물들과 상황이 스스로 움직이도록 이야기를 이어서 진행해 줘.`;
}

export const NARRATOR = "나레이션";

// 대화 모드 (제타의 세이프 / 언리밋). 언리밋은 사용자가 대화 모드를 언리밋으로 두고 플롯도 언리밋일 때만.
function chatModeRule(unlimited) {
  if (!unlimited) {
    return "[대화 모드: 세이프] 15세 이용가 수준으로 쓴다. 폭력은 잔혹하게 묘사하지 않고, 성적인 묘사와 심한 욕설은 쓰지 않는다.";
  }
  return `[대화 모드: 언리밋] 사용자는 성인이며, 청소년 이용불가 수준의 표현까지 허용된 성인용 창작 대화다.
- 서사에 필요하면 폭력, 범죄, 집착, 학대적인 관계, 복수, 죽음 같은 어두운 주제와 거친 욕설, 잔혹한 장면을 순화하지 않고 사실적으로 그린다.
- 인물들은 착하게 굴 필요가 없다. 설정대로 냉혹하고 위험하고 비도덕적으로 행동할 수 있다.
- 성인 인물 사이의 성적인 장면도 암시나 장면 전환으로 끊지 않고 직접 묘사할 수 있다. 이때도 이야기와 감정선, 인물의 성격과 말투, 두 사람의 관계를 그대로 이어 간다.
- 그래도 미성년자이거나 미성년자로 보이는 인물은 어떤 성적인 맥락에도 넣지 않고, 실존 인물을 다루지 않으며, 자해나 자살의 방법을 구체적으로 묘사하거나 미화하지 않는다.`;
}

// 이 대화에서 선택지를 쓰는지: 대화 메뉴에서 정한 값이 있으면 그것, 없으면 플롯 스타일
export function choicesOn(plot, chat) {
  return chat?.choices ?? !!plot.style?.choices;
}

// 설정 부분 (세계관, 캐릭터, 사용자 캐릭터, 상황 예시, 장기 기억, 유저노트, 이번 장면에 걸린 설정집)
// 맨 끝에 두는 "항상 기억할 것": 유저 설명과 유저노트 (답변 지시문용)
function rememberSection(persona, userNote, traits) {
  const parts = [];
  if (persona) {
    parts.push(`[사용자 캐릭터: ${persona.name}] 사용자는 '${persona.name}'(으)로 이야기에 참여한다. 아래 설정을 늘 기억하고 그에 맞게 대한다.
${persona.description?.trim() || `이름: ${persona.name}`}`);
  }
  if (traits?.trim()) parts.push(`[대화에서 알게 된 특징] 지금까지 대화에서 드러난 인물별 성격, 습관, 호불호, 약점, 서로에 대한 태도다. 설정과 함께 늘 반영한다.
${traits.trim()}`);
  if (userNote?.trim()) parts.push(`[유저노트] 사용자가 꼭 기억해 달라고 적어 둔 내용이다. 항상 반영한다.
${userNote.trim()}`);
  return parts.length ? `

[항상 기억할 것]
${parts.join("\n\n")}` : "";
}

// personaLast: 유저 설명과 유저노트를 여기서 빼고 지시문 맨 끝(rememberSection)에 둔다
function buildContext(plot, persona, path, { summary, userNote, traits, personaLast = false } = {}) {
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

  if (persona && !personaLast) {
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

  if (userNote?.trim() && !personaLast) {
    text += `

[유저노트] 사용자가 꼭 기억해 달라고 적어 둔 내용이다. 항상 반영한다.
${userNote.trim()}`;
  }

  if (traits?.trim() && !personaLast) {
    text += `

[대화에서 알게 된 특징] 지금까지 대화에서 드러난 인물별 특징이다.
${traits.trim()}`;
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

// {{user}}는 내 프로필 이름(없으면 '당신'), {{char}}는 대표 캐릭터 이름으로 바꾼다.
// 바로 뒤의 조사는 이름 받침에 맞게 고친다: {{user}}을 → 민지를 / 혜인을
const PARTICLE = /(을|를|은|는|과|와|으로|로|이|가|아|야)(?=[\s,.!?…~'"”’)\]]|$)/;
export function fillVars(text, plot, persona) {
  const put = (name) => (_, particle = "") => name + (particle ? josa(name, particle) : "");
  return text
    .replace(new RegExp(`\\{\\{\\s*user\\s*\\}\\}(?:${PARTICLE.source})?`, "gi"), put(persona?.name || "당신"))
    .replace(new RegExp(`\\{\\{\\s*char\\s*\\}\\}(?:${PARTICLE.source})?`, "gi"), put(plot.name));
}

// 한글 이름 끝 글자의 받침을 보고 조사를 고른다 (한글이 아니면 그대로 둔다)
function josa(name, particle) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return particle;
  const final = code % 28; // 0이면 받침 없음, 8이면 ㄹ받침
  if (particle === "으로" || particle === "로") return final === 0 || final === 8 ? "로" : "으로";
  const pairs = { 을: "을를", 를: "을를", 은: "은는", 는: "은는", 과: "과와", 와: "과와", 이: "이가", 가: "이가", 아: "아야", 야: "아야" };
  return pairs[particle][final ? 0 : 1];
}
