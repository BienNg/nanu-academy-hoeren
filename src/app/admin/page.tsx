import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  buildAdminActivityStats,
  parseAdminRange,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  xpByUserOnDay,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  listAllUserProgress,
  touchUserProfile,
} from "@/lib/progress-store";
import { dayKey } from "@/lib/xp";
import { listAdminDuelXp, listAdminListeningXp } from "@/lib/xp-store";

export const metadata: Metadata = {
  title: "Overview · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireAdmin();
  const range = parseAdminRange((await searchParams).range);

  const berufe = getAvailableBerufe();
  const tracks: AdminTrackColumn[] = berufe.map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  const courseCatalog = buildAdminCourseCatalog(tracks);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listAllUserProgress() : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );
  const activity = buildAdminActivityStats(rows, range);
  const today = dayKey(new Date());
  const xpReads = storeConfigured
    ? await Promise.all([listAdminListeningXp(today, today), listAdminDuelXp(today, today)])
    : null;

  return (
    <AdminOverview
      activity={activity}
      range={range}
      courseCatalog={courseCatalog}
      rows={rows}
      storeConfigured={storeConfigured}
      todayXp={xpByUserOnDay(xpReads?.[0].rows ?? [], xpReads?.[1].rows ?? [], today)}
      todayXpReady={xpReads?.[0].ready === true}
    />
  );
}
