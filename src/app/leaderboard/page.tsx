import { readLastWeekClassPodium } from "@/lib/badge-store";
import { LeaderboardScreen } from "@/components/LeaderboardScreen";
import { isAdminUser } from "@/lib/admins";
import { requireUser } from "@/lib/auth-guard";
import { canPickLeaderboardClass, getClassLeaderboard, getLeaderboard } from "@/lib/xp-store";

export const dynamic = "force-dynamic";

type LeaderboardPageProps = {
  searchParams: Promise<{ board?: string | string[] }>;
};

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const session = await requireUser();
  const board = (await searchParams).board;
  const classLeague = board === "classes" || (Array.isArray(board) && board[0] === "classes");
  const canPickClass = await canPickLeaderboardClass(session.user);
  const query = {
    viewerId: session.user.id,
    viewerImage: session.user.image,
    scope: "class" as const,
    range: "week" as const,
    canPickClass,
  };
  const initial = classLeague
    ? await getClassLeaderboard(query, readLastWeekClassPodium)
    : await getLeaderboard(query);

  return (
    <LeaderboardScreen
      initial={initial}
      isAdmin={isAdminUser(session.user)}
      canPickClass={canPickClass}
    />
  );
}
