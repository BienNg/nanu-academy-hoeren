import { buildCefrProgressCatalog } from "@/lib/admin-catalog";
import { isAdminUser } from "@/lib/admins";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import type { SessionClip } from "@/lib/content";
import {
  countScriptWords,
  getAvailableChapters,
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import LevelViewClient from "../LevelViewClient";

type LearnLevelPageProps = {
  params: Promise<{ levelSlug: string }>;
};

export default async function LearnLevelPage({ params }: LearnLevelPageProps) {
  const session = await requireUser();
  const { levelSlug } = await params;
  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }
  await requireLevelAccess(session.user, levelSlug);

  const allChapters = getLevelChapters(levelSlug);
  const availableChapters = getAvailableChapters(levelSlug);
  const availableSlugs = new Set(availableChapters.map(c => c.slug));

  const chaptersWithAudio = allChapters.map((chapter) => {
    const clips = availableSlugs.has(chapter.slug)
      ? getChapterClips(levelSlug, chapter.slug)
      : [];
    return {
      ...chapter,
      hasAudio: availableSlugs.has(chapter.slug),
      clipCount: clips.length,
      practiceClips: clips.map((clip) => ({
        id: clip.id,
        script: clip.script,
        translationVi: clip.translationVi,
        sentenceOrder: clip.sentenceOrder,
      })),
      wordCount: clips.reduce(
        (total, clip) => total + countScriptWords(clip.script),
        0,
      ),
    };
  });

  async function loadLessonDictionary(chapterSlug: string): Promise<SessionClip[]> {
    "use server";
    const current = await requireUser();
    await requireLevelAccess(current.user, levelSlug);
    const known = getLevelChapters(levelSlug).some((entry) => entry.slug === chapterSlug);
    if (!known) return [];
    try {
      return getChapterClips(levelSlug, chapterSlug).map((clip) => ({
        id: clip.id,
        filename: clip.filename,
        script: clip.script,
        translationVi: clip.translationVi,
        audioPath: clip.audioPath,
      }));
    } catch {
      return [];
    }
  }

  return (
    <LevelViewClient
      level={level}
      chapters={chaptersWithAudio}
      cefrCatalog={buildCefrProgressCatalog()}
      isAdmin={isAdminUser(session.user)}
      loadLessonDictionary={loadLessonDictionary}
    />
  );
}
