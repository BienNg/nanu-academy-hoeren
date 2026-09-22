import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import { LearnSession } from "@/components/session/LearnSession";

type LearnPracticePageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
};

export default async function LearnPracticePage({
  params,
}: LearnPracticePageProps) {
  const session = await requireUser();
  const { levelSlug, chapterSlug } = await params;

  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }
  await requireLevelAccess(session.user, levelSlug);

  const chapter = getLevelChapters(levelSlug).find(
    (entry) => entry.slug === chapterSlug,
  );
  if (!chapter) {
    notFound();
  }

  const clips = getChapterClips(levelSlug, chapterSlug);

  return <LearnSession level={level} chapter={chapter} clips={clips} />;
}
