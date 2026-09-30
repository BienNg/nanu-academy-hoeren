import { HomeScreen } from "@/components/HomeScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { getCefrLevels, getContinueLevelCatalog } from "@/lib/levels";
import { getAvailableWorkplaces, getLivingScenes } from "@/lib/living";
import {
  getUserClassName,
  getUserLevelAccess,
  hasInterviewAccess,
  livingAccessFrom,
  withoutReservedAccess,
} from "@/lib/progress-store";
import { getLeaderboard } from "@/lib/xp-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireUser();
  const berufe = getAvailableBerufe();
  const levels = getCefrLevels().map(({ level, slug, chapters }) => ({
    level,
    slug,
    chapterCount: chapters.length,
  }));

  const interviewClipTotals: Record<string, number> = {};
  for (const beruf of berufe) {
    interviewClipTotals[beruf.slug] = getSessionClips(beruf.slug).length;
  }

  const isAdmin = isAdminUser(session.user);
  const [storedAccess, className, ranking] = await Promise.all([
    isAdmin ? Promise.resolve(null) : getUserLevelAccess(session.user.id),
    isAdmin ? Promise.resolve(null) : getUserClassName(session.user.id),
    getLeaderboard({
      viewerId: session.user.id,
      viewerImage: session.user.image,
      scope: "class",
      range: "week",
    }),
  ]);

  const livingGranted = storedAccess ? livingAccessFrom(storedAccess) : null;
  const workplaces = getAvailableWorkplaces()
    .filter((workplace) => !livingGranted || livingGranted.includes(workplace.slug))
    .map((workplace) => ({
      slug: workplace.slug,
      label: workplace.label,
      labelVi: workplace.labelVi ?? null,
      icon: workplace.icon ?? null,
      scenes: getLivingScenes(workplace.slug).map((scene) => ({ progressKey: scene.progressKey })),
    }));

  return (
    <HomeScreen
      berufe={berufe}
      levels={levels}
      levelCatalog={getContinueLevelCatalog()}
      interviewClipTotals={interviewClipTotals}
      unlockedLevelSlugs={
        storedAccess
          ? withoutReservedAccess(storedAccess)
          : levels.map((level) => level.slug)
      }
      interviewAccess={storedAccess ? hasInterviewAccess(storedAccess) : true}
      ranking={ranking}
      workplaces={workplaces}
      duelsAvailable={isAdmin || Boolean(className)}
    />
  );
}
