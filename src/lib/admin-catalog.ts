import {
  getAusbildungClipInventory,
  getListedBerufe,
  getSessionClips,
} from "@/lib/content";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import { shortBerufLabel, type AdminUserRow } from "@/lib/admin-overview";
import {
  getCefrLevels,
  getChapterClipInventory,
  getChapterClips,
  getChapterVideos,
  listChapterFilesOnDisk,
} from "@/lib/levels";
import {
  getLivingInventory,
  getLivingSceneClips,
  getLivingScenes,
  getLivingWorkplaces,
} from "@/lib/living";
import { livingAccessSlug } from "@/lib/living-content";
import { lessonVideoProgressKey, lessonVideoStatus } from "@/lib/progress";

function chapterClips(levelSlug: string, chapterSlug: string): { id: string; prompt: string }[] {
  try {
    return getChapterClips(levelSlug, chapterSlug).map((clip) => ({
      id: clip.id,
      prompt: clip.script,
    }));
  } catch {
    return [];
  }
}

export function buildAdminCourseCatalog(
  berufe: readonly { slug: string; label: string; shortLabel: string }[],
): AdminCatalogCourse[] {
  const ausbildung: AdminCatalogCourse[] = berufe.map((beruf) => {
    const clips = getSessionClips(beruf.slug);
    const shared = clips.filter((clip) => clip.audioPath.startsWith("ausbildung/common/"));
    const own = clips.filter((clip) => !clip.audioPath.startsWith("ausbildung/common/"));

    return {
      id: beruf.slug,
      label: beruf.label,
      shortLabel: beruf.shortLabel,
      kind: "ausbildung",
      lessons: [
        {
          id: `${beruf.slug}-shared`,
          label: "Shared questions",
          interviewSlug: beruf.slug,
          clips: shared.map((clip) => ({ id: clip.id, prompt: clip.script })),
          videos: [],
        },
        {
          id: `${beruf.slug}-own`,
          label: beruf.shortLabel,
          interviewSlug: beruf.slug,
          clips: own.map((clip) => ({ id: clip.id, prompt: clip.script })),
          videos: [],
        },
      ],
    };
  });

  const levels: AdminCatalogCourse[] = getCefrLevels().map((level) => ({
    id: level.slug,
    label: level.level,
    shortLabel: level.level,
    kind: "cefr",
    lessons: level.chapters.map((chapter) => ({
      id: `${level.slug}-${chapter.slug}`,
      label: chapter.label,
      learnKey: chapter.slug,
      videoKeyPrefix: `${level.slug}/${chapter.slug}`,
      clips: chapterClips(level.slug, chapter.slug),
      videos: getChapterVideos(level.slug, chapter.slug).flatMap((video) =>
        video.videoId ? [{ id: video.videoId, title: video.title, titleVi: video.titleVi }] : [],
      ),
    })),
  }));

  const living: AdminCatalogCourse[] = getLivingWorkplaces().map((workplace) => ({
    id: livingAccessSlug(workplace.slug),
    label: `Leben in DE · ${workplace.label}`,
    shortLabel: workplace.label,
    kind: "cefr",
    living: true,
    lessons: getLivingScenes(workplace.slug).map((scene) => ({
      id: `${livingAccessSlug(workplace.slug)}-${scene.id}`,
      label: scene.label,
      learnKey: scene.progressKey,
      videoKeyPrefix: scene.lessonKey,
      clips: getLivingSceneClips(workplace.slug, scene.id).map((clip) => ({
        id: clip.id,
        prompt: clip.script,
      })),
      videos: [],
    })),
  }));

  return [...ausbildung, ...levels, ...living];
}

/** CEFR courses with clip ids only, so learner pages can project the same meters as admin. */
export function buildCefrProgressCatalog(): AdminCatalogCourse[] {
  return buildAdminCourseCatalog([])
    .filter((course) => course.kind === "cefr" && !course.living)
    .map((course) => ({
      ...course,
      lessons: course.lessons.map((lesson) => ({
        ...lesson,
        clips: lesson.clips.map((clip) => ({ id: clip.id, prompt: "" })),
      })),
    }));
}

export type AdminCatalogLessonStatus = "ready" | "silent" | "stub" | "missing";

export type AdminCatalogLessonRow = {
  id: string;
  label: string;
  status: AdminCatalogLessonStatus;
  listedClips: number;
  playableClips: number;
  missingAudio: number;
  videos: number;
  brokenVideos: number;
};

export type AdminCatalogLevelRow = {
  slug: string;
  label: string;
  listedLessons: number;
  readyLessons: number;
  playableClips: number;
  videos: number;
  lessons: AdminCatalogLessonRow[];
};

export type AdminCatalogTrackRow = {
  slug: string;
  label: string;
  shortLabel: string;
  ready: boolean;
  sharedPlayable: number;
  ownPlayable: number;
  missingAudio: number;
};

