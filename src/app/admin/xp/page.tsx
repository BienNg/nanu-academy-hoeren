import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminXp } from "@/components/admin/AdminXp";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  adminRangeVietnamDayKeys,
  parseAdminRange,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
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

  const tracks: AdminTrackColumn[] = getAvailableBerufe().map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  const catalog = buildAdminCourseCatalog(tracks);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listCachedUserProgress("account") : [];
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
      rows={rows}
      catalog={catalog}
      listening={listening.rows}
      duelXp={duels.rows}
      questClaims={quests.rows}
      questsReady={quests.ready}
      range={range}
      storeConfigured={storeConfigured}
      xpReady={listening.ready}
    />
  );
}
