import { ReviewHomeScreen } from "@/components/ReviewHomeScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { getReviewOverview } from "@/lib/leitner-store";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const session = await requireUser();
  const overview = await getReviewOverview({ id: session.user.id, email: session.user.email });
  return <ReviewHomeScreen overview={overview} isAdmin={isAdminUser(session.user)} />;
}