export type AdminCatalogIssue = {
  id: string;
  label: string;
  detail: string;
};

export type AdminCatalogBoard = {
  levelsListed: number;
  levelsReady: number;
  lessonsListed: number;
  lessonsReady: number;
  clipsPlayable: number;
  clipsMissingAudio: number;
  videosPlayable: number;
  videosBroken: number;
  tracksListed: number;
  tracksReady: number;
  interviewClips: number;
  levels: AdminCatalogLevelRow[];
  tracks: AdminCatalogTrackRow[];
  issues: AdminCatalogIssue[];
};

const ISSUE_LIMIT = 12;

function lessonStatus(
  inventory: ReturnType<typeof getChapterClipInventory>,
): AdminCatalogLessonStatus {
  if (!inventory) return "missing";
  if (inventory.playable > 0) return "ready";
  if (inventory.listed > 0) return "silent";
  return "stub";
}

/**
 * Published curriculum: what learners can open, and what is listed but not playable.
 */
export function buildAdminCatalogBoard(): AdminCatalogBoard {
  const urgent: AdminCatalogIssue[] = [];
  const levels: AdminCatalogLevelRow[] = getCefrLevels().map((level) => {
    const listedSlugs = new Set(level.chapters.map((chapter) => chapter.slug));
    let silentClips = 0;
    let silentLessons = 0;
    const lessons: AdminCatalogLessonRow[] = level.chapters.map((chapter) => {
      const inventory = getChapterClipInventory(level.slug, chapter.slug);
      const videos = getChapterVideos(level.slug, chapter.slug);
      const playableVideos = videos.filter((video) => video.videoId).length;
      const brokenVideos = videos.length - playableVideos;
      const status = lessonStatus(inventory);
      const missingAudio = inventory?.missingAudio ?? 0;
      if (missingAudio > 0) {
        silentLessons += 1;
        silentClips += missingAudio;
      }
      if (brokenVideos > 0) {
        urgent.push({
          id: `${level.slug}/${chapter.slug}-video`,
          label: `${level.level} · ${chapter.label}`,
          detail: `${brokenVideos} video URL${brokenVideos === 1 ? "" : "s"} could not be parsed.`,
        });
      }
      return {
        id: `${level.slug}/${chapter.slug}`,
        label: chapter.label,
        status,
        listedClips: inventory?.listed ?? 0,
        playableClips: inventory?.playable ?? 0,
        missingAudio: inventory?.missingAudio ?? 0,
        videos: playableVideos,
        brokenVideos,
      };
    });

    if (silentClips > 0) {
      urgent.push({
        id: `${level.slug}-silent`,
        label: level.level,
        detail: `${silentClips} clip${silentClips === 1 ? "" : "s"} listed without audio across ${silentLessons} lesson${silentLessons === 1 ? "" : "s"}.`,
      });
    }

    for (const diskSlug of listChapterFilesOnDisk(level.slug)) {
      if (listedSlugs.has(diskSlug)) continue;
      urgent.push({
        id: `${level.slug}/${diskSlug}-orphan`,
        label: `${level.level} · ${diskSlug}`,
        detail: "Lesson file on disk is not listed in chapters.json.",
      });
    }

    return {
      slug: level.slug,
      label: level.level,
      listedLessons: lessons.length,
      readyLessons: lessons.filter((lesson) => lesson.status === "ready").length,
      playableClips: lessons.reduce((sum, lesson) => sum + lesson.playableClips, 0),
      videos: lessons.reduce((sum, lesson) => sum + lesson.videos, 0),
      lessons,
    };
  });

  const tracks: AdminCatalogTrackRow[] = getListedBerufe().map((beruf) => {
    const inventory = getAusbildungClipInventory(beruf.slug);
    const sharedPlayable = inventory?.sharedPlayable ?? 0;
    const ownPlayable = inventory?.ownPlayable ?? 0;
    const missingAudio = inventory
      ? inventory.sharedListed -
        inventory.sharedPlayable +
        inventory.ownListed -
        inventory.ownPlayable
      : 0;
    const ready = Boolean(inventory && ownPlayable + sharedPlayable > 0);
    if (!inventory) {
      urgent.push({
        id: `track-${beruf.slug}-missing`,
        label: beruf.label,
        detail: "Listed as a profession, but the interview JSON is missing.",
      });
    } else if (missingAudio > 0) {
      urgent.push({
        id: `track-${beruf.slug}-audio`,
        label: beruf.label,
        detail: `${missingAudio} interview clip${missingAudio === 1 ? "" : "s"} listed without audio.`,
      });
    }
    return {
      slug: beruf.slug,
      label: beruf.label,
      shortLabel: shortBerufLabel(beruf.label),
      ready,
      sharedPlayable,
      ownPlayable,
      missingAudio,
    };
  });

  for (const workplace of getLivingWorkplaces()) {
    const scenes = getLivingInventory(workplace.slug);
    if (scenes.length === 0) {
      urgent.push({
        id: `living-${workplace.slug}-missing`,
        label: `Leben in DE · ${workplace.label}`,
        detail: `Listed in workplaces.json, but src/data/living/${workplace.slug}.json has no scenes.`,
      });
      continue;
    }
    const missingAudio = scenes.reduce((sum, scene) => sum + scene.listed - scene.playable, 0);
    const missingImages = scenes.reduce((sum, scene) => sum + scene.missingImages, 0);
    if (missingAudio > 0) {
      urgent.push({
        id: `living-${workplace.slug}-audio`,
        label: `Leben in DE · ${workplace.label}`,
        detail: `${missingAudio} clip${missingAudio === 1 ? "" : "s"} listed without audio across ${scenes.filter((scene) => scene.listed > scene.playable).length} scene(s).`,
      });
    }
    if (missingImages > 0) {
      urgent.push({
        id: `living-${workplace.slug}-images`,
        label: `Leben in DE · ${workplace.label}`,
        detail: `${missingImages} picture${missingImages === 1 ? "" : "s"} missing; those pairing cards show text instead.`,
      });
    }
  }

  const sharedPlayable = tracks[0]?.sharedPlayable ?? 0;
  const interviewClips =
    sharedPlayable + tracks.reduce((sum, track) => sum + track.ownPlayable, 0);

  return {
    levelsListed: levels.length,
    levelsReady: levels.filter((level) => level.readyLessons > 0).length,
    lessonsListed: levels.reduce((sum, level) => sum + level.listedLessons, 0),
    lessonsReady: levels.reduce((sum, level) => sum + level.readyLessons, 0),
    clipsPlayable: levels.reduce((sum, level) => sum + level.playableClips, 0),
    clipsMissingAudio: levels.reduce(
      (sum, level) =>
        sum + level.lessons.reduce((inner, lesson) => inner + lesson.missingAudio, 0),
      0,
    ),
    videosPlayable: levels.reduce((sum, level) => sum + level.videos, 0),
    videosBroken: levels.reduce(
      (sum, level) =>
        sum + level.lessons.reduce((inner, lesson) => inner + lesson.brokenVideos, 0),
      0,
    ),
    tracksListed: tracks.length,
    tracksReady: tracks.filter((track) => track.ready).length,
    interviewClips,
    levels,
    tracks,
    issues: urgent.slice(0, ISSUE_LIMIT),
  };
}

