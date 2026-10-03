import { redirect } from "next/navigation";
import { buildCefrProgressCatalog } from "@/lib/admin-catalog";
import { requireUser } from "@/lib/auth-guard";
import type { SessionClip } from "@/lib/content";
import {
  buildLevelPathChapters,
  getCefrLevel,
  getContinueLevelCatalog,
  loadLearnerCourseMenu,
  lockedLearnerCourses,
} from "@/lib/levels";
import { getLiveRoundForUser } from "@/lib/blitzrunde-store";
import { landingInterviewSlug, landingLevelSlug } from "@/lib/progress";
import { getCloudProgress } from "@/lib/progress-store";
import LevelViewClient from "../learn/[levelSlug]/LevelViewClient";

export const dynamic = "force-dynamic";

const LOCKED_PREVIEW_SLUG = "a1-1";

async function emptyDictionary(): Promise<SessionClip[]> {
  "use server";
  return [];
}

export default async function Home() {
  const session = await requireUser();
  const menu = await loadLearnerCourseMenu(session.user);
  const progress = session.user.id
    ? await getCloudProgress(session.user.id)
    : null;
  const levelSlug = progress
    ? landingLevelSlug(progress, getContinueLevelCatalog(), menu.unlockedLevelSlugs)
    : (menu.levels.find((level) => level.unlocked)?.slug ?? null);
  if (levelSlug) redirect(`/learn/${levelSlug}`);

  const interviewSlug = progress
    ? landingInterviewSlug(
        progress,
        menu.interviews.map((course) => course.slug),
      )
    : (menu.interviews[0]?.slug ?? null);
  if (interviewSlug) redirect(`/interview/${interviewSlug}`);

  const workplace = menu.living[0];
  if (workplace) redirect(workplace.href);

  const level = getCefrLevel(LOCKED_PREVIEW_SLUG);
  if (!level) redirect("/account");
  const liveRound = session.user.id ? await getLiveRoundForUser(session.user.id) : null;

  return (
    <LevelViewClient
      level={level}
      chapters={buildLevelPathChapters(level.slug)}
      cefrCatalog={buildCefrProgressCatalog()}
      courses={lockedLearnerCourses()}
      accessLocked
      loadLessonDictionary={emptyDictionary}
      liveRound={liveRound}
    />
  );
}
