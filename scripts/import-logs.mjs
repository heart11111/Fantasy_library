import fs from "node:fs/promises";
import path from "node:path";

const inputDir = "C:/Users/sj/Downloads/LOG DATA/_md_cleaned";
const today = "2026-05-24";

const root = process.cwd();
const sourceRoot = path.join(root, "source", "rp-logs");
const contentRoot = path.join(root, "src", "content");
const dataRoot = path.join(root, "data");

const excludeNames = new Set([
  "_cleaning_report.md",
  "fvtt-log-Mon-Mar-16-2026 (1).md",
  "fvtt-log-Mon-Mar-16-2026 (2).md",
  "마키나즈 7 (1).md",
  "더 월드 29 룩스테라-해골 틈에서 춤을 추다 [pdf].md",
  "더월드 30 룩스테라-해골의 뒤에 보이는 것은 [pdf].md",
  "더월드 33 룩스테라-붉은 닻의 심지 [pdf].md",
  "더월드 35 룩스테라-모험의 서막 [pdf].md"
]);

const knownLocations = [
  ["loc-luxterra", "룩스테라", ["룩스테라"]],
  ["loc-origin", "오리진", ["오리진"]],
  ["loc-baldurs-gate", "발더스 게이트", ["발더스 게이트"]],
  ["loc-outpost", "전초기지", ["전초기지"]],
  ["loc-ruins", "유적", ["유적"]],
  ["loc-forest", "숲", ["숲"]],
  ["loc-city", "도시", ["도시"]],
  ["loc-yggdrasil-gap", "세계의 틈새", ["세계의 틈새", "틈새", "위그드라실"]]
];

const knownFactions = [
  ["faction-investigation-team", "조사대", ["조사대", "조사대장"]],
  ["faction-guard", "수비대", ["수비대"]],
  ["faction-drow", "드로우", ["드로우"]],
  ["faction-red-anchor", "붉은 닻", ["붉은 닻"]],
  ["faction-bandits", "산적", ["산적"]],
  ["faction-skeletons", "해골", ["해골"]],
  ["faction-makinas", "마키나즈", ["마키나즈"]],
  ["faction-riskydice", "RiskyDice", ["RiskyDice"]]
];

const knownConcepts = [
  ["concept-public-log-codex", "공개 로그 기반 Codex", ["공개 로그 기반", "Codex"]],
  ["concept-yggdrasil-blessing", "위그드라실의 가호", ["위그드라실의 가호", "위그드라실"]],
  ["concept-world-gap", "세계의 틈새", ["세계의 틈새", "틈새"]]
];

const knownItems = [
  ["item-mana-stone", "마나석", ["마나석", "마석"]],
  ["item-ancient-research-materials", "연구자료", ["연구자료"]],
  ["item-black-key", "검은 열쇠", ["검은 열쇠", "검은키", "black key"]]
];

const systemSpeakers = new Set(["GM", "Gamemaster", "RiskyDice"]);
const blockedSpeakers = new Set([
  "Automated welcome message",
  "Thanks for updating the Item Macro",
  "Public RP Codex"
]);

