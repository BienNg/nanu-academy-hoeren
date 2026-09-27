import { buildCefrProgressCatalog } from "@/lib/admin-catalog";
import { isAdminUser } from "@/lib/admins";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import {
  countScriptWords,
  getAvailableChapters,
  getCefrLevel,
  getChapterClips,
  getLevelChapters,
} from "@/lib/levels";
import { notFound } from "next/navigation";
import LevelViewClient from "../LevelViewClient";

type LearnLevelPageProps = {
  params: Promise<{ levelSlug: string }>;
};

export default async function LearnLevelPage({ params }: LearnLevelPageProps) {
  const session = await requireUser();
  const { levelSlug } = await params;
  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }
  await requireLevelAccess(session.user, levelSlug);

  const allChapters = getLevelChapters(levelSlug);
  const availableChapters = getAvailableChapters(levelSlug);
  const availableSlugs = new Set(availableChapters.map(c => c.slug));

  const chaptersWithAudio = allChapters.map((chapter) => {
    const clips = availableSlugs.has(chapter.slug)
      ? getChapterClips(levelSlug, chapter.slug)
      : [];
    return {
      ...chapter,
      hasAudio: availableSlugs.has(chapter.slug),
      clipCount: clips.length,
      wordCount: clips.reduce(
        (total, clip) => total + countScriptWords(clip.script),
        0,
      ),
    };
  });

  return (
    <LevelViewClient
      level={level}
      chapters={chaptersWithAudio}
      cefrCatalog={buildCefrProgressCatalog()}
      isAdmin={isAdminUser(session.user)}
    />
  );
}
