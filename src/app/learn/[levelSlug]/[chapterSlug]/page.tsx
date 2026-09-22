import { requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClips,
  getChapterVideos,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import ChapterHubClient from "./ChapterHubClient";

type LearnChapterPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
};

export default async function LearnChapterPage({
  params,
}: LearnChapterPageProps) {
  await requireUser();
  const { levelSlug, chapterSlug } = await params;

  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }

  const chapter = getLevelChapters(levelSlug).find(
    (entry) => entry.slug === chapterSlug,
  );
  if (!chapter) {
    notFound();
  }

  const clips = getChapterClips(levelSlug, chapterSlug);
  const videos = getChapterVideos(levelSlug, chapterSlug);

  return (
    <ChapterHubClient
      level={level}
      chapter={chapter}
      clipIds={clips.map((clip) => clip.id)}
      videos={videos}
    />
  );
}
