import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(repoRoot, "src/data/ausbildung");
const audioRoot = join(repoRoot, "public/audio/ausbildung");

const errors = [];

function rel(absolutePath) {
  return absolutePath.replace(`${repoRoot}/`, "");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (!existsSync(dataDir)) {
  console.error(`Missing content directory: ${rel(dataDir)}`);
  process.exit(1);
}

const jsonFiles = readdirSync(dataDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

if (jsonFiles.length === 0) {
  console.error(`No JSON files found in ${rel(dataDir)}`);
  process.exit(1);
}

for (const jsonName of jsonFiles) {
  const jsonPath = join(dataDir, jsonName);
  const folder = jsonName.slice(0, -".json".length);
  const audioDir = join(audioRoot, folder);
  const jsonRel = rel(jsonPath);

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not parse ${jsonRel}: ${message}`);
    continue;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.clips)) {
    errors.push(`${jsonRel} must be an object with a "clips" array`);
    continue;
  }

  const listedFilenames = new Set();

  parsed.clips.forEach((clip, index) => {
    if (!isRecord(clip) || typeof clip.filename !== "string" || clip.filename.length === 0) {
      errors.push(
        `${jsonRel} clips[${index}] is missing a non-empty "filename" string`,
      );
      return;
    }

    listedFilenames.add(clip.filename);
    const audioPath = join(audioDir, clip.filename);
    if (!existsSync(audioPath)) {
      errors.push(
        `Missing audio file: ${rel(audioPath)} (listed in ${jsonRel})`,
      );
    }
  });

  if (!existsSync(audioDir)) {
    continue;
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

if (errors.length > 0) {
  console.error("Content integrity check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Content integrity OK: ${jsonFiles.length} file(s) in src/data/ausbildung.`,
);
