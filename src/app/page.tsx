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

  // Continue-learning targets the only available profession with clips.
  const continueBeruf = berufe[0];
  const interviewTotalClips = continueBeruf
    ? getSessionClips(continueBeruf.slug).length
    : 0;

  return (
    <HomeScreen
      berufe={berufe}
      levels={levels}
      interviewTotalClips={interviewTotalClips}
    />
  );
}
