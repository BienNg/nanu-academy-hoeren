import { requireUser } from "@/lib/auth-guard";

type LearnChapterPageProps = {
  params: Promise<{ chapterId: string }>;
};

export default async function LearnChapterPage({
  params,
}: LearnChapterPageProps) {
  await requireUser();
  const { chapterId } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-space-16">
      <p className="font-body-md text-body-md text-on-surface-variant">
        Learn · {chapterId}
      </p>
    </main>
  );
}
