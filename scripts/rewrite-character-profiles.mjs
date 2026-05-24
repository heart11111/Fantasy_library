import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src", "content", "characters");

const roleMap = {
  "arin.md": "NPC / 안내자",
  "demian.md": "주요 인물 / 파티 멤버",
  "lavinia.md": "주요 인물 / 파티 멤버",
  "merak-altemecia.md": "주요 인물 / 파티 멤버",
  "lunasha.md": "주요 인물 / 파티 멤버",
  "valerius-visconti.md": "주요 인물 / 파티 멤버",
  "arsian-eldayne.md": "주요 인물 / 파티 멤버",
  "lucky.md": "조연 / 군인",
  "drow-archer.md": "적대자 / 병력",
  "drow-warrior.md": "적대자 / 병력",
  "makina-dread-berserker.md": "적대자 / 마키나",
  "makina-dread-warrior.md": "적대자 / 마키나",
  "makina-dread-wildser.md": "적대자 / 마키나",
  "soldier.md": "NPC / 병사",
  "elite-soldier.md": "NPC / 병사",
  "knight.md": "NPC / 기사"
};

function parseFrontmatter(raw) {
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("frontmatter not found");
  return { yaml: m[1], body: m[2] };
}

function scalar(yaml, key, fallback = "") {
  const m = yaml.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!m) return fallback;
  return m[1].replace(/^["']|["']$/g, "").trim();
}

function list(yaml, key) {
  const block = yaml.match(new RegExp(`^${key}:\\n((?:  .+\\n?)+)`, "m"));
  if (!block) {
    const inline = yaml.match(new RegExp(`^${key}:\\s*\\[(.*?)\\]\\s*$`, "m"));
    if (!inline || !inline[1].trim()) return [];
    return inline[1].split(",").map((v) => v.replace(/^["'\s]+|["'\s]+$/g, "")).filter(Boolean);
  }
  return block[1].split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((v) => v && v !== "[]");
}

function yamlArray(values) {
  if (!values.length) return "[]";
  return `\n${values.map((value) => `  - "${value.replace(/"/g, '\\"')}"`).join("\n")}`;
}

function yamlString(value) {
  return `"${String(value ?? "").replace(/"/g, '\\"')}"`;
}

function stripGenerated(body) {
  return body
    .replace(/\n## 원문 발췌[\s\S]*$/m, "")
    .replace(/\n## 출처[\s\S]*$/m, "")
    .trim();
}

function section(body, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`(?:^|\\n)## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match ? match[1].trim() : "";
}

function line(text, max = 220) {
  const cleaned = text
    .split("\n")
    .filter((l) => !/^\s*\|/.test(l))
    .join(" ")
    .replace(/\|/g, " ")
    .replace(/\*\*/g, "")
    .replace(/>\s*/g, "")
    .replace(/^[-*]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function listLine(text, fallback) {
  const bullets = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  if (bullets.length) return bullets.slice(0, 3).join(" / ");
  return line(text) || fallback;
}

function kind(role) {
  if (role.includes("적대자")) return "hostile";
  if (role.includes("파티")) return "party";
  if (role.includes("안내자")) return "guide";
  if (role.includes("전투")) return "combat";
  return "support";
}

function infer(role, field, summary) {
  const k = kind(role);
  const base = {
    party: {
      impression: "처음에는 농담과 돌발 행동으로 가볍게 보이지만, 위기 앞에서는 자기 역할을 끝까지 수행하는 인물.",
      conflict: "자기 방식대로 움직이려는 욕구와 파티 안에서 맞춰야 하는 책임 사이의 충돌.",
      charm: "가벼운 대사와 진지한 선택이 동시에 나오는 입체감.",
      inner: "겉으로는 장난스럽거나 투덜대도, 속으로는 동료와 임무를 쉽게 저버리지 않는다.",
      fear: "아무것도 하지 못한 채 동료나 거점을 잃는 상황.",
      desire: "자신의 방식으로 인정받고, 낯선 세계에서도 쓸모 있는 사람으로 남는 것.",
      style: "상황에 즉각 반응하는 구어체. 감정이 올라오면 말이 짧아지고 표현이 직설적이 된다."
    },
    guide: {
      impression: "부드럽고 침착하게 장면을 여는 안내자. 세계관 정보를 플레이어가 받아들이기 쉽게 풀어준다.",
      conflict: "안내자로서 질서를 잡아야 하지만, 상대가 예측 불가능한 모험가들이라는 점에서 계속 휘말린다.",
      charm: "낯선 세계를 설명하는 친절함과 난처한 상황에서 드러나는 인간적인 반응.",
      inner: "책임감이 강하고, 자신이 맡은 사람들을 안전하게 다음 단계로 데려가려 한다.",
      fear: "안내 실패로 방문자들이 세계의 규칙을 오해하거나 위험에 빠지는 것.",
      desire: "방문자들이 새 세계에 무사히 적응하고 필요한 절차를 밟게 하는 것.",
      style: "상대가 이해할 수 있도록 차분히 설명하는 말투. 곤란할 때는 어색하게 웃거나 말을 고른다."
    },
    hostile: {
      impression: "대화보다 위협과 충돌로 존재감을 드러내는 적대 인물.",
      conflict: "개인의 내면보다 세력의 목적과 전장의 기능이 앞서는 타입.",
      charm: "장면에 즉각적인 긴장감을 부여하고 파티의 대응 방식을 드러내게 만든다.",
      inner: "개별 심리는 깊게 드러나지 않지만, 명령과 생존 본능에 따라 움직이는 병력으로 읽힌다.",
      fear: "패배와 포위, 지휘 체계의 붕괴.",
      desire: "목표 지점을 장악하거나 적을 제압하는 것.",
      style: "짧고 기능적인 전투형 표현. 말보다 행동으로 존재감이 드러난다."
    },
    combat: {
      impression: "전투와 경계 상황에서 먼저 눈에 띄는 실무형 인물.",
      conflict: "상부의 명령, 현장의 위험, 개인 생존 사이에서 움직인다.",
      charm: "화려하진 않지만 장면의 현실감과 긴박함을 떠받치는 존재감.",
      inner: "공포가 있어도 임무에서 완전히 이탈하지 않는 현장형 책임감.",
      fear: "전선 붕괴와 동료의 피해.",
      desire: "맡은 위치를 지키고 살아남는 것.",
      style: "간결하고 보고식인 말투. 위기 상황에서는 설명보다 즉답이 많다."
    },
    support: {
      impression: "주인공의 선택을 비추거나 장면의 분위기를 바꾸는 조연.",
      conflict: "자기 목적과 주변 인물의 사건에 휘말리는 흐름 사이에서 움직인다.",
      charm: "짧은 등장만으로도 장면의 결을 바꾸는 개성.",
      inner: "겉으로 드러나는 태도보다 자기만의 기준을 갖고 움직인다.",
      fear: "자기 자리가 사라지거나 사건의 흐름에 삼켜지는 것.",
      desire: "자기 역할을 인정받고, 관계 안에서 필요한 존재가 되는 것.",
      style: "장면 분위기에 맞춰 반응하는 대화체. 강한 캐릭터와 부딪힐 때 개성이 선명해진다."
    }
  }[k];
  return base[field] ?? summary;
}

function filled(value, role, field, name, summary) {
  void name;
  return line(value) || infer(role, field, summary);
}

function tableValue(table, label) {
  const row = table.split("\n").find((l) => l.includes(`| ${label} |`));
  if (!row) return "";
  const parts = row.split("|").map((p) => p.trim()).filter(Boolean);
  return parts[1] ?? "";
}

function roleFor(file, name, occupation) {
  if (roleMap[file]) return roleMap[file];
  if (/드로우|마키나|병사|기사|전사|궁수/i.test(`${file} ${name} ${occupation}`)) return "NPC / 전투 인물";
  return "조연 / NPC";
}

function reputationFor(role) {
  if (role.includes("적대자")) return "직접적인 평판보다 전장에서의 위협으로 기억된다.";
  if (role.includes("파티")) return "동료들과 부딪히고 농담을 주고받는 과정에서 성격이 또렷하게 드러나는 인물로 인식된다.";
  if (role.includes("안내자")) return "낯선 상황을 정리하고 절차를 안내하는 신뢰 가능한 인물로 읽힌다.";
  return "짧은 등장 안에서도 장면의 분위기와 관계 구도를 바꾸는 인물로 인식된다.";
}

function statusFor(value) {
  if (value === "active") return "활동중";
  if (value === "dead") return "사망";
  if (value === "missing") return "실종";
  if (value === "retired") return "은퇴";
  return "";
}

function preserve(text) {
  return text || "";
}

function build(file, raw) {
  const { yaml, body } = parseFrontmatter(raw);
  const clean = stripGenerated(body);
  const name = scalar(yaml, "name", file.replace(/\.md$/, ""));
  const id = scalar(yaml, "id", "");
  const summary = scalar(yaml, "summary", `${name}은 로그에서 확인되는 인물입니다.`);
  const aliases = list(yaml, "aliases");
  const tags = [...new Set(["character", ...list(yaml, "tags").filter((t) => t !== "character")])];
  const sources = list(yaml, "sources");
  const species = scalar(yaml, "species");
  const gender = scalar(yaml, "gender");
  const age = scalar(yaml, "age");
  const occupation = scalar(yaml, "occupation") || tableValue(section(clean, "기본 정보"), "직업");
  const affiliations = list(yaml, "affiliations");
  const relatedCharacters = list(yaml, "related_characters");
  const relatedLocations = list(yaml, "related_locations");
  const firstSeen = scalar(yaml, "first_seen");
  const role = roleFor(file, name, occupation);
  const status = statusFor(scalar(yaml, "status"));

  const basic = section(clean, "기본 정보");
  const appearance = section(clean, "외형");
  const background = section(clean, "배경");
  const personality = section(clean, "성격 / 말투") || section(clean, "성격");
  const ideal = section(clean, "이상");
  const bond = section(clean, "유대");
  const flaw = section(clean, "단점");
  const relation = section(clean, "관계");
  const ability = section(clean, "특기 / 역할") || section(clean, "능력 / 역할");
  const actions = section(clean, "주요 행적");
  const occupationText = occupation || tableValue(basic, "직업");
  const activityText = tableValue(basic, "활동 무대") || relatedLocations.join(", ");

  return `---
id: ${yamlString(id)}
type: "character"
name: ${yamlString(name)}
aliases: ${yamlArray(aliases)}
role: ${yamlString(role)}
status: ${yamlString(status)}
story_project: "Fantasy Library"
tags: ${yamlArray(tags)}
last_updated: "2026-05-24"
summary: ${yamlString(summary)}
canon_status: ${yamlString(scalar(yaml, "canon_status", "provisional"))}
confidence: ${yamlString(scalar(yaml, "confidence", "medium"))}
source_type: "rp_log"
sources: ${yamlArray(sources)}
first_seen: ${yamlString(firstSeen)}
species: ${yamlString(species)}
gender: ${yamlString(gender)}
age: ${yamlString(age)}
occupation: ${yamlString(occupation)}
affiliations: ${yamlArray(affiliations)}
related_locations: ${yamlArray(relatedLocations)}
related_characters: ${yamlArray(relatedCharacters)}
---
# ${name}

## 1. 핵심 요약
- 한 줄 요약: ${summary}
- 작품/RP 내 역할: ${role}
- 첫인상: ${filled(appearance, role, "impression", name, summary)}
- 핵심 키워드: ${[occupationText, ...affiliations, role].filter(Boolean).slice(0, 5).join(", ")}
- 장르적 포지션: ${role.includes("적대자") ? "전투와 위협을 통해 장면의 긴장을 만드는 인물." : role.includes("파티") ? "파티의 대화와 선택을 통해 장면을 밀고 가는 주요 인물." : "장면 진행과 세계관 정보를 드러내는 조연 인물."}
- 현재 상태: ${status}
- 등장 시점: ${firstSeen}
- 주요 갈등: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 캐릭터의 가장 큰 매력: ${filled(personality, role, "charm", name, summary)}

## 2. 기본 프로필
- 이름: ${name}
- 별명 / 호칭: ${aliases.join(", ")}
- 나이: ${age}
- 성별: ${gender}
- 종족 / 출신: ${species}
- 직업 / 계급 / 소속: ${[occupationText, ...affiliations].filter(Boolean).join(" / ")}
- 거주지: ${activityText}
- 가족 관계: ${role.includes("파티") ? "가족보다 동료 관계가 현재 서사의 중심에 놓여 있다." : "직접적인 가족 관계보다 장면 안의 역할이 우선 드러난다."}
- 사회적 지위: ${role}
- 평판: ${reputationFor(role)}
- 말투 요약: ${filled(personality, role, "style", name, summary)}
- 자주 쓰는 말: 감정이 올라오면 자신의 성격이 바로 드러나는 짧은 반응을 자주 낸다.
- 상징물 / 대표 소품: ${role.includes("적대자") ? "무기와 전장 자체가 상징처럼 기능한다." : role.includes("안내자") ? "길 안내와 설명의 역할 자체가 대표 소품처럼 쓰인다." : "직업과 전투 방식에 연결된 장비가 캐릭터의 이미지를 만든다."}

## 3. 외형
- 키 / 체형: ${filled(appearance, role, "impression", name, summary)}
- 얼굴 인상: 감정과 태도가 먼저 읽히는 타입이다.
- 눈: 대화 상대와 상황을 빠르게 훑는 인상.
- 머리: 세부 묘사는 적지만, 장면에서는 말투와 행동이 외형보다 먼저 기억된다.
- 피부: 세부 묘사는 적다.
- 손 / 자세 / 걸음걸이: ${role.includes("파티") ? "상황에 끼어들거나 물러서는 타이밍이 빠르다." : "자기 역할에 맞춰 움직임이 기능적으로 묘사된다."}
- 흉터 / 문신 / 피어싱 / 특징: 외형적 장식보다 행동 패턴이 특징으로 남는다.
- 의상 스타일: 직업과 역할에 맞춘 실용적인 인상.
- 자주 들고 다니는 물건: ${role.includes("적대자") ? "전투 장비." : "직업적 역할과 연결된 장비."}
- 분위기: ${filled(appearance, role, "impression", name, summary)}
- 실루엣 요약: ${role.includes("적대자") ? "전장 속 위협으로 먼저 인식되는 실루엣." : "대화와 행동으로 존재감이 잡히는 실루엣."}
- 다른 인물이 처음 보면 느끼는 점: ${filled(appearance, role, "impression", name, summary)}

${preserve(appearance)}

## 4. 성격과 행동 패턴
- 겉으로 보이는 성격: ${filled(personality, role, "impression", name, summary)}
- 실제 내면: ${filled(ideal, role, "inner", name, summary)}
- 장점: ${filled(ideal, role, "charm", name, summary)}
- 단점: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 콤플렉스: 자기 역할을 제대로 증명하지 못하거나, 우습게 보이는 상황에 민감하다.
- 자존심이 걸리는 부분: ${role.includes("적대자") ? "전투에서 밀리거나 명령 수행에 실패하는 것." : "자신의 방식과 능력이 가볍게 취급되는 것."}
- 쉽게 화나는 지점: 상대가 자기 기준을 무시하거나, 상황을 지나치게 어지럽힐 때.
- 쉽게 무너지는 지점: ${listLine(flaw, infer(role, "fear", name, summary))}
- 좋아하는 것: ${filled(ideal, role, "desire", name, summary)}
- 싫어하는 것: ${listLine(flaw, infer(role, "fear", name, summary))}
- 습관: ${filled(personality, role, "style", name, summary)}
- 버릇: 긴장하거나 당황하면 말투와 행동이 더 선명하게 튀어나온다.
- 스트레스 받을 때의 행동: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 위기 상황에서의 반응: ${listLine(actions, infer(role, "inner", name, summary))}
- 친한 사람 앞에서의 모습: ${filled(bond, role, "inner", name, summary)}
- 적 앞에서의 모습: ${listLine(actions, infer(role, "conflict", name, summary))}
- 혼자 있을 때의 모습: 겉으로 보인 역할을 정리하고 다음 행동을 가늠하는 쪽에 가깝다.

${preserve(personality)}

## 5. 욕망, 결핍, 공포
- 가장 원하는 것: ${filled(ideal, role, "desire", name, summary)}
- 겉으로 말하는 목표: ${filled(ideal, role, "desire", name, summary)}
- 숨겨진 진짜 목표: 자기 방식이 틀리지 않았다는 것을 행동으로 증명하는 것.
- 가장 두려워하는 것: ${listLine(flaw, infer(role, "fear", name, summary))}
- 인정하고 싶지 않은 약점: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 과거에서 벗어나지 못하는 부분: ${line(background) || "과거보다는 현재 장면의 선택을 통해 캐릭터성이 드러난다."}
- 이 캐릭터가 절대 포기하지 않는 것: ${filled(bond, role, "desire", name, summary)}
- 이 캐릭터가 선을 넘게 되는 조건: 자기 사람, 임무, 자존심 중 하나가 정면으로 침해될 때.
- 잘못된 믿음: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 성장 후 깨닫게 될 진실: 혼자 버티는 것보다 관계 안에서 자기 역할을 조정하는 쪽이 더 강하다는 점.

${preserve(ideal)}

## 6. 과거 / 백스토리
- 출생 배경: ${line(background) || "출생보다 현재의 직업과 관계가 먼저 드러나는 인물이다."}
- 어린 시절: 직접 길게 다뤄지지는 않지만, 현재의 말투와 행동에는 자기 기준을 빨리 세워야 했던 흔적이 있다.
- 결정적인 사건: ${listLine(actions, infer(role, "conflict", name, summary))}
- 상처가 된 사건: ${line(background) || filled(flaw, role, "fear", name, summary)}
- 현재 성격을 만든 경험: ${line(background) || "반복되는 위기와 동료 관계가 성격을 선명하게 만든다."}
- 잃어버린 것: 편하게 물러날 수 있는 거리감.
- 얻은 것: 자기 역할을 증명할 기회와, 계속 얽히는 관계.
- 숨기고 있는 과거: 겉으로 드러내는 태도보다 더 개인적인 두려움이나 열등감이 있을 가능성이 높다.
- 타인에게 알려진 과거: ${line(background) || "직업과 현재 행적을 통해 먼저 알려진다."}
- 실제 진실: 아직 본인이 전부 말하지 않은 내면의 동기가 남아 있는 타입으로 해석된다.
- 현재 목표와 과거의 연결점: ${line(background) || "지금의 목표는 과거보다 현재의 관계와 생존 조건에서 비롯된다."}

${preserve(background)}

## 7. 능력 / 기술 / 한계
- 주요 능력: ${listLine(ability, infer(role, "desire", name, summary))}
- 보조 능력: 상황 판단, 대화 반응, 동료와의 역할 분담.
- 전투 방식: ${listLine(ability, infer(role, "conflict", name, summary))}
- 비전투 특기: ${role.includes("안내자") ? "정보 전달과 절차 안내." : "대화 속에서 분위기를 바꾸고 장면의 선택지를 넓히는 것."}
- 지식 / 전문 분야: ${listLine(ability, infer(role, "desire", name, summary))}
- 약점: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 신체적 한계: 장면상 직접 드러난 한계보다는 상황 판단과 심리적 흔들림이 더 중요하다.
- 정신적 한계: ${listLine(flaw, infer(role, "fear", name, summary))}
- 능력을 쓰는 방식의 특징: 자기 성격이 기술 사용 방식에도 묻어난다.
- 능력을 쓰지 못하는 조건: 당황, 관계 갈등, 정보 부족으로 판단이 흐려질 때.
- 성장 가능성: 자기 약점을 인정하고 타인과 역할을 나누는 방향으로 성장 여지가 있다.

${preserve(ability)}

## 8. 관계

### 관계 요약표

${preserve(relation) || "| 대상 | 관계 | 감정 | 갈등 | 현재 상태 |\n|---|---|---|---|---|\n|  |  |  |  |  |"}

### 주요 관계 상세

${relatedCharacters.length ? relatedCharacters.map((target) => `#### ${target}\n- 관계:\n- 과거:\n- 현재 감정:\n- 숨기는 감정:\n- 갈등 요소:\n- 관계 변화 방향:`).join("\n\n") : "#### 정리 필요\n- 관계:\n- 과거:\n- 현재 감정:\n- 숨기는 감정:\n- 갈등 요소:\n- 관계 변화 방향:"}

## 9. 말투 / 대사 스타일
- 문장 길이: ${filled(personality, role, "style", name, summary)}
- 말의 온도: ${filled(personality, role, "style", name, summary)}
- 존댓말 / 반말: ${filled(personality, role, "style", name, summary)}
- 자주 쓰는 어휘: 자기 역할, 상황 반응, 동료를 향한 즉흥적인 평가가 말투에 자주 섞인다.
- 피하는 표현: 자기 약점을 정면으로 인정하는 말.
- 감정이 격해졌을 때: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 거짓말할 때: 말을 길게 돌리거나, 반대로 지나치게 짧게 끊을 가능성이 높다.
- 화났을 때: ${listLine(flaw, infer(role, "conflict", name, summary))}
- 다정할 때: ${filled(bond, role, "inner", name, summary)}
- 위협할 때: ${filled(actions, role, "conflict", name, summary)}
`;
}

let count = 0;
for (const file of readdirSync(dir).filter((name) => name.endsWith(".md"))) {
  const full = join(dir, file);
  writeFileSync(full, build(file, readFileSync(full, "utf8")), "utf8");
  count += 1;
}

console.log(`rewrote ${count} character profiles`);
