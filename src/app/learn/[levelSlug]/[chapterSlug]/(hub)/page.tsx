import { isAdminUser } from "@/lib/admins";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClips,
  getChapterVideos,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import ChapterHubClient from "../ChapterHubClient";

type LearnChapterPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
};

export default async function LearnChapterPage({
  params,
}: LearnChapterPageProps) {
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
  const videos = getChapterVideos(levelSlug, chapterSlug);

  return (
    <ChapterHubClient
      level={level}
      chapter={chapter}
      clipIds={clips.map((clip) => clip.id)}
      videos={videos}
      isAdmin={isAdminUser(session.user)}
    />
  );
}
