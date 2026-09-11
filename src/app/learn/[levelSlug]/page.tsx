import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { getCefrLevel, getLevelChapters } from "@/lib/levels";
import { notFound } from "next/navigation";

type LearnLevelPageProps = {
  params: Promise<{ levelSlug: string }>;
};

export default async function LearnLevelPage({ params }: LearnLevelPageProps) {
  await requireAdmin();
  const { levelSlug } = await params;
  const level = getCefrLevel(levelSlug);
  if (!level) {
    notFound();
  }

  const chapters = getLevelChapters(levelSlug);

  return (
    <main className="flex flex-1 flex-col gap-space-16 px-space-16 py-space-24">
      <div className="flex flex-col gap-space-4">
        <p className="font-caption text-caption text-on-surface-variant">
          Luyện tập theo trình độ
        </p>
        <h1 className="font-headline-sm text-headline-sm text-on-surface">
          Trình độ {level.level}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {chapters.length === 0
            ? "Chưa có chương nào. Thêm Lektion trong chapters.json và file nội dung tương ứng."
            : `${chapters.length} chương`}
        </p>
      </div>

      <ul className="flex flex-col gap-space-8">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              href={`/learn/${level.slug}/${chapter.slug}`}
              className="flex items-center justify-between rounded-2xl border border-surface-container bg-surface-container-lowest px-space-16 py-space-12 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all hover:opacity-95 active:scale-[0.98]"
            >
              <p className="font-label-lg text-label-lg text-on-surface">
                {level.level} - {chapter.label}
              </p>
              <span className="material-symbols-outlined text-[18px] text-primary-container" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
