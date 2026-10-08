import { notFound } from "next/navigation";
import LevelViewClient from "@/app/learn/[levelSlug]/LevelViewClient";
import { buildLivingProgressCatalog } from "@/lib/admin-catalog";
import { requireLivingAccess, requireUser, unlocksLessonPath } from "@/lib/auth-guard";
import type { SessionClip } from "@/lib/content";
import { countScriptWords, loadLearnerCourseMenu } from "@/lib/levels";
import { getLivingSceneClips, getLivingScenes, getLivingWorkplace } from "@/lib/living";
import { livingAccessSlug } from "@/lib/living-content";

type LivingWorkplacePageProps = {
  params: Promise<{ workplace: string }>;
};

export default async function LivingWorkplacePage({ params }: LivingWorkplacePageProps) {
  const session = await requireUser();
  const { workplace: workplaceSlug } = await params;
  const workplace = getLivingWorkplace(workplaceSlug);
  if (!workplace) notFound();
  await requireLivingAccess(session.user, workplace.slug);

  const scenes = getLivingScenes(workplace.slug);
  const chapters = scenes.map((scene, index) => {
    const clips = getLivingSceneClips(workplace.slug, scene.id);
    return {
      id: scene.id,
      slug: scene.id,
      label: scene.label,
      progressKey: scene.progressKey,
      href: `/living/${workplace.slug}/${scene.id}`,
      title: `${index + 1} · ${scene.label}`,
      topic: scene.labelVi ?? null,
      hasAudio: true,
      clipCount: clips.length,
      practiceClips: clips.map((clip) => ({
        id: clip.id,
        script: clip.script,
        translationVi: clip.translationVi,
        sentenceOrder: clip.sentenceOrder,
        ...(clip.answer ? { answer: clip.answer } : {}),
        ...(clip.replies ? { replies: clip.replies } : {}),
        ...(clip.imageUrl ? { imageUrl: clip.imageUrl } : {}),
      })),
      wordCount: clips.reduce((total, clip) => total + countScriptWords(clip.script), 0),
    };
  });

  const slug = workplace.slug;
  async function loadLessonDictionary(sceneId: string): Promise<SessionClip[]> {
    "use server";
    const current = await requireUser();
    await requireLivingAccess(current.user, slug);
    return getLivingSceneClips(slug, sceneId).map((clip) => ({
      id: clip.id,
      filename: clip.filename,
      script: clip.script,
      translationVi: clip.translationVi,
      audioPath: clip.audioPath,
    }));
  }

  const courses = await loadLearnerCourseMenu(session.user);
  const place = workplace.labelVi ?? workplace.label;

  return (
    <LevelViewClient
      level={{ level: workplace.label, slug: livingAccessSlug(workplace.slug) }}
      chapters={chapters}
      cefrCatalog={buildLivingProgressCatalog(workplace.slug)}
      unlockPath={await unlocksLessonPath(session.user)}
      courses={courses}
      loadLessonDictionary={loadLessonDictionary}
      path={{
        theme: "living",
        kicker: "Leben in Deutschland",
        kickerIcon: workplace.icon ?? "storefront",
        title: workplace.label,
        description: `${place} · ${scenes.length} tình huống thực tế tại nơi làm việc. Học từng tình huống, rồi luyện tập và phản xạ.`,
        watermarkIcon: workplace.icon ?? "storefront",
        currentLabel: "Tình huống hiện tại",
        courseHref: `/living/${workplace.slug}`,
        showBlitzrunde: false,
        finish: {
          title: workplace.finishTitle ?? "Bereit für die Arbeit!",
          subtitle: `Bạn đã sẵn sàng giao tiếp tại ${place}.`,
          lockedText: "Hoàn thành mọi tình huống để nhận cúp.",
        },
      }}
    />
  );
}
