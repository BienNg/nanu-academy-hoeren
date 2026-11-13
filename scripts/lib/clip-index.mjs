/**
 * Shared by build-clip-index.mjs, check-clip-duplicates.mjs and the content
 * check: reads every Lektion in src/data/levels/, in teaching order, and
 * renders the per-level clip index in src/data/clip-index/.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const levelsDataDir = join(repoRoot, "src/data/levels");
export const clipIndexDir = join(repoRoot, "src/data/clip-index");

/** Verb-card fields on a clip, with the tense name used in the index and reports. */
export const VERB_CARD_FIELDS = [
  { field: "conjugation", tense: "Präsens", prefix: "p" },
  { field: "perfectConjugation", tense: "Perfekt", prefix: "k" },
  { field: "praeteritumConjugation", tense: "Präteritum", prefix: "t" },
];

const ARTICLES = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer"]);

/** Exact match key: same text after trimming, collapsing spaces and lowercasing. */
export function exactKey(script) {
  return String(script).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Near-match key: also ignores punctuation and a leading article ("die Küche" ~ "Küche."). */
export function looseKey(script) {
  const words = exactKey(script)
    .replace(/[.,!?;:"„“”'‚‘’()–—…-]/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

/** "a1-2" → "A1.2" */
export function levelLabel(level) {
  return level.toUpperCase().replace("-", ".");
}

/** "a1-2", 5 → "a1-2/5" */
export function lessonId(level, lektion) {
  return `${level}/${lektion}`;
}

/** Teaching order: levels sorted by slug (a1-1, a1-2, a2-1, …), Lektionen by number. */
export function loadLessons() {
  const lessons = [];
  const levels = readdirSync(levelsDataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const level of levels) {
    const dir = join(levelsDataDir, level);
    const files = readdirSync(dir)
      .map((name) => ({ name, match: /^lektion-(\d+)\.json$/.exec(name) }))
      .filter((file) => file.match)
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dir, file.name), "utf8"));
      const clips = Array.isArray(data) ? data : (data.clips ?? []);
      lessons.push({ level, lektion: Number(file.match[1]), clips });
    }
  }
  return lessons;
}

/** Position of a lesson in teaching order, for "comes before" comparisons. */
export function lessonRank(level, lektion) {
  return `${level}#${String(lektion).padStart(3, "0")}`;
}

/** Infinitive of a Perfekt card, read from "Partizip II của <verb>" in its gloss; null if missing. */
export function perfektInfinitive(clip) {
  const match = /Partizip II của (\S+)/.exec(clip.translationVi ?? "");
  return match ? match[1].replace(/[),;]+$/, "") : null;
}

/**
 * What a clip is: a verb card (with tense and infinitive), a sentence (ends in
 * . ? or !), or a word/phrase.
 */
