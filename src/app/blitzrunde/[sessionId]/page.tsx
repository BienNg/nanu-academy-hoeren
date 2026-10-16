import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlitzrundePlayScreen } from "@/components/blitzrunde/BlitzrundePlayScreen";
import { requireUser } from "@/lib/auth-guard";
import { BLITZRUNDE_ENABLED, isBlitzrundeId } from "@/lib/blitzrunde";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blitzrunde",
  robots: { index: false, follow: false },
};

export default async function BlitzrundePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireUser();
  const { sessionId } = await params;
  if (!isBlitzrundeId(sessionId)) notFound();
  if (!BLITZRUNDE_ENABLED) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-extrabold text-[#131b2e]">Blitzrunde đang tạm dừng</h1>
        <p className="mt-2 text-sm font-semibold text-[#64748b]">Giáo viên sẽ mở lại khi sẵn sàng.</p>
      </main>
    );
  }
  return <BlitzrundePlayScreen sessionId={sessionId} />;
}
