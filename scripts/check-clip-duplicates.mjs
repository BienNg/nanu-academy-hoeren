/**
 * Checks draft clips for a new Lektion against everything taught before it.
 *
 *   node scripts/check-clip-duplicates.mjs <draft.json> [--lesson a1-2/5]
 *
 * The draft is `{ "clips": [...] }` or a bare array, in the Lektion JSON format.
 * The target Lektion comes from --lesson, or else from the first filename
 * (a12-tag5-… → a1-2/5). "Before" means every earlier level plus the lower
 * Lektionen of the same level; the target Lektion's own file is ignored.
 *
 * Reports exact repeats, verb cards whose verb and tense were taught already,
 * repeats inside the draft, and near matches (punctuation or an article apart).
 * Exits with 1 when there are exact repeats, verb cards already taught, or
 * repeats inside the draft, so a run can't miss them. Near matches don't fail.
 */
import { readFileSync } from "node:fs";
import {
  classifyClip,
  collectContent,
  exactKey,
  lessonRank,
  levelLabel,
  loadLessons,
  looseKey,
} from "./lib/clip-index.mjs";

function usage(message) {
  if (message) console.error(message);
  console.error("Usage: node scripts/check-clip-duplicates.mjs <draft.json> [--lesson a1-2/5]");
  process.exit(2);
}

const args = process.argv.slice(2);
let draftPath = null;
let lessonArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--lesson") lessonArg = args[++i];
  else if (!draftPath) draftPath = args[i];
  else usage(`Unexpected argument: ${args[i]}`);
}
if (!draftPath) usage();

const draftData = JSON.parse(readFileSync(draftPath, "utf8"));
const draft = Array.isArray(draftData) ? draftData : (draftData.clips ?? []);
if (draft.length === 0) usage(`No clips in ${draftPath}`);

/** "a12-tag5-03-…" → { level: "a1-2", lektion: 5 }; also "a21-lektion10-…". */
function targetFromFilename(filename) {
  const match = /^a(\d)(\d)-(?:tag|lektion)(\d+)-/i.exec(filename ?? "");
  return match ? { level: `a${match[1]}-${match[2]}`, lektion: Number(match[3]) } : null;
}

let target;
if (lessonArg) {
  const match = /^([a-c]\d-\d)\/(\d+)$/i.exec(lessonArg);
  if (!match) usage(`--lesson must look like a1-2/5, got ${lessonArg}`);
  target = { level: match[1].toLowerCase(), lektion: Number(match[2]) };
} else {
  target = targetFromFilename(draft[0].filename);
  if (!target) usage(`Can't tell the Lektion from "${draft[0].filename}"; pass --lesson a1-2/5`);
}

const targetRank = lessonRank(target.level, target.lektion);
const lessons = loadLessons();
const earlier = (lesson) => lessonRank(lesson.level, lesson.lektion) < targetRank;
const { scripts, verbCards } = collectContent(lessons, earlier);
const looseIndex = new Map();
for (const entry of scripts.values()) {
  const key = looseKey(entry.script);
  if (!looseIndex.has(key)) looseIndex.set(key, []);
  looseIndex.get(key).push(entry);
}

const checkedLevels = [...new Set(lessons.filter(earlier).filter((l) => l.clips.length > 0).map((l) => l.level))];
const where = (ids) => ids.join(", ");

const exact = [];
const verbs = [];
const near = [];
const inDraft = [];
const seenInDraft = new Map();

draft.forEach((clip, index) => {
  const label = `#${index + 1} ${clip.filename ?? ""}`.trim();
  const script = String(clip.script ?? "");
  const key = exactKey(script);
  const info = classifyClip(clip);

  // A verb card is judged by verb and tense only: a Präteritum "sein" card is
  // new even though A1.1 already has a Präsens "sein" card with the same script.
  if (info.kind === "verb") {
    if (!info.infinitive) {
      verbs.push(`${label}: ${info.tense} card "${script}" has no "Partizip II của <verb>" in its gloss, so it can't be checked`);
      return;
    }
    const cardKey = `${info.tense}|${exactKey(info.infinitive)}`;
    if (seenInDraft.has(cardKey)) inDraft.push(`${label}: ${info.tense} card for "${info.infinitive}" repeats ${seenInDraft.get(cardKey)}`);
    else seenInDraft.set(cardKey, label);
    const card = verbCards.get(cardKey);
    if (card) verbs.push(`${label}: ${info.tense} card for "${info.infinitive}" already in ${where(card.lessons)}`);
    return;
  }

  if (seenInDraft.has(key)) inDraft.push(`${label}: "${script}" repeats ${seenInDraft.get(key)}`);
  else seenInDraft.set(key, label);

  const hit = scripts.get(key);
  if (hit) {
    exact.push(`${label}: "${script}" already in ${where(hit.lessons)}`);
    return;
  }
  for (const other of looseIndex.get(looseKey(script)) ?? []) {
    near.push(`${label}: "${script}" ~ "${other.script}" in ${where(other.lessons)}`);
  }
});

console.log(
  `Checked ${draft.length} draft clip(s) for ${levelLabel(target.level)} Lektion ${target.lektion} ` +
    `against ${scripts.size} earlier script(s) (${checkedLevels.map(levelLabel).join(", ") || "nothing earlier"}).`,
);
const section = (title, items) => {
  console.log(`\n${title}: ${items.length === 0 ? "none" : ""}`);
  for (const item of items) console.log(`- ${item}`);
};
section("Exact repeats of earlier clips", exact);
section("Verb cards already taught (same verb and tense)", verbs);
section("Repeats inside the draft", inDraft);
section("Near matches to check by hand", near);

process.exit(exact.length > 0 || verbs.length > 0 || inDraft.length > 0 ? 1 : 0);
