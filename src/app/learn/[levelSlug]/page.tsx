import { requireUser } from "@/lib/auth-guard";
import {
  getAvailableChapters,
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import LevelViewClient from "./LevelViewClient";

type LearnLevelPageProps = {
  params: Promise<{ levelSlug: string }>;
};

export default async function LearnLevelPage({ params }: LearnLevelPageProps) {
  await requireUser();
  const { levelSlug } = await params;
  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }

  const allChapters = getLevelChapters(levelSlug);
  const availableChapters = getAvailableChapters(levelSlug);
  const availableSlugs = new Set(availableChapters.map(c => c.slug));

  const chaptersWithAudio = allChapters.map(chapter => ({
    ...chapter,
    hasAudio: availableSlugs.has(chapter.slug),
    clipCount: availableSlugs.has(chapter.slug)
      ? getChapterClips(levelSlug, chapter.slug).length
      : 0,
  }));

  return <LevelViewClient level={level} chapters={chaptersWithAudio} />;
}
