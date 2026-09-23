import { HomeScreen } from "@/components/HomeScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { getCefrLevels, getContinueLevelCatalog } from "@/lib/levels";
import {
  getUserLevelAccess,
  hasInterviewAccess,
  withoutInterviewAccess,
} from "@/lib/progress-store";

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
  const storedAccess = isAdmin ? null : await getUserLevelAccess(session.user.id);

  return (
    <HomeScreen
      berufe={berufe}
      levels={levels}
      levelCatalog={getContinueLevelCatalog()}
      interviewClipTotals={interviewClipTotals}
      unlockedLevelSlugs={
        storedAccess
          ? withoutInterviewAccess(storedAccess)
          : levels.map((level) => level.slug)
      }
      interviewAccess={storedAccess ? hasInterviewAccess(storedAccess) : true}
    />
  );
}
