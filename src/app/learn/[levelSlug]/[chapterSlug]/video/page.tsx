import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClipInventory,
  getChapterVideos,
  getLevelChapters,
  type ChapterVideo,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import { VideoLessonScreen } from "@/components/VideoLessonCard";

type VideoLessonPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
  searchParams: Promise<{ video?: string | string[] }>;
};

/** The next path card after this video: the following video, or Study. */
function nextLessonCard(
  levelSlug: string,
  chapterSlug: string,
  videos: readonly ChapterVideo[],
  current: ChapterVideo,
): { href: string; label: string } | null {
  const index = videos.findIndex(
    (item) => item.videoId != null && item.videoId === current.videoId,
  );
  const following = (index >= 0 ? videos.slice(index + 1) : []).find(
    (item) => item.videoId,
  );
  if (following?.videoId) {
    return {
      href: `/learn/${levelSlug}/${chapterSlug}/video?video=${encodeURIComponent(following.videoId)}`,
      label: following.title,
    };
  }

  const inventory = getChapterClipInventory(levelSlug, chapterSlug);
  if (!inventory || inventory.playable === 0) return null;
  return {
    href: `/learn/${levelSlug}/${chapterSlug}/study`,
    label: "Study",
  };
}

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
  const video = requested
    ? videos.find((item) => item.videoId === requested)
    : videos[0];
  if (!video) {
    notFound();
  }

  return (
    <VideoLessonScreen
      level={level}
      chapter={chapter}
      videos={[video]}
      initialVideoId={video.videoId}
      nextCard={nextLessonCard(levelSlug, chapterSlug, videos, video)}
    />
  );
}