export function classifyClip(clip) {
  for (const { field, tense } of VERB_CARD_FIELDS) {
    if (Array.isArray(clip[field]) && clip[field].length > 0) {
      const infinitive = tense === "Perfekt" ? perfektInfinitive(clip) : clip.script.trim();
      return { kind: "verb", tense, infinitive };
    }
  }
  return { kind: /[.?!]["“”]?$/.test(String(clip.script).trim()) ? "sentence" : "word" };
}

/**
 * Every distinct script with the lessons it appears in, plus verb cards by
 * tense and infinitive, for all lessons that pass `include`.
 */
export function collectContent(lessons, include = () => true) {
  const scripts = new Map(); // exactKey → { script, translationVi, kind, lessons: [] }
  const verbCards = new Map(); // `${tense}|${infinitive}` → { tense, infinitive, script, lessons: [] }
  const unparsedPerfekt = [];
  for (const lesson of lessons) {
    if (!include(lesson)) continue;
    const id = lessonId(lesson.level, lesson.lektion);
    for (const clip of lesson.clips) {
      if (typeof clip.script !== "string" || clip.script.trim() === "") continue;
      const info = classifyClip(clip);
      const key = exactKey(clip.script);
      const entry = scripts.get(key);
      if (entry) {
        if (!entry.lessons.includes(id)) entry.lessons.push(id);
      } else {
        scripts.set(key, {
          script: clip.script.trim(),
          translationVi: clip.translationVi ?? "",
          kind: info.kind,
          lessons: [id],
        });
      }
      if (info.kind === "verb") {
        if (!info.infinitive) {
          unparsedPerfekt.push(`${id}: ${clip.script}`);
          continue;
        }
        const cardKey = `${info.tense}|${exactKey(info.infinitive)}`;
        const card = verbCards.get(cardKey);
        if (card) {
          if (!card.lessons.includes(id)) card.lessons.push(id);
        } else {
          verbCards.set(cardKey, { tense: info.tense, infinitive: info.infinitive, script: clip.script.trim(), lessons: [id] });
        }
      }
    }
  }
  return { scripts, verbCards, unparsedPerfekt };
}

/**
 * Alphabetical order without Intl, so the index is byte-identical on every
 * machine (the content check compares it byte for byte): umlauts sort with
 * their base letter, ties fall back to plain code point order.
 */
function sortKey(text) {
  return text.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
}
const collator = {
  compare(a, b) {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  },
};

function lessonList(ids, level) {
  // Inside a level's own index, "a1-1/15" is shortened to "L15".
  return ids.map((id) => (id.startsWith(`${level}/`) ? `L${id.slice(level.length + 1)}` : id)).join(",");
}

/** The Markdown index for one level, or null when the level has no clips yet. */
export function renderLevelIndex(level, lessons) {
  const levelLessons = lessons.filter((lesson) => lesson.level === level);
  const clipCount = levelLessons.reduce((sum, lesson) => sum + lesson.clips.length, 0);
  if (clipCount === 0) return null;
  const filled = levelLessons.filter((lesson) => lesson.clips.length > 0).map((lesson) => lesson.lektion);
  const { scripts, verbCards, unparsedPerfekt } = collectContent(lessons, (lesson) => lesson.level === level);

  const out = [];
  out.push(`# Clip index: ${levelLabel(level)}`);
  out.push("");
  out.push("Generated by `node scripts/build-clip-index.mjs` from `src/data/levels/" + level + "/`. Do not edit by hand.");
  out.push(
    `Lektionen with clips: ${filled.join(", ")}. ${clipCount} clips, ${scripts.size} different scripts. ` +
      "Each line gives every Lektion a script appears in (first one first). Lists are sorted alphabetically.",
  );

  out.push("");
  out.push("## Verb cards");
  for (const { tense } of VERB_CARD_FIELDS) {
    const cards = [...verbCards.values()]
      .filter((card) => card.tense === tense)
      .sort((a, b) => collator.compare(a.infinitive, b.infinitive));
    if (cards.length === 0) continue;
    out.push("");
    const shape = tense === "Perfekt" ? "Partizip II (infinitive)" : "infinitive";
    out.push(`### ${tense}: ${shape} → Lektion (${cards.length})`);
    out.push("");
    for (const card of cards) {
      const name = tense === "Perfekt" ? `${card.script} (${card.infinitive})` : card.infinitive;
      out.push(`- ${name} ${lessonList(card.lessons, level)}`);
    }
  }
  if (unparsedPerfekt.length > 0) {
    out.push("");
    out.push("Perfekt cards without \"Partizip II của <verb>\" in the gloss (infinitive unknown):");
    for (const item of unparsedPerfekt) out.push(`- ${item}`);
  }

  const words = [...scripts.values()]
    .filter((entry) => entry.kind === "word")
    .sort((a, b) => collator.compare(looseKey(a.script), looseKey(b.script)));
  out.push("");
  out.push(`## Words and phrases (${words.length})`);
  out.push("");
  for (const entry of words) {
    const vi = entry.translationVi ? ` — ${entry.translationVi}` : "";
    out.push(`- ${entry.script}${vi} ${lessonList(entry.lessons, level)}`);
  }

  const sentences = [...scripts.values()]
    .filter((entry) => entry.kind === "sentence")
    .sort((a, b) => collator.compare(looseKey(a.script), looseKey(b.script)));
  out.push("");
  out.push(`## Sentences (${sentences.length})`);
  out.push("");
  for (const entry of sentences) {
    out.push(`- ${entry.script} ${lessonList(entry.lessons, level)}`);
  }
  out.push("");
  return out.join("\n");
}

/** Every level index as { level, path, content }; levels without clips are left out. */
export function renderAllIndexes(lessons = loadLessons()) {
  const levels = [...new Set(lessons.map((lesson) => lesson.level))];
  return levels
    .map((level) => ({ level, path: join(clipIndexDir, `${level}.md`), content: renderLevelIndex(level, lessons) }))
    .filter((entry) => entry.content !== null);
}

/** Index files on disk that are missing, out of date, or left over for a level with no clips. */
export function staleIndexFiles(lessons = loadLessons()) {
  const expected = renderAllIndexes(lessons);
  const problems = [];
  for (const { path, content } of expected) {
    if (!existsSync(path)) problems.push({ path, reason: "missing" });
    else if (readFileSync(path, "utf8") !== content) problems.push({ path, reason: "out of date" });
  }
  if (existsSync(clipIndexDir)) {
    const wanted = new Set(expected.map((entry) => entry.path));
    for (const name of readdirSync(clipIndexDir)) {
      const path = join(clipIndexDir, name);
      if (name.endsWith(".md") && !wanted.has(path)) problems.push({ path, reason: "no clips in that level" });
    }
  }
  return problems;
}
