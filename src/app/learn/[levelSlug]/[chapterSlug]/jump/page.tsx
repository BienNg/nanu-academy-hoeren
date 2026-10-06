import { redirect, notFound } from "next/navigation";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  getAvailableChapters,
  getCefrLevel,
  getChapterClips,
  getChapterVideos,
  getLevelChapters,
} from "@/lib/levels";
import { lessonVideoProgressKey } from "@/lib/progress";
import { levelSessionCourse } from "@/lib/session-course";
import { JumpSession } from "@/components/session/JumpSession";

type LessonJumpPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
};

/** Jump test that skips `chapterSlug` and opens the Lektion after it. */
export default async function LessonJumpPage({ params }: LessonJumpPageProps) {
  const session = await requireUser();
  const { levelSlug, chapterSlug } = await params;

  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }
  await requireLevelAccess(session.user, levelSlug);

  const chapters = getLevelChapters(levelSlug);
  const chapterIndex = chapters.findIndex((entry) => entry.slug === chapterSlug);
  const chapter = chapters[chapterIndex];
  if (!chapter) {
    notFound();
  }

  const course = levelSessionCourse(level, chapter);
  const playable = new Set(getAvailableChapters(levelSlug).map((entry) => entry.slug));
  const target = chapters[chapterIndex + 1];
  if (!playable.has(chapterSlug) || !target || !playable.has(target.slug)) {
    redirect(course.pathHref);
  }

  const videoKeys = getChapterVideos(levelSlug, chapterSlug).flatMap((video) =>
    video.videoId ? [lessonVideoProgressKey(levelSlug, chapterSlug, video.videoId)] : [],
  );

  return (
    <JumpSession
      course={course}
      clips={getChapterClips(levelSlug, chapterSlug)}
      videoKeys={videoKeys}
      earlierChapterKeys={chapters
        .slice(0, chapterIndex)
        .filter((entry) => playable.has(entry.slug))
        .map((entry) => entry.slug)}
      targetLabel={target.label}
      targetHref={`/learn/${levelSlug}?lektion=${encodeURIComponent(target.slug)}`}
    />
  );
}
