import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ausbildungDataDir = join(repoRoot, "src/data/ausbildung");
const ausbildungAudioRoot = join(repoRoot, "public/audio/ausbildung");
const levelsDataDir = join(repoRoot, "src/data/levels");
const levelsAudioRoot = join(repoRoot, "public/audio");

const errors = [];
const skippedMissingAudio = [];

function rel(absolutePath) {
  return absolutePath.replace(`${repoRoot}/`, "");
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

    listedFilenames.add(clip.filename);
    const audioPath = join(audioDir, clip.filename);
    if (!existsSync(audioPath)) {
      skippedMissingAudio.push(
        `${rel(audioPath)} (listed in ${jsonRel})`,
      );
    }
  });

  if (!existsSync(audioDir)) {
    return;
  }

  const mp3Files = readdirSync(audioDir).filter((name) => name.endsWith(".mp3"));
  for (const mp3Name of mp3Files) {
    if (!listedFilenames.has(mp3Name)) {
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
    (name) => name !== "ausbildung",
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

const ausbildungCount = checkAusbildung();
const levelCount = checkLevels();

if (errors.length > 0) {
  console.error("Content integrity check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Content integrity OK: ${ausbildungCount} Ausbildung file(s), ${levelCount} Lektion file(s).`,
);
if (skippedMissingAudio.length > 0) {
  console.log(
    `Skipped ${skippedMissingAudio.length} clip(s) with missing audio.`,
  );
}
