import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import { getCefrLevel, getLevelChapters } from "@/lib/levels";
import { notFound, redirect } from "next/navigation";

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

  redirect(`/learn/${levelSlug}?lektion=${encodeURIComponent(chapterSlug)}`);
}
