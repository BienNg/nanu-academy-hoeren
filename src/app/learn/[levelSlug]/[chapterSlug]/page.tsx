import { requireAdmin } from "@/lib/auth-guard";
import {
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";

type LearnChapterPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
};

export default async function LearnChapterPage({
  params,
}: LearnChapterPageProps) {
  await requireAdmin();
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

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-space-8 px-space-16">
      <p className="font-caption text-caption text-on-surface-variant">
        {level.level} - {chapter.label}
      </p>
      <p className="font-body-md text-body-md text-on-surface-variant">
        {clips.length === 0
          ? "Chưa có bài nghe — thêm clips vào file nội dung."
          : `${clips.length} bài nghe sẵn sàng`}
      </p>
      <p className="font-caption text-caption text-outline">
        src/data/levels/{levelSlug}/{chapterSlug}.json
      </p>
    </main>
  );
}
