import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import chaptersFile from "@/data/chapters.json";
import type { SessionClip } from "@/lib/content";
import type { ContinueLevelCatalogEntry } from "@/lib/progress";
import { isSentenceOrderEligible } from "@/lib/sentence-order";
import { parseYouTubeUrl } from "@/lib/youtube";

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
  /** Set to true to keep this clip out of sentence-order cards. */
  noSentenceOrder?: boolean;
};

type StoredVideo = {
  title?: unknown;
  titleVi?: unknown;
  url?: unknown;
};

type StoredChapterFile = {
  clips: StoredClip[];
  videos?: StoredVideo[];
};

/** A lesson video entered as a title plus a YouTube URL. `videoId` is null when the URL is not playable. */
export type ChapterVideo = {
  title: string;
  titleVi: string;
  url: string;
  videoId: string | null;
  startSeconds: number;
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

/** German words in a clip script. Whitespace-separated tokens, not flashcards. */
export function countScriptWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
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
    sentenceOrder: isSentenceOrderEligible(clip),
  };
}

/**
 * Lesson JSON and audio files only change with a deploy, so production keeps
 * them in memory instead of re-reading disk on every request (the progress
 * heartbeat walks the whole catalog). Development re-reads so edits show up.
 */
const cacheContent = process.env.NODE_ENV === "production";
const chapterFileCache = new Map<string, StoredChapterFile | null>();
const audioExistsCache = new Map<string, boolean>();

function loadChapterFile(
  levelSlug: string,
  chapterSlug: string,
): StoredChapterFile | null {
  const path = join(levelsDir, levelSlug, `${chapterSlug}.json`);
  if (cacheContent && chapterFileCache.has(path)) {
    return chapterFileCache.get(path) ?? null;
  }
  let file: StoredChapterFile | null = null;
  if (existsSync(path)) {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    file = isStoredChapterFile(parsed) ? parsed : null;
  }
  if (cacheContent) chapterFileCache.set(path, file);
  return file;
}

function audioFileExists(path: string): boolean {
  if (!cacheContent) return existsSync(path);
  const cached = audioExistsCache.get(path);
  if (cached !== undefined) return cached;
  const exists = existsSync(path);
  audioExistsCache.set(path, exists);
  return exists;
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

/** Playable clip ids per lesson, in catalog order. Shared slugs are omitted. */
export function listLessonClipCatalog(): { chapterSlug: string; clipIds: string[] }[] {
  const counts = new Map<string, number>();
  const rows: { chapterSlug: string; clipIds: string[] }[] = [];
  for (const level of getCefrLevels()) {
    for (const chapter of level.chapters) {
      counts.set(chapter.slug, (counts.get(chapter.slug) ?? 0) + 1);
      let clipIds: string[] = [];
      try {
        clipIds = getChapterClips(level.slug, chapter.slug).map((clip) => clip.id);
      } catch {
        clipIds = [];
      }
      rows.push({ chapterSlug: chapter.slug, clipIds });
    }
  }
  return rows.filter((row) => counts.get(row.chapterSlug) === 1);
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
      audioFileExists(join(levelsAudioDir, levelSlug, chapterSlug, clip.filename)),
    )
    .map((clip) => toSessionClip(clip, levelSlug, chapterSlug));
}

export type ChapterClipInventory = {
  listed: number;
  playable: number;
  missingAudio: number;
};

/** Clips listed in JSON vs files that actually exist on disk. */
export function getChapterClipInventory(
  levelSlug: string,
  chapterSlug: string,
): ChapterClipInventory | null {
  const file = loadChapterFile(levelSlug, chapterSlug);
  if (!file) return null;
  const listed = file.clips.filter(
    (clip) => typeof clip.filename === "string" && clip.filename.length > 0,
  ).length;
  let playable = 0;
  try {
    playable = getChapterClips(levelSlug, chapterSlug).length;
  } catch {
    playable = 0;
  }
  return {
    listed,
    playable,
    missingAudio: Math.max(0, listed - playable),
  };
}

function toChapterVideo(entry: StoredVideo): ChapterVideo | null {
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const titleVi = typeof entry.titleVi === "string" ? entry.titleVi.trim() : "";
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  if (!title || !url) return null;

  const parsed = parseYouTubeUrl(url);
  return {
    title,
    titleVi,
    url,
    videoId: parsed?.videoId ?? null,
    startSeconds: parsed?.startSeconds ?? 0,
  };
}

/** Videos listed on a Lektion. Missing or empty means the lesson view hides the video card. */
export function getChapterVideos(
  levelSlug: string,
  chapterSlug: string,
): ChapterVideo[] {
  const file = loadChapterFile(levelSlug, chapterSlug);
  if (!file?.videos) return [];

  return file.videos.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const video = toChapterVideo(entry);
    return video ? [video] : [];
  });
}

/** Catalog used on Home to pick the in-progress CEFR resume card. */
export function getContinueLevelCatalog(): ContinueLevelCatalogEntry[] {
  return getCefrLevels().map((level) => ({
    level: level.level,
    slug: level.slug,
    chapters: getLevelChapters(level.slug).map((chapter) => {
      let clipCount = 0;
      try {
        clipCount = getChapterClips(level.slug, chapter.slug).length;
      } catch {
        clipCount = 0;
      }
      const videoIds = getChapterVideos(level.slug, chapter.slug).flatMap(
        (video) => (video.videoId ? [video.videoId] : []),
      );
      return {
        slug: chapter.slug,
        label: chapter.label,
        clipCount,
        videoIds,
      };
    }),
  }));
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
