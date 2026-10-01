import { notFound } from "next/navigation";
import { StudySession } from "@/components/session/StudySession";
import { requireLivingAccess, requireUser } from "@/lib/auth-guard";
import { getLivingScene, getLivingSceneClips, getLivingWorkplace } from "@/lib/living";
import { livingSessionCourse } from "@/lib/session-course";

type LivingStudyPageProps = {
  params: Promise<{ workplace: string; scene: string }>;
  searchParams: Promise<{ view?: string | string[]; replay?: string | string[] }>;
};

export default async function LivingStudyPage({ params, searchParams }: LivingStudyPageProps) {
  const session = await requireUser();
  const { workplace: workplaceSlug, scene: sceneId } = await params;
  const query = await searchParams;
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  const requestedReplay = Array.isArray(query.replay) ? query.replay[0] : query.replay;

  const workplace = getLivingWorkplace(workplaceSlug);
  if (!workplace) notFound();
  await requireLivingAccess(session.user, workplace.slug);

  const scene = getLivingScene(workplace.slug, sceneId);
  if (!scene) notFound();

  return (
    <StudySession
      course={livingSessionCourse(workplace, scene)}
      clips={getLivingSceneClips(workplace.slug, scene.id)}
      initialViewMode={requestedView === "list" ? "list" : "cards"}
      startReplay={requestedReplay === "1"}
    />
  );
}
