import { cefrLevelProgressCatalog } from "@/lib/admin-catalog";
import { requireLevelAccess, requireUser, unlocksLessonPath } from "@/lib/auth-guard";
import { getLiveRoundForUser } from "@/lib/blitzrunde-store";
import type { SessionClip } from "@/lib/content";
import {
  buildLevelPathChapters,
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
  loadLearnerCourseMenu,
} from "@/lib/levels";
import { loadGrammarWorld } from "@/lib/grammar-world-content";
import { shouldShowOnboarding } from "@/lib/onboarding-store";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { RATING_DONE_COOKIE, readPendingRating } from "@/lib/session-rating-store";
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

  const doneCookie = (await cookies()).get(RATING_DONE_COOKIE)?.value;
  const [courses, liveRound, onboarding, grammarWorld, sessionRating] = await Promise.all([
    loadLearnerCourseMenu(session.user),
    session.user.id ? getLiveRoundForUser(session.user.id) : null,
    shouldShowOnboarding(session.user.id),
    loadGrammarWorld(session.user),
    session.user.id
      ? readPendingRating({ id: session.user.id, email: session.user.email }, doneCookie).catch(() => null)
      : null,
  ]);

  return (
    <LevelViewClient
      level={level}
      chapters={chaptersWithAudio}
      cefrCatalog={cefrLevelProgressCatalog(levelSlug)}
      unlockPath={await unlocksLessonPath(session.user)}
      courses={courses}
      loadLessonDictionary={loadLessonDictionary}
      liveRound={liveRound}
      onboarding={onboarding}
      grammarWorld={grammarWorld}
      sessionRating={sessionRating}
    />
  );
}
