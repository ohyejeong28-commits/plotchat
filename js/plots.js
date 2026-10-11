// 플롯 저장. 제타처럼 플롯 하나에 기본 설정(세계관) + 캐릭터 여러 명 + 스타일 + 설정집 + 인트로 + 소개가 들어간다.
//   title, world, characters[{name, image, desc}], examples, lore[{keys, content}], style{...},
//   intro, description(짧은 소개), cover(커버 이미지), tags[]
//   name, image: 첫 번째 캐릭터의 이름/이미지 (목록과 채팅에 보여 주는 대표값)
import { put, get, getAll, del } from "./db.js";
import { deleteChatsOfPlot } from "./chats.js";
import { markDirty } from "./sync.js";

export const LIMITS = { title: 20, name: 10, prompt: 2400, examples: 2000, intro: 1500, description: 40, tags: 10, characters: 10, lore: 20 };

// 처음 실행할 때 한 번만 넣어 주는 예시 플롯. 지우면 다시 생기지 않는다.
const SAMPLE_PLOT = {
  id: "sample-bookshop",
  title: "비 오는 날의 헌책방",
  world: "비 오는 저녁, 골목 끝의 작은 헌책방 '책갈피'. 문 닫기 직전에 {{user}}가 비를 피해 들어온다.",
  characters: [{
    name: "윤서하",
    image: "",
    desc: `나이: 27세
직업: 헌책방 '책갈피'의 주인
외모: 어깨까지 오는 검은 머리를 대충 묶고, 소매가 긴 회색 니트에 동그란 안경을 쓴다.
성격: 말수가 적고 무뚝뚝해 보이지만 속은 다정하다. 낯을 가리지만 책 이야기가 나오면 말이 많아진다. 칭찬을 들으면 당황해서 괜히 딴소리를 한다.
말투: 처음 보는 손님에게는 짧은 존댓말을 쓰다가, 친해지면 반말이 섞인다.
좋아하는 것: 오래된 문고본, 비 오는 날, 따뜻한 보리차
싫어하는 것: 책을 함부로 접는 사람, 시끄러운 손님
배경: 할아버지에게 물려받은 서점을 혼자 운영한다. 장사는 잘 안 되지만 문을 닫을 생각은 없다.`
  }],
  intro: `*비가 쏟아지는 저녁, 골목 끝 헌책방의 종이 딸랑 울린다. 계산대 뒤에서 책을 읽던 서하가 안경 너머로 고개를 든다.*

"...곧 문 닫는데요."

*그렇게 말하면서도 서하는 젖은 당신의 어깨를 힐끗 보더니, 계산대 아래에서 수건을 하나 꺼내 툭 내민다.*

"닦고 보세요. 책 젖으면 곤란하니까."`,
  description: "무뚝뚝하지만 속은 다정한 헌책방 주인",
  tags: ["일상", "힐링", "비오는날"],
  cover: "",
  examples: "",
  lore: [],
  style: {}
};
const SEEDED = "plotchat.seeded";

export async function listPlots() {
  await seedSample();
  return (await getAll("plots")).map(normalizePlot).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPlot(id) {
  const plot = await get("plots", id);
  return plot ? normalizePlot(plot) : null;
}

export async function savePlot(plot) {
  const now = Date.now();
  if (!plot.id) {
    plot.id = crypto.randomUUID();
    plot.createdAt = now;
  }
  plot.updatedAt = now;
  plot.name = plot.characters[0]?.name || "";
  plot.image = plot.characters[0]?.image || "";
  await put("plots", plot);
  markDirty(); // PC: 폰으로 보낼 파일을 새로 써 둔다
  return plot;
}

export async function deletePlot(id) {
  await deleteChatsOfPlot(id);
  await del("plots", id);
  markDirty();
}

// 예전 구조(캐릭터 한 명: name/image/prompt)로 저장된 플롯도 새 구조로 읽는다
export function normalizePlot(plot) {
  const p = { ...plot };
  if (!Array.isArray(p.characters) || !p.characters.length) {
    p.characters = [{ name: p.name || "", image: p.image || "", desc: p.prompt || "" }];
  }
  p.world ??= "";
  p.examples ??= "";
  p.intro ??= "";
  p.description ??= "";
  p.cover ??= "";
  p.tags ??= [];
  p.lore ??= [];
  p.style ??= {};
  p.name = p.characters[0].name;
  p.image = p.characters[0].image;
  return p;
}

// 프롬프트 탭 글자 수 (제타처럼 제목 + 설명 + 캐릭터 이름/설명을 합쳐 센다)
export function promptLength(plot) {
  return (plot.title || "").length + (plot.world || "").length
    + plot.characters.reduce((n, c) => n + (c.name || "").length + (c.desc || "").length, 0);
}

async function seedSample() {
  try {
    if (localStorage.getItem(SEEDED)) return;
  } catch {
    return;
  }
  if (!(await get("plots", SAMPLE_PLOT.id))) {
    const now = Date.now();
    await put("plots", normalizePlot({ ...SAMPLE_PLOT, createdAt: now, updatedAt: now }));
  }
  try {
    localStorage.setItem(SEEDED, "1");
  } catch {}
}
