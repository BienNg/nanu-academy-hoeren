import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import { StudySession } from "@/components/session/StudySession";

type LearnStudyPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function LearnStudyPage({
  params,
  searchParams,
}: LearnStudyPageProps) {
  const session = await requireUser();
  const { levelSlug, chapterSlug } = await params;
  const query = await searchParams;
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;

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

  return (
    <StudySession
      level={level}
      chapter={chapter}
      clips={clips}
      initialViewMode={requestedView === "list" ? "list" : "cards"}
    />
  );
}
