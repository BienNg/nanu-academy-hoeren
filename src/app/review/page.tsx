import { ReviewSession } from "@/components/session/ReviewSession";
import { requireUser } from "@/lib/auth-guard";
import { REVIEW_DECK_SIZE } from "@/lib/review";
import { getReviewDeck } from "@/lib/review-store";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const session = await requireUser();
  const deck = await getReviewDeck(
    { id: session.user.id, email: session.user.email },
    REVIEW_DECK_SIZE,
  );
  return (
    <ReviewSession
      key={deck.clips.map((clip) => `${clip.lessonKey}/${clip.id}`).join("|")}
      clips={deck.clips}
      dueCount={deck.due}
      ready={deck.ready}
    />
  );
}
