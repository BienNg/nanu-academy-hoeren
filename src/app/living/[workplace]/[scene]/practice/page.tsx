import { notFound } from "next/navigation";
import { LearnSession } from "@/components/session/LearnSession";
import { requireLivingAccess, requireUser } from "@/lib/auth-guard";
import { getLivingSceneClips, getLivingScenes, getLivingWorkplace } from "@/lib/living";
import { livingSessionCourse } from "@/lib/session-course";

type LivingPracticePageProps = {
  params: Promise<{ workplace: string; scene: string }>;
};

export default async function LivingPracticePage({ params }: LivingPracticePageProps) {
  const session = await requireUser();
  const { workplace: workplaceSlug, scene: sceneId } = await params;

  const workplace = getLivingWorkplace(workplaceSlug);
  if (!workplace) notFound();
  await requireLivingAccess(session.user, workplace.slug);

  const scenes = getLivingScenes(workplace.slug);
  const index = scenes.findIndex((entry) => entry.id === sceneId);
  const scene = scenes[index];
  if (!scene) notFound();
  const nextScene = scenes[index + 1];

  return (
    <LearnSession
      course={livingSessionCourse(workplace, scene)}
      clips={getLivingSceneClips(workplace.slug, scene.id)}
      nextChapterHref={
        nextScene
          ? `/living/${workplace.slug}?lektion=${encodeURIComponent(nextScene.id)}`
          : `/living/${workplace.slug}`
      }
      hasNextChapter={Boolean(nextScene)}
    />
  );
}
