import { notFound } from "next/navigation";
import { DuelPlayScreen } from "@/components/DuelPlayScreen";
import { requireUser } from "@/lib/auth-guard";
import { isDuelId } from "@/lib/duels";

export const dynamic = "force-dynamic";

export default async function DuelPlayPage({
  params,
}: {
  params: Promise<{ duelId: string }>;
}) {
  await requireUser();
  const { duelId } = await params;
  if (!isDuelId(duelId)) notFound();
  return <DuelPlayScreen key={duelId} duelId={duelId} />;
}
