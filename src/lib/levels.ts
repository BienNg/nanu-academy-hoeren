import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import chaptersFile from "@/data/chapters.json";
import type { SessionClip } from "@/lib/content";

export type LevelChapterMeta = {
  id: string;
  label: string;
  slug: string;
};

export type CefrLevel = {
  level: string;
  slug: string;
  chapters: LevelChapterMeta[];
};

type StoredClip = {
  filename: string;
  script: string;
  translationVi?: string;
};

type StoredChapterFile = {
  clips: StoredClip[];
};

type CatalogLevel = {
  level: string;
  slug: string;
  chapters: LevelChapterMeta[];
};

const catalogLevels = chaptersFile as CatalogLevel[];
const levelsDir = join(process.cwd(), "src/data/levels");
const levelsAudioDir = join(process.cwd(), "public/audio");

function isStoredChapterFile(value: unknown): value is StoredChapterFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as StoredChapterFile).clips)
  );
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function toSessionClip(
  clip: StoredClip,
  levelSlug: string,
  chapterSlug: string,
): SessionClip {
  return {
    id: stripExtension(clip.filename),
    filename: clip.filename,
    script: clip.script,
    translationVi: clip.translationVi ?? "",
    audioPath: `${levelSlug}/${chapterSlug}/${clip.filename}`,
  };
}

function loadChapterFile(
  levelSlug: string,
  chapterSlug: string,
): StoredChapterFile | null {
  const path = join(levelsDir, levelSlug, `${chapterSlug}.json`);
  if (!existsSync(path)) {
    return null;
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return isStoredChapterFile(parsed) ? parsed : null;
}

/** All CEFR levels from the catalog (including ones with no Lektionen yet). */
export function getCefrLevels(): CefrLevel[] {
  return catalogLevels.map((entry) => ({
    level: entry.level,
    slug: entry.slug,
    chapters: entry.chapters ?? [],
  }));
}

export function getCefrLevel(levelSlug: string): CefrLevel | undefined {
  return getCefrLevels().find((entry) => entry.slug === levelSlug);
}

/**
 * Lektionen listed in chapters.json that also have a content file on disk
 * (clips may still be empty — use getAvailableChapters for playable ones).
 */
export function getLevelChapters(levelSlug: string): LevelChapterMeta[] {
  const level = getCefrLevel(levelSlug);
  if (!level) {
    return [];
  }

  return level.chapters.filter((chapter) =>
    Boolean(loadChapterFile(levelSlug, chapter.slug)),
  );
}

/** Lektionen that have at least one clip and are ready to practice. */
export function getAvailableChapters(levelSlug: string): LevelChapterMeta[] {
  return getLevelChapters(levelSlug).filter(
    (chapter) => getChapterClips(levelSlug, chapter.slug).length > 0,
  );
}

/**
 * Levels that have at least one playable Lektion (non-empty clips).
 * Home can still show the full catalog; use this when unlocking cards.
 */
export function getAvailableLevels(): CefrLevel[] {
  return getCefrLevels().filter(
    (level) => getAvailableChapters(level.slug).length > 0,
  );
}

export function getChapterClips(
  levelSlug: string,
  chapterSlug: string,
): SessionClip[] {
  const level = getCefrLevel(levelSlug);
  if (!level) {
    throw new Error(`Unknown CEFR level slug: "${levelSlug}"`);
  }

  const chapter = level.chapters.find((entry) => entry.slug === chapterSlug);
  if (!chapter) {
    throw new Error(
      `Unknown chapter "${chapterSlug}" for level "${levelSlug}"`,
    );
  }

  const file = loadChapterFile(levelSlug, chapterSlug);
  if (!file) {
    throw new Error(
      `Missing content file for ${levelSlug}/${chapterSlug}.json`,
    );
  }

  return file.clips
    .filter((clip) =>
      existsSync(join(levelsAudioDir, levelSlug, chapterSlug, clip.filename)),
    )
    .map((clip) => toSessionClip(clip, levelSlug, chapterSlug));
}

/** Discover chapter JSON files under a level folder (dev helper / validation). */
export function listChapterFilesOnDisk(levelSlug: string): string[] {
  const dir = join(levelsDir, levelSlug);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length));
}
