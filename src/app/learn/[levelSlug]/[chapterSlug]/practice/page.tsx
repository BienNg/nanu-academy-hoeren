import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import { LearnSession } from "@/components/session/LearnSession";
import { levelSessionCourse } from "@/lib/session-course";
import { parseNodeParam } from "@/lib/progress";

type LearnPracticePageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
  searchParams: Promise<{ node?: string | string[] }>;
};

export default async function LearnPracticePage({
  params,
  searchParams,
}: LearnPracticePageProps) {
  const session = await requireUser();
  const { levelSlug, chapterSlug } = await params;
  const query = await searchParams;

  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }
  await requireLevelAccess(session.user, levelSlug);

  const chapters = getLevelChapters(levelSlug);
  const chapter = chapters.find((entry) => entry.slug === chapterSlug);
  if (!chapter) {
    notFound();
  }

  const chapterIndex = chapters.findIndex((entry) => entry.slug === chapterSlug);
  const nextChapter = chapterIndex >= 0 ? chapters[chapterIndex + 1] : undefined;
  const clips = getChapterClips(levelSlug, chapterSlug);

  return (
    <LearnSession
      course={levelSessionCourse(level, chapter)}
      clips={clips}
      nextChapterHref={
        nextChapter
          ? `/learn/${levelSlug}?lektion=${encodeURIComponent(nextChapter.slug)}`
          : `/learn/${levelSlug}`
      }
      hasNextChapter={Boolean(nextChapter)}
      node={parseNodeParam(query.node)}
    />
  );
}
