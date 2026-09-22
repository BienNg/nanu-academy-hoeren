import { getSessionClips } from "@/lib/content";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import { getCefrLevels, getChapterClips, getChapterVideos } from "@/lib/levels";

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
        video.videoId ? [{ id: video.videoId, title: video.title }] : [],
      ),
    })),
  }));

  return [...ausbildung, ...levels];
}
