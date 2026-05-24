/**
 * Renames character files from auto-generated hash IDs to readable English IDs.
 * Also removes garbage entries (hp, x) and cleans up relations.json.
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Mapping: old file basename → new file basename (null = delete garbage)
const ID_MAP = {
  "h162wpxf": "merak-altemecia",       // 메라크 알테메기아
  "h166ykd7": "noa-levinos",           // 노아 레비노스
  "h183ytox": "falshu",                // 팔슈
  "h18damj9": "drow-warrior",          // 드로우 전사
  "h1a49coh": "ain",                   // 아인
  "h1eazjg1": "nelpis",               // 레지스탕스 리더 - 넬피스
  "h1etqrq5": "fiesta",               // 피에스타
  "h1hn5m4l": "levinos",              // 레비노스
  "h1kockfd": "nisha",                // 니샤
  "h1n38m25": "magnus",               // 매그너스
  "h1nkxsjr": "demian",               // 데미안
  "h1otutgd": "arsian-eldayne",       // 아르시안 엘다인
  "h1psx9jt": "arin",                 // 아린
  "h1qtvjrj": "eltera-maste",         // 엘테라 마스테
  "h1rmlpt3": "makina-dread-wildser", // 마키나 드레드 - 슈팅 와일저
  "h1stj4cz": "wolf-ripper",          // 갈기갈기 찢는 이리
  "h1u0zhr5": "lavinia",              // 라비니아
  "h1v8j9jw": "makina-dread-berserker", // 마키나 드레드 - 서든 버서커
  "h2kcs0k":  "lucky",               // 럭키
  "h8shiks":  "soldier",             // 병졸
  "ha7vcln":  "laika",               // 라이카
  "hb0qeob":  "hekatriel",           // 헤카트리엘
  "hbfjmmh":  "kaizelin",            // 카이젤린
  "hbt6mg4":  "drow-archer",         // 드로우 궁수
  "hdknrqz":  "lunasha",             // 루나샤
  "hm8rvcj":  "kaguya",             // 카구야
  "hp":       null,                   // DELETE — garbage (HP mechanic note)
  "hqkoaf":   "garia",               // 가리아
  "hrvxduz":  "karints",             // 카린츠
  "htaovsh":  "valerius-visconti",   // 발레리우스 비스콘티
  "htmudh7":  "elite-soldier",       // 정예병
  "hutxq0x":  "sundae",             // 순대
  "hvqt0o9":  "anton",              // 안톤
  "hy1rn1n":  "sargon",             // 사르곤
  "hy80szy":  "makina-dread-warrior",// 마키나 드레드 - 워리어
  "hyu8qlb":  "sierla",             // 시엘라
  "hyz5kmx":  "knight",             // 기사
  "hz6cjul":  "eve",                // 이브
  "nemo":     "nemo",               // keep
  "x":        null,                  // DELETE — garbage
};

// IDs known to appear only in relations.json but not in files (stale refs)
const STALE_IDS = new Set(["h8r7ikg"]);

const charDir = join(root, "src", "content", "characters");

// --- Step 1: rename/delete character files, update id field ---
console.log("Step 1: renaming character files...");
for (const [oldBase, newBase] of Object.entries(ID_MAP)) {
  const oldPath = join(charDir, `${oldBase}.md`);
  try {
    let content = readFileSync(oldPath, "utf8");

    if (newBase === null) {
      unlinkSync(oldPath);
      console.log(`  DELETE ${oldBase}.md`);
      continue;
    }

    // Update id field in frontmatter
    const oldId = `char-${oldBase}`;
    const newId = `char-${newBase}`;
    content = content.replace(
      new RegExp(`id:\\s*"${oldId}"`, "g"),
      `id: "${newId}"`
    );

    if (newBase !== oldBase) {
      const newPath = join(charDir, `${newBase}.md`);
      writeFileSync(newPath, content, "utf8");
      unlinkSync(oldPath);
      console.log(`  ${oldBase} → ${newBase}  (id: ${oldId} → ${newId})`);
    } else {
      writeFileSync(oldPath, content, "utf8");
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    console.warn(`  SKIP (not found): ${oldBase}.md`);
  }
}

// --- Step 2: build full replacement map (old char-id → new char-id) ---
const charIdMap = {};
for (const [oldBase, newBase] of Object.entries(ID_MAP)) {
  if (newBase !== null) {
    charIdMap[`char-${oldBase}`] = `char-${newBase}`;
  }
}
// stale refs → empty string (will be filtered out)
for (const stale of STALE_IDS) {
  charIdMap[`char-${stale}`] = null;
}

// --- Step 3: update relations.json ---
console.log("\nStep 2: updating relations.json...");
const relPath = join(root, "data", "relations.json");
let relations = JSON.parse(readFileSync(relPath, "utf8"));
const before = relations.length;

relations = relations.filter((rel) => {
  const newFrom = charIdMap[rel.from];
  const newTo   = charIdMap[rel.to];
  // remove if either side is a garbage/stale id
  if (newFrom === null || newTo === null) return false;
  if (rel.from in charIdMap && charIdMap[rel.from] === null) return false;
  if (rel.to   in charIdMap && charIdMap[rel.to]   === null) return false;
  return true;
}).map((rel) => ({
  ...rel,
  from: charIdMap[rel.from] ?? rel.from,
  to:   charIdMap[rel.to]   ?? rel.to,
}));

writeFileSync(relPath, JSON.stringify(relations, null, 2), "utf8");
console.log(`  ${before} → ${relations.length} entries`);

// --- Step 4: update all other content markdown files ---
console.log("\nStep 3: updating references in other content files...");

const contentDirs = ["events", "sessions", "locations", "factions", "concepts", "items"];
let updatedFiles = 0;

for (const dir of contentDirs) {
  const dirPath = join(root, "src", "content", dir);
  let files;
  try { files = readdirSync(dirPath); } catch { continue; }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const filePath = join(dirPath, file);
    let content = readFileSync(filePath, "utf8");
    let changed = false;

    for (const [oldId, newId] of Object.entries(charIdMap)) {
      if (newId === null) continue;
      if (content.includes(oldId)) {
        content = content.replaceAll(oldId, newId);
        changed = true;
      }
    }
    // remove stale refs from YAML arrays
    for (const stale of STALE_IDS) {
      const staleRef = `char-${stale}`;
      if (content.includes(staleRef)) {
        content = content.replace(new RegExp(`\\s*-\\s*"${staleRef}"`, "g"), "");
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(filePath, content, "utf8");
      updatedFiles++;
    }
  }
}
console.log(`  Updated ${updatedFiles} content files`);

console.log("\nDone. Run npm run build to verify.");
