import { HomeScreen } from "@/components/HomeScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { getCefrLevels, getContinueLevelCatalog } from "@/lib/levels";
import {
  getUserLevelAccess,
  hasInterviewAccess,
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
  const [storedAccess, ranking] = await Promise.all([
    isAdmin ? Promise.resolve(null) : getUserLevelAccess(session.user.id),
    getLeaderboard({
      viewerId: session.user.id,
      viewerImage: session.user.image,
      scope: "class",
      range: "week",
    }),
  ]);

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
    />
  );
}
