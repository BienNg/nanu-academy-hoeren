import { notFound } from "next/navigation";
import { PeerProfileScreen, type PeerProfile } from "@/components/AccountScreen";
import { requireUser } from "@/lib/auth-guard";
import { syncBadges } from "@/lib/badge-store";
import { activeStreakDays } from "@/lib/progress";
import { getCloudProgress, readLearnerCard } from "@/lib/progress-store";
import { leaderboardDisplayName, recentDayKeys } from "@/lib/xp";
import { getLeaderboard, getUserDailyXp, getUserXpTotals } from "@/lib/xp-store";

export const dynamic = "force-dynamic";

type PeerProfilePageProps = {
  params: Promise<{ userId: string }>;
};

function readUserId(value: string): string | null {
  let id = value;
  try {
    id = decodeURIComponent(value);
  } catch {
    return null;
  }
  id = id.trim();
  if (id.length < 1 || id.length > 128 || /[^\w.-]/.test(id)) return null;
  return id;
}

export default async function PeerProfilePage({ params }: PeerProfilePageProps) {
  const session = await requireUser();
  const userId = readUserId((await params).userId);
  if (!userId) notFound();

  const card = await readLearnerCard(userId);
  if (!card) notFound();

  const now = new Date();
  const days = recentDayKeys(now);
  const boardInput = {
    viewerId: userId,
    viewerImage: card.image,
    scope: "class" as const,
    canPickClass: false,
  };
  const emptyDays = days.map((day) => ({ day, xp: 0 }));

  const [progress, totals, allTime, week, badges, themDaily, youDaily] = await Promise.all([
    getCloudProgress(userId),
    getUserXpTotals(userId),
    getLeaderboard({ ...boardInput, range: "all" }),
    getLeaderboard({ ...boardInput, range: "week" }),
    syncBadges(userId).catch((error: unknown) => {
      console.error("peer profile badges", error);
      return null;
    }),
    getUserDailyXp(userId, now).catch((error: unknown) => {
      console.error("peer profile daily xp", error);
      return null;
    }),
    getUserDailyXp(session.user.id, now).catch((error: unknown) => {
      console.error("peer profile viewer daily xp", error);
      return null;
    }),
  ]);

  const className = allTime.className;
  const earned = badges?.board.families.filter((family) => family.tier > 0) ?? [];
  const podium = badges?.board.families.find((family) => family.id === "podium");
  const profile: PeerProfile = {
    name: leaderboardDisplayName(card.name),
    image: card.image,
    isYou: userId === session.user.id,
    streakDays: activeStreakDays(progress),
    totalXp: totals.total,
    weekRank: week.className && week.yourRank ? week.yourRank : null,
    top3: podium?.value ?? 0,
    className,
    classXp: className ? allTime.rows.reduce((sum, row) => sum + row.xp, 0) : 0,
    classSize: className ? allTime.rows.length : 0,
    badges: earned,
    youDays: youDaily ?? emptyDays,
    themDays: themDaily ?? emptyDays,
  };

  return <PeerProfileScreen profile={profile} />;
}
