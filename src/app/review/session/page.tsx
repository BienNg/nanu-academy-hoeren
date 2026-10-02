import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ReviewSession } from "@/components/session/ReviewSession";
import { requireUser } from "@/lib/auth-guard";
import { buildReviewRound } from "@/lib/leitner-store";

export const dynamic = "force-dynamic";

export default async function ReviewSessionPage() {
  const session = await requireUser();
  const round = await buildReviewRound({ id: session.user.id, email: session.user.email });
  if (round.cards.length === 0) redirect("/review");
  // A fresh key per round, so "Ôn tiếp" (a refresh) starts a new session state.
  return <ReviewSession key={randomUUID()} cards={round.cards} />;
}
