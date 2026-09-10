import chaptersFile from "@/data/chapters.json";
import { HomeScreen } from "@/components/HomeScreen";
import { requireUser } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";

type ChapterLevel = {
  level: string;
  slug: string;
  chapters: unknown[];
};

export default async function Home() {
  await requireUser();
  const berufe = getAvailableBerufe();
  const levels = (chaptersFile as ChapterLevel[]).map(({ level, slug }) => ({
    level,
    slug,
  }));

  const interviewClipTotals: Record<string, number> = {};
  for (const beruf of berufe) {
    interviewClipTotals[beruf.slug] = getSessionClips(beruf.slug).length;
  }

  return (
    <HomeScreen
      berufe={berufe}
      levels={levels}
      interviewClipTotals={interviewClipTotals}
    />
  );
}
