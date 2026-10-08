import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlitzrundePlayScreen } from "@/components/blitzrunde/BlitzrundePlayScreen";
import { requireUser } from "@/lib/auth-guard";
import { isBlitzrundeId } from "@/lib/blitzrunde";

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
  return <BlitzrundePlayScreen sessionId={sessionId} />;
}
