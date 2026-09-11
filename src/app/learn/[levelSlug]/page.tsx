import { requireUser } from "@/lib/auth-guard";
import { getCefrLevel, getLevelChapters } from "@/lib/levels";
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

  const chapters = getLevelChapters(levelSlug);

  return <LevelViewClient level={level} chapters={chapters} />;
}
