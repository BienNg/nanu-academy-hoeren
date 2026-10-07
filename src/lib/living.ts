import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { publicMediaExists, type SessionClip } from "@/lib/content";
import {
  livingLessonKey,
  livingProgressKey,
  parseLivingFile,
  parseLivingLessonKey,
  parseLivingWorkplaces,
  type LivingWorkplace,
  type StoredLivingClip,
  type StoredLivingFile,
  type StoredLivingScene,
} from "@/lib/living-content";
import { isSentenceOrderEligible } from "@/lib/sentence-order";

export type { LivingWorkplace } from "@/lib/living-content";

export type LivingScene = {
  id: string;
  label: string;
  labelVi?: string;
  lessonKey: string;
  progressKey: string;
};

const livingDir = join(process.cwd(), "src/data/living");

/** Same caching rule as levels.ts: production keeps content in memory, dev re-reads. */
const cacheContent = process.env.NODE_ENV === "production";
const fileCache = new Map<string, StoredLivingFile | null>();
let workplacesCache: LivingWorkplace[] | null = null;

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Could not parse ${path}`, error);
    return null;
  }
}

function audioExists(workplaceSlug: string, filename: string): boolean {
  return publicMediaExists(`audio/living/${workplaceSlug}/${filename}`);
}

function imageExists(workplaceSlug: string, image: string): boolean {
  return publicMediaExists(`images/living/${workplaceSlug}/${image}`);
}

function loadWorkplaceFile(workplaceSlug: string): StoredLivingFile | null {
  if (cacheContent && fileCache.has(workplaceSlug)) {
    return fileCache.get(workplaceSlug) ?? null;
  }
  const file = parseLivingFile(readJson(join(livingDir, `${workplaceSlug}.json`)));
  if (cacheContent) fileCache.set(workplaceSlug, file);
  return file;
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function toSessionClip(clip: StoredLivingClip, workplaceSlug: string): SessionClip {
  const imageUrl =
    clip.image && imageExists(workplaceSlug, clip.image)
      ? `/images/living/${workplaceSlug}/${clip.image}`
      : undefined;
  return {
    id: stripExtension(clip.filename),
    filename: clip.filename,
    script: clip.script,
    translationVi: clip.translationVi ?? "",
    audioPath: `living/${workplaceSlug}/${clip.filename}`,
    // A number card already covers the clip; its spelled-out script makes a poor order card.
    sentenceOrder: !clip.answer && isSentenceOrderEligible(clip),
    ...(clip.replies ? { replies: clip.replies } : {}),
    ...(clip.answer ? { answer: clip.answer } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function toScene(scene: StoredLivingScene, workplaceSlug: string): LivingScene {
  return {
    id: scene.id,
    label: scene.label,
    ...(scene.labelVi ? { labelVi: scene.labelVi } : {}),
    lessonKey: livingLessonKey(workplaceSlug, scene.id),
    progressKey: livingProgressKey(workplaceSlug, scene.id),
  };
}

/** Every workplace in workplaces.json, with or without content. */
export function getLivingWorkplaces(): LivingWorkplace[] {
  if (cacheContent && workplacesCache) return workplacesCache;
  const workplaces = parseLivingWorkplaces(readJson(join(livingDir, "workplaces.json")));
  if (cacheContent) workplacesCache = workplaces;
  return workplaces;
}

export function getLivingWorkplace(slug: string): LivingWorkplace | undefined {
  return getLivingWorkplaces().find((workplace) => workplace.slug === slug);
}

/** Clips of one scene that have their MP3 on disk. */
export function getLivingSceneClips(workplaceSlug: string, sceneId: string): SessionClip[] {
  const scene = loadWorkplaceFile(workplaceSlug)?.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return [];
  return scene.clips
    .filter((clip) => audioExists(workplaceSlug, clip.filename))
    .map((clip) => toSessionClip(clip, workplaceSlug));
}

/** Scenes with at least one playable clip, in file order. */
export function getLivingScenes(workplaceSlug: string): LivingScene[] {
  const file = loadWorkplaceFile(workplaceSlug);
  if (!file) return [];
  return file.scenes
    .filter((scene) => getLivingSceneClips(workplaceSlug, scene.id).length > 0)
    .map((scene) => toScene(scene, workplaceSlug));
}

export function getLivingScene(workplaceSlug: string, sceneId: string): LivingScene | undefined {
  return getLivingScenes(workplaceSlug).find((scene) => scene.id === sceneId);
}

/** Workplaces with at least one playable scene. */
export function getAvailableWorkplaces(): LivingWorkplace[] {
  return getLivingWorkplaces().filter(
    (workplace) => getLivingScenes(workplace.slug).length > 0,
  );
}

/** Clips for a Living lesson key (`living-<workplace>/<scene>`), or null for any other key. */
export function getLivingClipsForLessonKey(lessonKey: string): SessionClip[] | null {
  const parsed = parseLivingLessonKey(lessonKey);
  if (!parsed) return null;
  return getLivingSceneClips(parsed.workplaceSlug, parsed.sceneId);
}

export type LivingClipInventory = {
  sceneId: string;
  label: string;
  listed: number;
  playable: number;
  missingImages: number;
};

/** JSON clips vs MP3s and images on disk, per scene. For admin health. */
export function getLivingInventory(workplaceSlug: string): LivingClipInventory[] {
  const file = loadWorkplaceFile(workplaceSlug);
  if (!file) return [];
  return file.scenes.map((scene) => ({
    sceneId: scene.id,
    label: scene.label,
    listed: scene.clips.length,
    playable: scene.clips.filter((clip) => audioExists(workplaceSlug, clip.filename)).length,
    missingImages: scene.clips.filter(
      (clip) => clip.image && !imageExists(workplaceSlug, clip.image),
    ).length,
  }));
}

/** Progress key → readable "Nagelstudio · Bezahlen" label, for Home and admin views. */
export function livingLessonLabels(): Map<string, { workplace: LivingWorkplace; scene: LivingScene }> {
  const labels = new Map<string, { workplace: LivingWorkplace; scene: LivingScene }>();
  for (const workplace of getLivingWorkplaces()) {
    for (const scene of getLivingScenes(workplace.slug)) {
      labels.set(scene.lessonKey, { workplace, scene });
      labels.set(scene.progressKey, { workplace, scene });
    }
  }
  return labels;
}

/** Playable clip ids per scene, keyed like progress.learn, for absorbing added clips. */
export function listLivingClipCatalog(): { chapterSlug: string; clipIds: string[] }[] {
  return getLivingWorkplaces().flatMap((workplace) =>
    getLivingScenes(workplace.slug).map((scene) => ({
      chapterSlug: scene.progressKey,
      clipIds: getLivingSceneClips(workplace.slug, scene.id).map((clip) => clip.id),
    })),
  );
}
