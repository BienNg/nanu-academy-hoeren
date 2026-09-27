import { LeaderboardScreen } from "@/components/LeaderboardScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { getLeaderboard } from "@/lib/xp-store";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await requireUser();
  const initial = await getLeaderboard({
    viewerId: session.user.id,
    scope: "class",
    range: "week",
  });

  return (
    <LeaderboardScreen initial={initial} isAdmin={isAdminUser(session.user)} />
  );
}
