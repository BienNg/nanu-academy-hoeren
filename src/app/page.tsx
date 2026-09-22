import { HomeScreen } from "@/components/HomeScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { getCefrLevels, getContinueLevelCatalog } from "@/lib/levels";
import { getUserLevelAccess } from "@/lib/progress-store";

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

  return (
    <HomeScreen
      berufe={berufe}
      levels={levels}
      levelCatalog={getContinueLevelCatalog()}
      interviewClipTotals={interviewClipTotals}
      unlockedLevelSlugs={
        isAdminUser(session.user)
          ? levels.map((level) => level.slug)
          : await getUserLevelAccess(session.user.id)
      }
    />
  );
}
