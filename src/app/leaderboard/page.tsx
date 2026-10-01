import { LeaderboardScreen } from "@/components/LeaderboardScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { canPickLeaderboardClass, getLeaderboard } from "@/lib/xp-store";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await requireUser();
  const canPickClass = await canPickLeaderboardClass(session.user);
  const initial = await getLeaderboard({
    viewerId: session.user.id,
    viewerImage: session.user.image,
    scope: "class",
    range: "week",
    canPickClass,
  });

  return (
    <LeaderboardScreen
      initial={initial}
      isAdmin={isAdminUser(session.user)}
      canPickClass={canPickClass}
    />
  );
}