function slugAscii(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function simpleSlug(value, fallback) {
  const ascii = slugAscii(value);
  return ascii || fallback;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function entityId(prefix, value) {
  const ascii = slugAscii(value);
  return `${prefix}-${/[a-z0-9]/.test(ascii) ? ascii : `h${stableHash(value)}`}`;
}

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlList(values, indent = "") {
  if (!values?.length) return `${indent}[]`;
  return values.map((value) => `${indent}- ${yamlScalar(value)}`).join("\n");
}

function frontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      lines.push(yamlList(value, "  "));
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function stripExistingHeader(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sep = lines.indexOf("---");
  if (sep >= 0 && sep < 8) return lines.slice(sep + 1).join("\n").trim();
  return text.trim();
}

function parseTitle(text, fileName) {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  if (first.startsWith("# ")) return first.replace(/^# /, "").trim();
  return fileName.replace(/\.md$/i, "");
}

function parseMessages(body) {
  const re = /^\*\*([^*\n:]+):\*\*\s*([\s\S]*?)(?=^\*\*[^*\n:]+:\*\*|\s*$)/gm;
  const messages = [];
  for (const match of body.matchAll(re)) {
    const speaker = match[1].trim();
    const text = match[2].trim();
    if (!speaker || blockedSpeakers.has(speaker)) continue;
    messages.push({ speaker, text });
  }
  return messages;
}

function firstUsefulMessages(messages, count, includeSystem = true) {
  return messages
    .filter((m) => includeSystem || !systemSpeakers.has(m.speaker))
    .filter((m) => m.text && !m.text.includes("foundryworkshop"))
    .slice(0, count);
}

function oneLine(text, max = 140) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function detectMatches(text, defs) {
  return defs.filter(([, , keywords]) => keywords.some((kw) => text.includes(kw)));
}

function inferGroup(fileName, title) {
  const raw = `${fileName} ${title}`;
  if (raw.includes("마키나즈")) return "makinas";
  if (raw.includes("룩스테라") || raw.includes("더 월드") || raw.includes("더월드")) return "luxterra";
  if (raw.includes("fvtt-log") || raw.includes("Tue-Apr")) return "fvtt";
  if (raw.includes("포가튼")) return "forgotten-relic";
  return "misc";
}

function eventNameFromTitle(title) {
  return title.replace(/\s+\[(pdf|txt)\]$/i, "").trim();
}

async function ensureDirs() {
  const dirs = [
    sourceRoot,
    dataRoot,
    "sessions",
    "characters",
    "locations",
    "factions",
    "events",
    "concepts",
    "items"
  ];
  for (const dir of dirs) {
    const full = dir.includes("\\") || dir.includes("/") ? path.join(contentRoot, dir) : path.join(contentRoot, dir);
    if (dir === sourceRoot || dir === dataRoot) await fs.mkdir(dir, { recursive: true });
    else await fs.mkdir(full, { recursive: true });
  }
}

async function resetGeneratedDirs() {
  await fs.rm(sourceRoot, { recursive: true, force: true });
  await fs.rm(dataRoot, { recursive: true, force: true });
  for (const dir of ["sessions", "characters", "locations", "factions", "events", "concepts", "items"]) {
    await fs.rm(path.join(contentRoot, dir), { recursive: true, force: true });
  }
}

async function writeFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function sessionDoc(session, messages) {
  const sceneMessages = firstUsefulMessages(messages, 5);
  const facts = sceneMessages.map((m) => `- ${m.speaker}: ${oneLine(m.text, 180)}`).join("\n") || "- 자동 추출 가능한 본문이 없습니다.";
  const characters = session.characters.map((c) => `- ${c.name} (${c.id})`).join("\n") || "- 확인 필요";
  const locations = session.locations.map((l) => `- ${l[1]} (${l[0]})`).join("\n") || "- 확인 필요";
  const factions = session.factions.map((f) => `- ${f[1]} (${f[0]})`).join("\n") || "- 확인 필요";
  const ocrNote = session.ocrNeeded
    ? "\n> 이 세션은 스캔 PDF에서 텍스트가 추출되지 않아 OCR 후 재정리가 필요합니다.\n"
    : "";

  return `${frontmatter({
    id: session.id,
    type: "session",
    name: session.title,
    summary: session.summary,
    canon_status: session.ocrNeeded ? "provisional" : "canon",
    confidence: session.ocrNeeded ? "low" : "medium",
    source_type: "rp_log",
    sources: [session.sourcePath],
    tags: ["session", session.group],
    first_seen: session.id,
    last_updated: today,
    date_played: "",
    related_characters: session.characters.map((c) => c.id),
    related_locations: session.locations.map((l) => l[0]),
    related_factions: session.factions.map((f) => f[0]),
    related_events: [session.eventId]
  })}# ${session.title}

## 요약

${session.summary}
${ocrNote}
## 주요 장면

${facts}

## 새로 등장한 정보

### 캐릭터

${characters}

### 지역

${locations}

### 팩션

${factions}

### 사건

- ${session.eventTitle} (${session.eventId})

## 확정된 정보

- 이 문서는 공개 로그를 기반으로 자동 생성한 1차 정리본입니다.
- 명확한 원문 근거가 부족한 해석은 확정 정보로 적지 않았습니다.

## 소문 / 불확실한 정보

- 장면의 원인, 배후, 비공개 동기처럼 로그 밖 추론이 필요한 정보는 아직 확정하지 않았습니다.
- 자동 추출 과정에서 누락된 인물과 장소가 있을 수 있습니다.

## 관계 변화

| 대상 A | 대상 B | 변화 |
|---|---|---|
| 확인 필요 | 확인 필요 | 세부 관계는 2차 정리에서 로그 대조가 필요합니다. |

## 다음 세션으로 이어지는 요소

- 미해결 갈등, 이동 예정지, 추적 중인 단서는 2차 정리에서 캠페인별로 검수합니다.

## 원문 출처

- ${session.sourcePath}
`;
}

function entityDoc(type, entity, sessions) {
  const isCharacter = type === "character";
  const isLocation = type === "location";
  const sources = [...new Set(sessions.map((s) => s.sourcePath))].slice(0, 20);
  const firstSeen = sessions[0]?.id ?? "";
  const summary =
    entity.summary ??
    `${entity.name}은 공개 로그에서 반복적으로 언급되는 ${isCharacter ? "인물" : isLocation ? "지역" : "세력"}입니다.`;
  const relatedEvents = sessions.map((s) => s.eventId);

  const data = {
    id: entity.id,
    type,
    name: entity.name,
    aliases: entity.aliases ?? [],
    summary,
    canon_status: "provisional",
    confidence: entity.confidence ?? "medium",
    source_type: "rp_log",
    sources,
    tags: [type, ...(entity.tags ?? [])],
    first_seen: firstSeen,
    last_updated: today
  };

  if (isCharacter) {
    Object.assign(data, {
      species: "",
      gender: "",
      age: "",
      occupation: "",
      affiliations: [],
      related_locations: [],
      related_characters: [],
      status: "unknown"
    });
  } else if (isLocation) {
    Object.assign(data, {
      region: "",
      parent_location: "",
      related_factions: [],
      related_characters: [],
      related_events: relatedEvents,
      status: "active"
    });
  } else {
    Object.assign(data, {
      leader: "",
      base_location: "",
      related_characters: [],
      related_locations: [],
      related_events: relatedEvents,
      status: "active"
    });
  }

  return `${frontmatter(data)}# ${entity.name}

## 한 줄 요약

${summary}

## 기본 정보

| 항목 | 내용 |
|---|---|
| 분류 | ${isCharacter ? "캐릭터" : isLocation ? "지역" : "팩션"} |
| 첫 등장 | ${firstSeen || "확인 필요"} |
| 현재 상태 | 확인 필요 |
| 확신도 | ${data.confidence} |

## 상세 정보

- 공개 로그에서 반복적으로 확인되는 항목입니다.
- 현재 문서는 자동 초벌이며, 세부 설정은 출처 로그 대조 후 보강해야 합니다.

## 관계

| 대상 | 관계 | 설명 |
|---|---|---|
| 확인 필요 | 확인 필요 | 명확한 관계는 2차 정리에서 보강합니다. |

## 주요 행적

| 시점 | 행적 |
|---|---|
${sessions.slice(0, 12).map((s) => `| ${s.id} | ${s.title} 로그에서 언급됨 |`).join("\n")}

## 확인 필요

- 정식 소속, 현재 위치, 장기 목표는 로그 대조가 필요합니다.
- 농담, 메타 발언, 플레이어 추측은 정사로 확정하지 않았습니다.

## 출처

${sources.map((source) => `- ${source}`).join("\n")}
`;
}

function eventDoc(session) {
  return `${frontmatter({
    id: session.eventId,
    type: "event",
    name: session.eventTitle,
    aliases: [],
    summary: session.summary,
    canon_status: session.ocrNeeded ? "provisional" : "canon",
    confidence: session.ocrNeeded ? "low" : "medium",
    source_type: "rp_log",
    sources: [session.sourcePath],
    tags: ["event", session.group],
    first_seen: session.id,
    last_updated: today,
    date_label: session.title,
    order: session.order,
    related_characters: session.characters.map((c) => c.id),
    related_locations: session.locations.map((l) => l[0]),
    related_factions: session.factions.map((f) => f[0]),
    causes: [],
    consequences: []
  })}# ${session.eventTitle}

## 한 줄 요약

${session.summary}

## 기본 정보

| 항목 | 내용 |
|---|---|
| 시점 | ${session.title} |
| 장소 | ${session.locations.map((l) => l[1]).join(", ") || "확인 필요"} |
| 관련 인물 | ${session.characters.map((c) => c.name).join(", ") || "확인 필요"} |
| 관련 세력 | ${session.factions.map((f) => f[1]).join(", ") || "확인 필요"} |
| 결과 | 확인 필요 |

## 배경

자동 초벌에서는 사건 제목과 세션 초반 장면을 기준으로만 정리했습니다.

## 진행

세부 진행은 원문 로그를 기준으로 2차 검수에서 보강합니다.

## 결과

확정된 결과와 후속 영향은 아직 별도 검수가 필요합니다.

## 관련 인물

| 인물 | 역할 |
|---|---|
${session.characters.length ? session.characters.map((c) => `| ${c.id} | 로그 등장 |`).join("\n") : "| 확인 필요 | 확인 필요 |"}

## 관련 지역

| 지역 | 설명 |
|---|---|
${session.locations.length ? session.locations.map((l) => `| ${l[0]} | 로그에서 언급됨 |`).join("\n") : "| 확인 필요 | 확인 필요 |"}

## 후속 영향

- 다음 세션으로 이어지는 갈등과 단서는 추가 검수가 필요합니다.

## 확인 필요

- 사건 원인과 결과를 공개 로그 기준으로 재검수해야 합니다.

## 출처

- ${session.sourcePath}
`;
}

function simpleCodexDoc(type, entity, sessions) {
  const sources = [...new Set(sessions.map((s) => s.sourcePath))].slice(0, 20);
  const firstSeen = sessions[0]?.id ?? "";
  const data = {
    id: entity.id,
    type,
    name: entity.name,
    aliases: [],
    summary: `${entity.name}은 공개 로그에서 확인되는 ${type === "concept" ? "개념" : "아이템"}입니다.`,
    canon_status: "provisional",
    confidence: "medium",
    source_type: "rp_log",
    sources,
    tags: [type],
    first_seen: firstSeen,
    last_updated: today
  };
  if (type === "concept") {
    Object.assign(data, {
      related_characters: [],
      related_locations: [],
      related_factions: []
    });
  } else {
    Object.assign(data, {
      owner: "",
      related_characters: [],
      related_locations: [],
      related_events: sessions.map((s) => s.eventId),
      status: "unknown"
    });
  }

  return `${frontmatter(data)}# ${entity.name}

## 한 줄 요약

${data.summary}

## 설명

자동 초벌에서는 이 항목이 등장한 로그와 관련 세션만 정리했습니다. 세부 기능, 원리, 소유 관계는 공개 로그 대조 후 보강해야 합니다.

## 관련 사례

| 사례 | 설명 |
|---|---|
${sessions.slice(0, 10).map((s) => `| ${s.id} | ${s.title} 로그에서 언급됨 |`).join("\n")}

## 확인 필요

- 공개 로그에서 확정된 정의와 단순 언급을 분리해야 합니다.
- 숨겨진 진실이나 GM 전용 설정은 작성하지 않습니다.

## 출처

${sources.map((source) => `- ${source}`).join("\n")}
`;
}

async function main() {
  await resetGeneratedDirs();
  await ensureDirs();

  const files = (await fs.readdir(inputDir))
    .filter((name) => name.endsWith(".md") && !excludeNames.has(name))
    .sort((a, b) => a.localeCompare(b, "ko"));

  const sessions = [];
  const characterMap = new Map();
  const locationMap = new Map();
  const factionMap = new Map();
  const conceptMap = new Map();
  const itemMap = new Map();

  let index = 1;
  for (const fileName of files) {
    const raw = await fs.readFile(path.join(inputDir, fileName), "utf8");
    const title = parseTitle(raw, fileName);
    const group = inferGroup(fileName, title);
    const body = stripExistingHeader(raw);
    const messages = parseMessages(body);
    const id = `session-${String(index).padStart(3, "0")}`;
    const sourceFile = `${id}-${simpleSlug(fileName.replace(/\.md$/i, ""), `log-${index}`)}.md`;
    const sourcePath = `source/rp-logs/${group}/${sourceFile}`;
    const eventTitle = eventNameFromTitle(title);
    const eventId = `event-${id}`;
    const ocrNeeded = body.includes("텍스트 추출 내용이 없습니다") || body.length < 500;
    const useful = firstUsefulMessages(messages, 1)[0];
    const summary = ocrNeeded
      ? `${title} 원문은 OCR이 필요한 스캔 PDF로, 본문 정리가 아직 완료되지 않았습니다.`
      : oneLine(useful?.text, 120) || `${title} 세션의 공개 로그 기반 자동 초벌입니다.`;
    const wholeText = body;
    const locations = detectMatches(wholeText, knownLocations);
    const factions = detectMatches(wholeText, knownFactions);
    const concepts = detectMatches(wholeText, knownConcepts);
    const items = detectMatches(wholeText, knownItems);

    const speakerCounts = new Map();
    for (const { speaker } of messages) {
      if (systemSpeakers.has(speaker) || blockedSpeakers.has(speaker)) continue;
      if (speaker.length > 24) continue;
      speakerCounts.set(speaker, (speakerCounts.get(speaker) ?? 0) + 1);
    }
    const characters = [...speakerCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({
        id: entityId("char", name),
        name,
        count
      }));

    const session = {
      id,
      title,
      group,
      sourcePath,
      sourceFile,
      eventId,
      eventTitle,
      order: index * 10,
      summary,
      ocrNeeded,
      characters,
      locations,
      factions
    };
    sessions.push({ ...session, messages });

    const sourceContent = `${frontmatter({
      id: `raw-${id}`,
      type: "raw_source",
      source_type: "rp_log",
      title: `${title} 원문 로그`,
      date_played: "",
      processed: false,
      related_summary: `src/content/sessions/${id}.md`
    })}# ${title} 원문 로그

${body}
`;
    await writeFile(path.join(root, sourcePath), sourceContent);
    await writeFile(path.join(contentRoot, "sessions", `${id}.md`), sessionDoc(session, messages));
    await writeFile(path.join(contentRoot, "events", `${eventId}.md`), eventDoc(session));

    for (const character of characters) {
      if (!characterMap.has(character.id)) characterMap.set(character.id, { entity: character, sessions: [] });
      characterMap.get(character.id).sessions.push(session);
    }
    for (const loc of locations) {
      if (!locationMap.has(loc[0])) locationMap.set(loc[0], { entity: { id: loc[0], name: loc[1] }, sessions: [] });
      locationMap.get(loc[0]).sessions.push(session);
    }
    for (const faction of factions) {
      if (!factionMap.has(faction[0])) factionMap.set(faction[0], { entity: { id: faction[0], name: faction[1] }, sessions: [] });
      factionMap.get(faction[0]).sessions.push(session);
    }
    for (const concept of concepts) {
      if (!conceptMap.has(concept[0])) conceptMap.set(concept[0], { entity: { id: concept[0], name: concept[1] }, sessions: [] });
      conceptMap.get(concept[0]).sessions.push(session);
    }
    for (const item of items) {
      if (!itemMap.has(item[0])) itemMap.set(item[0], { entity: { id: item[0], name: item[1] }, sessions: [] });
      itemMap.get(item[0]).sessions.push(session);
    }

    index += 1;
  }

  const topCharacters = [...characterMap.values()]
    .filter(({ sessions }) => sessions.length >= 2)
    .sort((a, b) => b.sessions.length - a.sessions.length)
    .slice(0, 40);

  for (const { entity, sessions: linkedSessions } of topCharacters) {
    await writeFile(
      path.join(contentRoot, "characters", `${entity.id.replace(/^char-/, "")}.md`),
      entityDoc("character", entity, linkedSessions)
    );
  }
  for (const { entity, sessions: linkedSessions } of locationMap.values()) {
    await writeFile(
      path.join(contentRoot, "locations", `${entity.id.replace(/^loc-/, "")}.md`),
      entityDoc("location", entity, linkedSessions)
    );
  }
  for (const { entity, sessions: linkedSessions } of factionMap.values()) {
    await writeFile(
      path.join(contentRoot, "factions", `${entity.id.replace(/^faction-/, "")}.md`),
      entityDoc("faction", entity, linkedSessions)
    );
  }
  for (const { entity, sessions: linkedSessions } of conceptMap.values()) {
    await writeFile(
      path.join(contentRoot, "concepts", `${entity.id.replace(/^concept-/, "")}.md`),
      simpleCodexDoc("concept", entity, linkedSessions)
    );
  }
  for (const { entity, sessions: linkedSessions } of itemMap.values()) {
    await writeFile(
      path.join(contentRoot, "items", `${entity.id.replace(/^item-/, "")}.md`),
      simpleCodexDoc("item", entity, linkedSessions)
    );
  }

  const relations = [];
  for (const session of sessions) {
    for (const character of session.characters.slice(0, 8)) {
      relations.push({
        from: character.id,
        to: session.eventId,
        type: "involved_in",
        label: "사건 등장",
        confidence: "medium",
        source: session.id
      });
    }
    for (const loc of session.locations) {
      relations.push({
        from: session.eventId,
        to: loc[0],
        type: "located_in",
        label: "관련 지역",
        confidence: "medium",
        source: session.id
      });
    }
    for (const faction of session.factions) {
      relations.push({
        from: faction[0],
        to: session.eventId,
        type: "involved_in",
        label: "사건 관련",
        confidence: "medium",
        source: session.id
      });
    }
  }

  const timeline = sessions.map((session) => ({
    id: session.eventId,
    title: session.eventTitle,
    date_label: session.title,
    order: session.order,
    summary: session.summary,
    source: session.id,
    related_characters: session.characters.map((c) => c.id),
    related_locations: session.locations.map((l) => l[0]),
    related_factions: session.factions.map((f) => f[0])
  }));

  const glossary = [
    {
      term: "공개 로그 기반 Codex",
      aliases: ["Public RP Codex"],
      summary: "플레이어에게 공개된 로그만 출처로 삼는 세계관 정리 방식.",
      related_concept: "",
      source: "README"
    }
  ];

  await writeFile(path.join(dataRoot, "relations.json"), `${JSON.stringify(relations, null, 2)}\n`);
  await writeFile(path.join(dataRoot, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);
  await writeFile(path.join(dataRoot, "glossary.json"), `${JSON.stringify(glossary, null, 2)}\n`);

  console.log(`imported sessions=${sessions.length}`);
  console.log(`characters=${topCharacters.length} locations=${locationMap.size} factions=${factionMap.size}`);
  console.log(`concepts=${conceptMap.size} items=${itemMap.size}`);
  console.log(`relations=${relations.length} timeline=${timeline.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
