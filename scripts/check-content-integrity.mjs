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
    (name) => name !== "ausbildung" && name !== "living",
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

const ausbildungCount = checkAusbildung();
const levelCount = checkLevels();
const livingCount = checkLiving();

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
