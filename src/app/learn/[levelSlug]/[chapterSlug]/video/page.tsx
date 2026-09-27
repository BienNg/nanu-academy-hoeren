import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterVideos,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import { VideoLessonScreen } from "@/components/VideoLessonCard";

type VideoLessonPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
  searchParams: Promise<{ video?: string | string[] }>;
};

export default async function VideoLessonPage({
  params,
  searchParams,
}: VideoLessonPageProps) {
  const session = await requireUser();
  const { levelSlug, chapterSlug } = await params;
  const query = await searchParams;
  const requested = Array.isArray(query.video) ? query.video[0] : query.video;

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

  const videos = getChapterVideos(levelSlug, chapterSlug);
  if (videos.length === 0) {
    notFound();
  }

  return (
    <VideoLessonScreen
      level={level}
      chapter={chapter}
      videos={videos}
      initialVideoId={requested ?? null}
    />
  );
}
