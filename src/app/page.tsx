import chaptersFile from "@/data/chapters.json";
import { HomeScreen } from "@/components/HomeScreen";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";

type ChapterLevel = {
  level: string;
  slug: string;
  chapters: unknown[];
};

export default function Home() {
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