export type AdminPublishedVideo = {
  key: string;
  levelSlug: string;
  levelLabel: string;
  chapterSlug: string;
  lesson: string;
  title: string;
  url: string;
  videoId: string | null;
};

/** Every lesson video in chapters JSON, including URLs that do not parse. */
export function listPublishedLessonVideos(): AdminPublishedVideo[] {
  const rows: AdminPublishedVideo[] = [];
  for (const level of getCefrLevels()) {
    for (const chapter of level.chapters) {
      for (const video of getChapterVideos(level.slug, chapter.slug)) {
        rows.push({
          key: video.videoId
            ? lessonVideoProgressKey(level.slug, chapter.slug, video.videoId)
            : `${level.slug}/${chapter.slug}/${video.url}`,
          levelSlug: level.slug,
          levelLabel: level.level,
          chapterSlug: chapter.slug,
          lesson: chapter.label,
          title: video.title,
          url: video.url,
          videoId: video.videoId,
        });
      }
    }
  }
  return rows;
}

export type AdminVideoWatchRow = AdminPublishedVideo & {
  watched: number;
  started: number;
};

export type AdminVideoBoard = {
  listed: number;
  playable: number;
  broken: number;
  watchedOnce: number;
  untouched: number;
  rows: AdminVideoWatchRow[];
};

/**
 * Lesson videos plus how many synced students marked them watched.
 * Counts are all-time from progress, not the admin date pill.
 */
export function buildAdminVideoBoard(
  people: readonly AdminUserRow[],
): AdminVideoBoard {
  const published = listPublishedLessonVideos();
  const rows: AdminVideoWatchRow[] = published.map((video) => {
    let watched = 0;
    let started = 0;
    if (video.videoId) {
      for (const person of people) {
        const status = lessonVideoStatus(person.progress.videos[video.key]);
        if (status === "watched") watched += 1;
        else if (status === "in-progress") started += 1;
      }
    }
    return { ...video, watched, started };
  });
  const playable = rows.filter((row) => row.videoId);
  return {
    listed: rows.length,
    playable: playable.length,
    broken: rows.length - playable.length,
    watchedOnce: playable.filter((row) => row.watched > 0).length,
    untouched: playable.filter((row) => row.watched === 0 && row.started === 0).length,
    rows,
  };
}
