import Link from "next/link";
import {
  getAvailableBerufe,
  getSessionClips,
} from "@/lib/content";
import { requireUser } from "@/lib/auth-guard";
import { InterviewSession } from "@/components/session/InterviewSession";

type InterviewBerufPageProps = {
  params: Promise<{ berufId: string }>;
};

function NotAvailableYet({ berufId }: { berufId: string }) {
  return (
    <main className="relative flex w-full flex-1 flex-col items-center justify-center gap-space-16 bg-surface px-margin-mobile py-space-32 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-outline">
        <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
          lock
        </span>
      </div>
      <div className="flex max-w-md flex-col gap-space-8">
        <h1 className="font-headline-md text-headline-md text-on-surface">
          Chưa có nội dung
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Nghề{" "}
          <span className="font-semibold text-on-surface">{berufId}</span> chưa
          có bài luyện phỏng vấn. Quay lại trang chủ để chọn nghề đang mở.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-[48px] items-center justify-center gap-space-8 rounded-2xl bg-primary-container px-space-20 font-label-lg text-label-lg text-on-primary transition-all hover:opacity-95 active:scale-[0.98]"
      >
        Về trang chủ
      </Link>
    </main>
  );
}

export default async function InterviewBerufPage({
  params,
}: InterviewBerufPageProps) {
  await requireUser();
  const { berufId } = await params;
  const available = getAvailableBerufe();
  const beruf = available.find((entry) => entry.slug === berufId);

  if (!beruf) {
    return <NotAvailableYet berufId={berufId} />;
  }

  const clips = getSessionClips(beruf.slug);

  return <InterviewSession beruf={beruf} clips={clips} />;
}
