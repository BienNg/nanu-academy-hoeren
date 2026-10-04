import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminXp } from "@/components/admin/AdminXp";
import { buildAdminQuestBoard } from "@/lib/admin-quests";
import {
  adminRangeVietnamDayKeys,
  buildAdminXpBoard,
  parseAdminRange,
  toAdminUserRow,
  withSessionIdentity,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import {
  isProgressStoreConfigured,
  listAllUserProgress,
  touchUserProfile,
} from "@/lib/progress-store";
import { listAdminQuestClaims } from "@/lib/quest-store";
import { listAdminDuelXp, listAdminListeningXp } from "@/lib/xp-store";

export const metadata: Metadata = {
  title: "XP · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminXpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireAdmin();
  const range = parseAdminRange((await searchParams).range);
  const days = adminRangeVietnamDayKeys(range);
  const fromDay = days[days.length - 1] ?? days[0];
  const toDay = days[0];

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listAllUserProgress("account") : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  const [listening, duels] = storeConfigured
    ? await Promise.all([listAdminListeningXp(fromDay, toDay), listAdminDuelXp(fromDay, toDay)])
    : [
        { ready: false, rows: [] },
        { ready: false, rows: [] },
      ];

  const quests = storeConfigured
    ? await listAdminQuestClaims(fromDay, toDay)
    : { ready: false, rows: [] };

  return (
    <AdminXp
      board={buildAdminXpBoard(rows, listening.rows, duels.rows, range)}
      quests={buildAdminQuestBoard(quests.rows, days)}
      questsReady={quests.ready}
      range={range}
      storeConfigured={storeConfigured}
      xpReady={listening.ready}
    />
  );
}
