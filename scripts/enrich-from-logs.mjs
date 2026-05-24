/**
 * enrich-from-logs.mjs
 *
 * 각 Codex 문서의 sources 필드에 나열된 원문 로그를 읽어서,
 * 해당 문서의 이름(name) 또는 id가 언급된 장면을 추출해
 * "## 원문 발췌" 섹션으로 추가한다.
 *
 * - 이미 "## 원문 발췌" 섹션이 있으면 덮어쓴다.
 * - 발췌는 최대 20개 장면, 각 장면은 ±2줄 컨텍스트.
 * - 캐릭터/지역/팩션/사건/개념/아이템 전체 처리.
 * - session 문서는 "## 주요 장면" 이 이미 있으므로 건너뜀.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

const REPO = resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), "..");
const CONTENT = join(REPO, "src/content");
const SOURCE = join(REPO, "source");

const COLLECTIONS = ["characters", "locations", "factions", "events", "concepts", "items"];
const CONTEXT_LINES = 2;
const MAX_EXCERPTS = 20;

function parseFrontmatter(rawText) {
  // Normalize line endings
  const text = rawText.replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  return { yaml: m[1], body: m[2], normalized: true };
}

function extractYamlField(yaml, field) {
  const m = yaml.match(new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return m ? m[1].trim() : "";
}

function extractYamlArray(yaml, field) {
  const m = yaml.match(new RegExp(`^${field}:\\n((?:  - .+\\n?)+)`, "m"));
  if (!m) return [];
  return m[1].match(/  - ["']?(.+?)["']?\s*$/mg)
    .map(l => l.replace(/^\s*- ["']?|["']?\s*$/g, "").trim())
    .filter(Boolean);
}

function stripExcerptSection(body) {
  // Remove existing "## 원문 발췌" section and everything after it up to the next ##
  return body.replace(/\n## 원문 발췌[\s\S]*?(?=\n## (?!원문 발췌)|\n---\n|$)/, "");
}

function stripDuplicateSections(body) {
  // Remove "## 한 줄 요약", "## 출처" sections that duplicate frontmatter
  let b = body;
  // Remove "## 출처" section (and its content until next ## or end)
  b = b.replace(/\n## 출처[\s\S]*?(?=\n## |\n---\n|$)/, "");
  return b;
}

function findExcerpts(logText, names, maxExcerpts) {
  const lines = logText.split("\n");
  const excerpts = [];
  const seen = new Set();

  // Build search patterns for each name
  const patterns = names
    .filter(n => n && n.length > 1)
    .map(n => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!patterns.some(p => p.test(line))) continue;
    if (line.trim().startsWith("#")) continue; // skip headings

    const start = Math.max(0, i - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, i + CONTEXT_LINES);
    const chunk = lines.slice(start, end + 1).join("\n").trim();

    // Deduplicate by first 60 chars
    const key = chunk.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);

    excerpts.push(chunk);
    if (excerpts.length >= maxExcerpts) break;
  }
  return excerpts;
}

let updated = 0;
let skipped = 0;

for (const col of COLLECTIONS) {
  const dir = join(CONTENT, col);
  if (!existsSync(dir)) continue;

  const files = readdirSync(dir).filter(f => f.endsWith(".md"));

  for (const file of files) {
    const filePath = join(dir, file);
    const raw = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
    const parsed = parseFrontmatter(raw);
    if (!parsed) { skipped++; continue; }

    const { yaml, body } = parsed;
    const type = extractYamlField(yaml, "type");
    if (type === "session") { skipped++; continue; } // sessions have their own content

    const name = extractYamlField(yaml, "name");
    const idField = extractYamlField(yaml, "id");
    const aliases = extractYamlArray(yaml, "aliases");
    const sources = extractYamlArray(yaml, "sources");

    if (!sources.length) { skipped++; continue; }

    // Build all names to search for
    const searchNames = [name, ...aliases].filter(Boolean);

    // Read all source log files
    const allExcerpts = [];
    for (const src of sources) {
      const logPath = join(REPO, src);
      if (!existsSync(logPath)) continue;
      const logText = readFileSync(logPath, "utf-8");
      const excerpts = findExcerpts(logText, searchNames, MAX_EXCERPTS - allExcerpts.length);
      allExcerpts.push(...excerpts);
      if (allExcerpts.length >= MAX_EXCERPTS) break;
    }

    if (!allExcerpts.length) { skipped++; continue; }

    // Build excerpt section
    const excerptSection = "\n## 원문 발췌\n\n" +
      allExcerpts.map((e, i) =>
        `> **[${i + 1}]**\n>\n` +
        e.split("\n").map(l => `> ${l}`).join("\n")
      ).join("\n\n") + "\n";

    // Clean body: remove existing excerpt section and duplicate metadata sections
    let cleanBody = stripExcerptSection(body);
    cleanBody = stripDuplicateSections(cleanBody);
    cleanBody = cleanBody.trimEnd();

    const newContent = `---\n${yaml}\n---\n${cleanBody}${excerptSection}`;
    writeFileSync(filePath, newContent, "utf-8");
    updated++;
    process.stdout.write(`  ✓ ${col}/${file} (${allExcerpts.length} excerpts)\n`);
  }
}

console.log(`\n완료: ${updated}개 업데이트, ${skipped}개 건너뜀`);
