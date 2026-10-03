import { buildCefrProgressCatalog } from "@/lib/admin-catalog";
import { isAdminUser } from "@/lib/admins";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import { getLiveRoundForUser } from "@/lib/blitzrunde-store";
import type { SessionClip } from "@/lib/content";
import {
  buildLevelPathChapters,
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
  loadLearnerCourseMenu,
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

  const chaptersWithAudio = buildLevelPathChapters(levelSlug);

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

  const courses = await loadLearnerCourseMenu(session.user);
  const liveRound = session.user.id ? await getLiveRoundForUser(session.user.id) : null;

  return (
    <LevelViewClient
      level={level}
      chapters={chaptersWithAudio}
      cefrCatalog={buildCefrProgressCatalog()}
      isAdmin={isAdminUser(session.user)}
      courses={courses}
      loadLessonDictionary={loadLessonDictionary}
      liveRound={liveRound}
    />
  );
}
