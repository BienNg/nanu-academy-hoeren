import { notFound } from "next/navigation";
import { isAdminUser } from "@/lib/admins";
import { requireLivingAccess, requireUser } from "@/lib/auth-guard";
import { getLivingSceneClips, getLivingScenes, getLivingWorkplace } from "@/lib/living";
import LivingWorkplaceView, { type LivingSceneSummary } from "./LivingWorkplaceView";

type LivingWorkplacePageProps = {
  params: Promise<{ workplace: string }>;
  searchParams: Promise<{ scene?: string | string[] }>;
};

export default async function LivingWorkplacePage({
  params,
  searchParams,
}: LivingWorkplacePageProps) {
  const session = await requireUser();
  const { workplace: workplaceSlug } = await params;
  const query = await searchParams;
  const focusScene = Array.isArray(query.scene) ? query.scene[0] : query.scene;

  const workplace = getLivingWorkplace(workplaceSlug);
  if (!workplace) notFound();
  await requireLivingAccess(session.user, workplace.slug);

  const scenes: LivingSceneSummary[] = getLivingScenes(workplace.slug).map((scene) => {
    const clips = getLivingSceneClips(workplace.slug, scene.id);
    return {
      id: scene.id,
      label: scene.label,
      labelVi: scene.labelVi ?? null,
      progressKey: scene.progressKey,
      clipCount: clips.length,
      replyCount: clips.filter((clip) => clip.replies).length,
      numberCount: clips.filter((clip) => clip.answer).length,
      imageCount: clips.filter((clip) => clip.imageUrl).length,
    };
  });

  return (
    <LivingWorkplaceView
      workplace={workplace}
      scenes={scenes}
      focusScene={focusScene ?? null}
      isAdmin={isAdminUser(session.user)}
    />
  );
}
