import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ausbildungDataDir = join(repoRoot, "src/data/ausbildung");
const ausbildungAudioRoot = join(repoRoot, "public/audio/ausbildung");
const levelsDataDir = join(repoRoot, "src/data/levels");
const levelsAudioRoot = join(repoRoot, "public/audio");
const livingDataDir = join(repoRoot, "src/data/living");
const livingAudioRoot = join(repoRoot, "public/audio/living");
const livingImageRoot = join(repoRoot, "public/images/living");
const grammarDataDir = join(repoRoot, "src/data/grammar");
const grammarAudioRoot = join(repoRoot, "public/audio/grammar");
const chaptersPath = join(repoRoot, "src/data/chapters.json");

const errors = [];
const skippedMissingAudio = [];
const skippedMissingImages = [];

function rel(absolutePath) {
  return absolutePath.replace(`${repoRoot}/`, "");
}

/**
 * macOS APFS returns NFD names from readdir while JSON and git store NFC
 * (`ü` vs `u` + combining diaeresis). Compare both sides in NFC so a real
 * matching file is not reported as an orphan.
 */
function nfc(name) {
  return name.normalize("NFC");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listJsonFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function listDirs(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

/**
 * Pair a clips JSON file with its audio folder.
 * Clips listed in JSON without an MP3 are skipped (not an error).
 * Reports orphaned MP3s on disk that have no JSON entry.
 */
function checkContentFile(jsonPath, audioDir) {
  const jsonRel = rel(jsonPath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not parse ${jsonRel}: ${message}`);
    return;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.clips)) {
    errors.push(`${jsonRel} must be an object with a "clips" array`);
    return;
  }

  const listedFilenames = new Set();

  parsed.clips.forEach((clip, index) => {
    if (
      !isRecord(clip) ||
      typeof clip.filename !== "string" ||
      clip.filename.length === 0
    ) {
      errors.push(
        `${jsonRel} clips[${index}] is missing a non-empty "filename" string`,
      );
      return;
    }

    if (typeof clip.script !== "string" || clip.script.length === 0) {
      errors.push(
        `${jsonRel} clips[${index}] is missing a non-empty "script" string`,
      );
    }

    if (
      clip.noSentenceOrder !== undefined &&
      typeof clip.noSentenceOrder !== "boolean"
    ) {
      errors.push(
        `${jsonRel} clips[${index}] "noSentenceOrder" must be true or false`,
      );
    }

    checkClipGaps(clip, `${jsonRel} clips[${index}]`);

    listedFilenames.add(nfc(clip.filename));
    const audioPath = join(audioDir, clip.filename);
    if (!existsSync(audioPath)) {
      skippedMissingAudio.push(
        `${rel(audioPath)} (listed in ${jsonRel})`,
      );
    }
  });

  if (parsed.videos !== undefined) {
    if (!Array.isArray(parsed.videos)) {
      errors.push(`${jsonRel} "videos" must be an array when present`);
    } else {
      parsed.videos.forEach((video, index) => {
        if (
          !isRecord(video) ||
          typeof video.title !== "string" ||
          video.title.trim().length === 0
        ) {
          errors.push(
            `${jsonRel} videos[${index}] is missing a non-empty "title" string`,
          );
        }
        if (
          !isRecord(video) ||
          typeof video.url !== "string" ||
          video.url.trim().length === 0
        ) {
          errors.push(
            `${jsonRel} videos[${index}] is missing a non-empty "url" string`,
          );
        }
        if (
          isRecord(video) &&
          video.titleVi !== undefined &&
          (typeof video.titleVi !== "string" || video.titleVi.trim().length === 0)
        ) {
          errors.push(
            `${jsonRel} videos[${index}] "titleVi" must be a non-empty string when present`,
          );
        }
      });
    }
  }

  if (parsed.grammar !== undefined) {
    checkLessonGrammar(parsed.grammar, jsonRel, audioDir, listedFilenames);
  }

  if (!existsSync(audioDir)) {
    return;
  }

  const mp3Files = readdirSync(audioDir).filter((name) => name.endsWith(".mp3"));
  for (const mp3Name of mp3Files) {
    if (!listedFilenames.has(nfc(mp3Name))) {
      errors.push(
        `Orphaned audio file: ${rel(join(audioDir, mp3Name))} (no matching entry in ${jsonRel})`,
      );
    }
  }
}

function checkAusbildung() {
  if (!existsSync(ausbildungDataDir)) {
    errors.push(`Missing content directory: ${rel(ausbildungDataDir)}`);
    return 0;
  }

  const jsonFiles = listJsonFiles(ausbildungDataDir);
  if (jsonFiles.length === 0) {
    errors.push(`No JSON files found in ${rel(ausbildungDataDir)}`);
    return 0;
  }

  for (const jsonName of jsonFiles) {
    const folder = jsonName.slice(0, -".json".length);
    checkContentFile(
      join(ausbildungDataDir, jsonName),
      join(ausbildungAudioRoot, folder),
    );
  }

  return jsonFiles.length;
}

/** Words of a script as grammar-gaps.ts sees them: edge punctuation off, lowercased. */
function scriptWords(script) {
  return script
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[.,?!:;"'„“”‚‘’«»…()]+|[.,?!:;"'„“”‚‘’«»…()]+$/g, "").toLowerCase())
    .filter(Boolean);
}

/** Topic ids from src/data/grammar/topics.json, filled by checkGrammar. */
const grammarTopicIds = new Set();

/**
 * src/data/grammar: every topic needs an id, a label, a "from" Lektion that
 * exists in chapters.json, and sets of 2+ forms or "verbs": true. The verb
 * table maps each infinitive to person → form strings.
 */
function checkGrammar() {
  const topicsPath = join(grammarDataDir, "topics.json");
  const verbsPath = join(grammarDataDir, "verbs.json");
  let lessonKeys = new Set();
  try {
    const chapters = JSON.parse(readFileSync(chaptersPath, "utf8"));
    lessonKeys = new Set(
      chapters.flatMap((level) => (level.chapters ?? []).map((chapter) => `${level.slug}/${chapter.slug}`)),
    );
  } catch {
    errors.push(`Could not read ${rel(chaptersPath)} to check grammar topics`);
  }

  let topicsFile;
  try {
    topicsFile = JSON.parse(readFileSync(topicsPath, "utf8"));
  } catch (error) {
    errors.push(`Could not parse ${rel(topicsPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!isRecord(topicsFile) || !Array.isArray(topicsFile.topics)) {
    errors.push(`${rel(topicsPath)} must be an object with a "topics" array`);
    return;
  }
  topicsFile.topics.forEach((topic, index) => {
    const where = `${rel(topicsPath)} topics[${index}]`;
    if (!isRecord(topic) || typeof topic.id !== "string" || !SLUG.test(topic.id)) {
      errors.push(`${where} needs a lowercase "id" like "possessiv"`);
      return;
    }
    if (grammarTopicIds.has(topic.id)) errors.push(`${where} repeats topic id "${topic.id}"`);
    grammarTopicIds.add(topic.id);
    if (typeof topic.labelVi !== "string" || topic.labelVi.trim() === "") {
      errors.push(`${where} is missing a non-empty "labelVi"`);
    }
    if (typeof topic.from !== "string" || !lessonKeys.has(topic.from)) {
      errors.push(`${where} "from" must be a Lektion from chapters.json, like "a1-1/lektion-5"`);
    }
    for (const flag of ["auto", "onlyBeforeNoun", "verbs"]) {
      if (topic[flag] !== undefined && typeof topic[flag] !== "boolean") {
        errors.push(`${where} "${flag}" must be true or false`);
      }
    }
    if (topic.ruleVi !== undefined && typeof topic.ruleVi !== "string") {
      errors.push(`${where} "ruleVi" must be a string`);
    }
    if (topic.sets !== undefined) {
      const valid =
        Array.isArray(topic.sets) &&
        topic.sets.every(
          (set) =>
            Array.isArray(set) &&
            set.length >= 2 &&
            set.every((form) => typeof form === "string" && form.trim() !== "" && !/\s/.test(form.trim())),
        );
      if (!valid) errors.push(`${where} "sets" must be a list of sets, each with 2+ single words`);
    }
    if (topic.sets === undefined && topic.verbs !== true) {
      errors.push(`${where} needs "sets" or "verbs": true`);
    }
  });

  let verbs;
  try {
    verbs = JSON.parse(readFileSync(verbsPath, "utf8"));
  } catch (error) {
    errors.push(`Could not parse ${rel(verbsPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!isRecord(verbs)) {
    errors.push(`${rel(verbsPath)} must be an object of infinitive → { person: form }`);
    return;
  }
  for (const [infinitive, forms] of Object.entries(verbs)) {
    const valid =
      isRecord(forms) &&
      Object.values(forms).length >= 2 &&
      Object.values(forms).every((form) => typeof form === "string" && form.trim() !== "" && !/\s/.test(form.trim()));
    if (!valid) errors.push(`${rel(verbsPath)} "${infinitive}" must map persons to single-word forms`);
  }
}

const GRAMMAR_TENSES = ["praesens", "perfekt", "praeteritum"];
const STORED_TENSES = ["praesens", "praeteritum"];

/** src/data/grammar/tenses.json, filled by checkTenses. Null when it is missing or broken. */
let tenseTables = null;
/** Verbs some Lektion teaches, so their table audio is not orphaned. */
const taughtVerbs = new Set();

/**
 * tenses.json: persons with id/label/say, the three tenses, and per verb a
 * Präsens and Präteritum form for every person, a one-word Partizip and an
 * aux that is itself in the table.
 */
function checkTenses() {
  const tensesPath = join(grammarDataDir, "tenses.json");
  const where = rel(tensesPath);
  if (!existsSync(tensesPath)) return;
  let file;
  try {
    file = JSON.parse(readFileSync(tensesPath, "utf8"));
  } catch (error) {
    errors.push(`Could not parse ${where}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!isRecord(file) || !Array.isArray(file.persons) || !Array.isArray(file.tenses) || !isRecord(file.verbs)) {
    errors.push(`${where} must have "persons", "tenses" and "verbs"`);
    return;
  }
  const personIds = [];
  file.persons.forEach((person, index) => {
    if (!isRecord(person) || typeof person.id !== "string" || !SLUG.test(person.id)) {
      errors.push(`${where} persons[${index}] needs a lowercase "id"`);
      return;
    }
    for (const key of ["label", "say"]) {
      if (typeof person[key] !== "string" || person[key].trim() === "") {
        errors.push(`${where} persons[${index}] is missing a non-empty "${key}"`);
      }
    }
    personIds.push(person.id);
  });
  const tenseIds = file.tenses.map((tense) => (isRecord(tense) ? tense.id : null));
  for (const id of GRAMMAR_TENSES) {
    if (!tenseIds.includes(id)) errors.push(`${where} "tenses" is missing "${id}"`);
  }
  for (const [infinitive, verb] of Object.entries(file.verbs)) {
    const verbWhere = `${where} verbs.${infinitive}`;
    if (!isRecord(verb)) {
      errors.push(`${verbWhere} must be an object`);
      continue;
    }
    for (const tense of STORED_TENSES) {
      for (const personId of personIds) {
        const form = isRecord(verb[tense]) ? verb[tense][personId] : undefined;
        if (typeof form !== "string" || form.trim() === "" || /\s/.test(form.trim())) {
          errors.push(`${verbWhere}.${tense} needs a one-word form for "${personId}"`);
        }
      }
    }
    if (typeof verb.partizip !== "string" || verb.partizip.trim() === "" || /\s/.test(verb.partizip.trim())) {
      errors.push(`${verbWhere} needs a one-word "partizip"`);
    }
    if (typeof verb.aux !== "string" || !isRecord(file.verbs[verb.aux])) {
      errors.push(`${verbWhere} "aux" must be a verb in ${where}, like "haben"`);
    }
  }
  tenseTables = { personIds, verbs: file.verbs };
}

/**
 * A Lektion's "grammar" block: topics with known verbs, tips, examples with
 * audio next to the Lektion's clips, and transform/error drills.
 */
function checkLessonGrammar(grammar, jsonRel, audioDir, listedFilenames) {
  if (!Array.isArray(grammar)) {
    errors.push(`${jsonRel} "grammar" must be a list of topics`);
    return;
  }
  const topicIds = new Set();
  grammar.forEach((topic, topicIndex) => {
    const where = `${jsonRel} grammar[${topicIndex}]`;
    if (!isRecord(topic) || typeof topic.id !== "string" || !SLUG.test(topic.id)) {
      errors.push(`${where} needs a lowercase "id" like "vergangenheit-haben-sein"`);
      return;
    }
    if (topicIds.has(topic.id)) errors.push(`${where} repeats topic id "${topic.id}"`);
    topicIds.add(topic.id);
    if (typeof topic.titleVi !== "string" || topic.titleVi.trim() === "") {
      errors.push(`${where} is missing a non-empty "titleVi"`);
    }
    const verbs = Array.isArray(topic.verbs) ? topic.verbs : [];
    if (verbs.length === 0) errors.push(`${where} "verbs" must list at least one verb`);
    for (const verb of verbs) {
      if (!tenseTables || !isRecord(tenseTables.verbs[verb])) {
        errors.push(`${where} verb "${verb}" is not in src/data/grammar/tenses.json`);
      } else {
        taughtVerbs.add(verb);
      }
    }
    const inTopic = (verb, itemWhere) => {
      if (verb !== undefined && !verbs.includes(verb)) {
        errors.push(`${itemWhere} "verb" "${verb}" is not in the topic's "verbs"`);
      }
    };
    const tense = (value, itemWhere) => {
      if (!GRAMMAR_TENSES.includes(value)) {
        errors.push(`${itemWhere} "tense" must be one of ${GRAMMAR_TENSES.join(", ")}`);
      }
    };

    const tipIds = new Set();
    (Array.isArray(topic.tips) ? topic.tips : []).forEach((tip, index) => {
      const tipWhere = `${where} tips[${index}]`;
      if (!isRecord(tip) || typeof tip.id !== "string" || !SLUG.test(tip.id)) {
        errors.push(`${tipWhere} needs a lowercase "id"`);
        return;
      }
      if (tipIds.has(tip.id)) errors.push(`${tipWhere} repeats tip id "${tip.id}"`);
      tipIds.add(tip.id);
      for (const key of ["titleVi", "textVi"]) {
        if (typeof tip[key] !== "string" || tip[key].trim() === "") {
          errors.push(`${tipWhere} is missing a non-empty "${key}"`);
        }
      }
      inTopic(tip.verb, tipWhere);
    });

    (Array.isArray(topic.examples) ? topic.examples : []).forEach((example, index) => {
      const exampleWhere = `${where} examples[${index}]`;
      if (!isRecord(example) || typeof example.filename !== "string" || example.filename.length === 0) {
        errors.push(`${exampleWhere} is missing a non-empty "filename" string`);
        return;
      }
      for (const key of ["script", "translationVi"]) {
        if (typeof example[key] !== "string" || example[key].trim() === "") {
          errors.push(`${exampleWhere} is missing a non-empty "${key}"`);
        }
      }
      inTopic(example.verb, exampleWhere);
      tense(example.tense, exampleWhere);
      if (tenseTables && !tenseTables.personIds.includes(example.person)) {
        errors.push(`${exampleWhere} "person" must be one of ${tenseTables.personIds.join(", ")}`);
      }
      if (listedFilenames.has(nfc(example.filename))) {
        errors.push(`${exampleWhere} repeats filename "${example.filename}"`);
      }
      listedFilenames.add(nfc(example.filename));
      if (!existsSync(join(audioDir, example.filename))) {
        skippedMissingAudio.push(`${rel(join(audioDir, example.filename))} (listed in ${exampleWhere})`);
      }
    });

    (Array.isArray(topic.drills) ? topic.drills : []).forEach((drill, index) => {
      const drillWhere = `${where} drills[${index}]`;
      if (!isRecord(drill)) {
        errors.push(`${drillWhere} must be an object`);
        return;
      }
      inTopic(drill.verb, drillWhere);
      const text = (key) => typeof drill[key] === "string" && drill[key].trim() !== "";
      if (drill.type === "transform") {
        tense(drill.tense, drillWhere);
        for (const key of ["from", "to", "translationVi"]) {
          if (!text(key)) errors.push(`${drillWhere} is missing a non-empty "${key}"`);
        }
        if (text("from") && text("to") && drill.from.trim() === drill.to.trim()) {
          errors.push(`${drillWhere} "from" and "to" are the same sentence`);
        }
      } else if (drill.type === "error") {
        if (!text("script")) errors.push(`${drillWhere} is missing a non-empty "script"`);
        if (drill.fix !== undefined) {
          if (!text("fix")) errors.push(`${drillWhere} "fix" must be a non-empty sentence`);
          else if (text("script") && drill.fix.trim() === drill.script.trim()) {
            errors.push(`${drillWhere} "fix" equals "script"; leave "fix" out for a correct sentence`);
          }
          if (!text("whyVi")) errors.push(`${drillWhere} needs a "whyVi" when it has a "fix"`);
        }
      } else {
        errors.push(`${drillWhere} "type" must be "transform" or "error"`);
      }
    });
  });
}

/**
 * public/audio/grammar/<verb>/<tense>-<person>.mp3: table rows of verbs a
 * Lektion teaches. Missing rows are skipped; files no row needs are orphans.
 */
function checkGrammarAudio() {
  if (!tenseTables) return;
  const expected = new Set();
  for (const verb of taughtVerbs) {
    for (const tense of GRAMMAR_TENSES) {
      for (const personId of tenseTables.personIds) {
        const path = join(grammarAudioRoot, verb, `${tense}-${personId}.mp3`);
        expected.add(path);
        if (!existsSync(path)) skippedMissingAudio.push(`${rel(path)} (table row)`);
      }
    }
  }
  for (const verb of listDirs(grammarAudioRoot)) {
    const dir = join(grammarAudioRoot, verb);
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".mp3"))) {
      if (!expected.has(join(dir, name))) {
        errors.push(`Orphaned audio file: ${rel(join(dir, name))} (no taught verb, tense and person)`);
      }
    }
  }
}

/** A clip's "gaps" must name words in its script and known topics; "noGaps" is true or a word list. */
function checkClipGaps(clip, where) {
  if (clip.noGaps !== undefined) {
    const valid =
      typeof clip.noGaps === "boolean" ||
      (Array.isArray(clip.noGaps) && clip.noGaps.every((word) => typeof word === "string" && word.trim() !== ""));
    if (!valid) errors.push(`${where} "noGaps" must be true, false, or a list of words`);
  }
  if (clip.gaps === undefined) return;
  if (!Array.isArray(clip.gaps)) {
    errors.push(`${where} "gaps" must be a list like [{ "word": "deine" }]`);
    return;
  }
  const words = typeof clip.script === "string" ? scriptWords(clip.script) : [];
  clip.gaps.forEach((gap, gapIndex) => {
    const gapWhere = `${where} gaps[${gapIndex}]`;
    if (!isRecord(gap) || typeof gap.word !== "string" || gap.word.trim() === "") {
      errors.push(`${gapWhere} needs a "word" from the script`);
      return;
    }
    const occurrence = gap.occurrence ?? 1;
    if (!Number.isInteger(occurrence) || occurrence < 1) {
      errors.push(`${gapWhere} "occurrence" must be a whole number from 1`);
    } else {
      const key = scriptWords(gap.word)[0] ?? "";
      if (words.filter((word) => word === key).length < occurrence) {
        errors.push(`${gapWhere} "${gap.word}" is not in the script${occurrence > 1 ? ` ${occurrence} times` : ""}`);
      }
    }
    if (gap.topic !== undefined && !grammarTopicIds.has(gap.topic)) {
      errors.push(`${gapWhere} "topic" "${gap.topic}" is not in src/data/grammar/topics.json`);
    }
    if (
      gap.options !== undefined &&
      !(Array.isArray(gap.options) && gap.options.length >= 1 && gap.options.every((option) => typeof option === "string"))
    ) {
      errors.push(`${gapWhere} "options" must be a list of words`);
    }
    if (gap.whyVi !== undefined && typeof gap.whyVi !== "string") {
      errors.push(`${gapWhere} "whyVi" must be a string`);
    }
  });
}

function checkLevels() {
  if (!existsSync(levelsDataDir)) {
    errors.push(`Missing content directory: ${rel(levelsDataDir)}`);
    return 0;
  }

  const levelSlugs = listDirs(levelsDataDir);
  if (levelSlugs.length === 0) {
    errors.push(`No level folders found in ${rel(levelsDataDir)}`);
    return 0;
  }

  let jsonCount = 0;
  const checkedAudioDirs = new Set();

  for (const levelSlug of levelSlugs) {
    const levelDataDir = join(levelsDataDir, levelSlug);
    const jsonFiles = listJsonFiles(levelDataDir);
    if (jsonFiles.length === 0) {
      errors.push(`No JSON files found in ${rel(levelDataDir)}`);
      continue;
    }

    for (const jsonName of jsonFiles) {
      const chapterSlug = jsonName.slice(0, -".json".length);
      const audioDir = join(levelsAudioRoot, levelSlug, chapterSlug);
      checkedAudioDirs.add(audioDir);
      checkContentFile(join(levelDataDir, jsonName), audioDir);
      jsonCount += 1;
    }
  }

  // Audio sitting under a level with no matching Lektion JSON.
  for (const levelSlug of listDirs(levelsAudioRoot).filter(
    (name) => name !== "ausbildung" && name !== "living" && name !== "grammar",
  )) {
    const levelAudioDir = join(levelsAudioRoot, levelSlug);
    for (const chapterSlug of listDirs(levelAudioDir)) {
      const audioDir = join(levelAudioDir, chapterSlug);
      if (checkedAudioDirs.has(audioDir)) {
        continue;
      }
      const mp3Files = readdirSync(audioDir).filter((name) =>
        name.endsWith(".mp3"),
      );
      for (const mp3Name of mp3Files) {
        errors.push(
          `Orphaned audio file: ${rel(join(audioDir, mp3Name))} (no matching ${levelSlug}/${chapterSlug}.json)`,
        );
      }
    }
  }

  return jsonCount;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Checks the extra Leben-in-Deutschland clip fields. */
function checkLivingClip(clip, where, workplaceSlug) {
  if (clip.answer !== undefined) {
    if (typeof clip.answer !== "string" || !/\d/.test(clip.answer)) {
      errors.push(`${where} "answer" must be a string with a number, e.g. "35,50" or "15:30"`);
    }
    if (clip.replies !== undefined) {
      errors.push(`${where} has both "answer" and "replies"; pick one card type`);
    }
  }
  if (clip.replies !== undefined) {
    if (!Array.isArray(clip.replies) || clip.replies.length < 2) {
      errors.push(`${where} "replies" must be an array with at least 2 replies`);
    } else {
      const bad = clip.replies.some(
        (reply) => !isRecord(reply) || typeof reply.text !== "string" || reply.text.trim() === "",
      );
      if (bad) errors.push(`${where} every reply needs a non-empty "text"`);
      const correct = clip.replies.filter((reply) => isRecord(reply) && reply.correct === true).length;
      if (correct !== 1) errors.push(`${where} "replies" needs exactly one "correct": true`);
    }
  }
  if (clip.image !== undefined) {
    if (typeof clip.image !== "string" || clip.image.trim() === "" || /[\\/]/.test(clip.image)) {
      errors.push(`${where} "image" must be a file name in public/images/living/${workplaceSlug}/`);
    } else if (!existsSync(join(livingImageRoot, workplaceSlug, clip.image))) {
      skippedMissingImages.push(`${rel(join(livingImageRoot, workplaceSlug, clip.image))} (listed in ${where})`);
    }
  }
}

function checkLiving() {
  if (!existsSync(livingDataDir)) return 0;
  const catalogPath = join(livingDataDir, "workplaces.json");
  let catalog = [];
  try {
    catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not parse ${rel(catalogPath)}: ${message}`);
    return 0;
  }
  if (!Array.isArray(catalog)) {
    errors.push(`${rel(catalogPath)} must be an array of workplaces`);
    return 0;
  }
  const slugs = new Set();
  catalog.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.slug !== "string" || !SLUG.test(entry.slug)) {
      errors.push(`${rel(catalogPath)}[${index}] needs a lowercase "slug" like "nagelstudio"`);
      return;
    }
    if (typeof entry.label !== "string" || entry.label.trim() === "") {
      errors.push(`${rel(catalogPath)}[${index}] is missing a non-empty "label"`);
    }
    slugs.add(entry.slug);
  });

  let fileCount = 0;
  for (const jsonName of listJsonFiles(livingDataDir)) {
    if (jsonName === "workplaces.json") continue;
    const workplaceSlug = jsonName.slice(0, -".json".length);
    const jsonPath = join(livingDataDir, jsonName);
    const jsonRel = rel(jsonPath);
    fileCount += 1;
    if (!slugs.has(workplaceSlug)) {
      errors.push(`${jsonRel} has no matching "slug" in ${rel(catalogPath)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Could not parse ${jsonRel}: ${message}`);
      continue;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.scenes)) {
      errors.push(`${jsonRel} must be an object with a "scenes" array`);
      continue;
    }
    const audioDir = join(livingAudioRoot, workplaceSlug);
    const listedFilenames = new Set();
    const sceneIds = new Set();
    parsed.scenes.forEach((scene, sceneIndex) => {
      const sceneWhere = `${jsonRel} scenes[${sceneIndex}]`;
      if (!isRecord(scene)) {
        errors.push(`${sceneWhere} must be an object`);
        return;
      }
      if (typeof scene.id !== "string" || !SLUG.test(scene.id)) {
        errors.push(`${sceneWhere} needs a lowercase "id" like "bezahlen"`);
      } else if (sceneIds.has(scene.id)) {
        errors.push(`${sceneWhere} repeats scene id "${scene.id}"`);
      } else {
        sceneIds.add(scene.id);
      }
      if (typeof scene.label !== "string" || scene.label.trim() === "") {
        errors.push(`${sceneWhere} is missing a non-empty "label"`);
      }
      if (!Array.isArray(scene.clips)) {
        errors.push(`${sceneWhere} must have a "clips" array`);
        return;
      }
      scene.clips.forEach((clip, clipIndex) => {
        const where = `${sceneWhere} clips[${clipIndex}]`;
        if (!isRecord(clip) || typeof clip.filename !== "string" || clip.filename.length === 0) {
          errors.push(`${where} is missing a non-empty "filename" string`);
          return;
        }
        if (typeof clip.script !== "string" || clip.script.length === 0) {
          errors.push(`${where} is missing a non-empty "script" string`);
        }
        if (listedFilenames.has(nfc(clip.filename))) {
          errors.push(`${where} repeats filename "${clip.filename}"`);
        }
        listedFilenames.add(nfc(clip.filename));
        checkLivingClip(clip, where, workplaceSlug);
        if (!existsSync(join(audioDir, clip.filename))) {
          skippedMissingAudio.push(`${rel(join(audioDir, clip.filename))} (listed in ${jsonRel})`);
        }
      });
    });
    if (existsSync(audioDir)) {
      for (const mp3Name of readdirSync(audioDir).filter((name) => name.endsWith(".mp3"))) {
        if (!listedFilenames.has(nfc(mp3Name))) {
          errors.push(
            `Orphaned audio file: ${rel(join(audioDir, mp3Name))} (no matching entry in ${jsonRel})`,
          );
        }
      }
    }
  }
  return fileCount;
}

checkGrammar();
checkTenses();
const ausbildungCount = checkAusbildung();
const levelCount = checkLevels();
const livingCount = checkLiving();
checkGrammarAudio();

if (errors.length > 0) {
  console.error("Content integrity check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Content integrity OK: ${ausbildungCount} Ausbildung file(s), ${levelCount} Lektion file(s), ${livingCount} Leben-in-Deutschland file(s).`,
);
if (skippedMissingImages.length > 0) {
  console.log(`Missing ${skippedMissingImages.length} image(s); those pairing cards show text instead.`);
}
if (skippedMissingAudio.length > 0) {
  console.log(
    `Skipped ${skippedMissingAudio.length} clip(s) with missing audio.`,
  );
}
