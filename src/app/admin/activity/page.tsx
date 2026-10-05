import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminActivity } from "@/components/admin/AdminActivity";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  adminRangeVietnamDayKeys,
  adminRangeVietnamInterval,
  OVERVIEW_ADMIN_RANGE,
  parseAdminRange,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  countAdminPracticeParts,
  isProgressStoreConfigured,
  listAllUserProgress,
  touchUserProfile,
} from "@/lib/progress-store";
import { countAdminStudyParts } from "@/lib/xp-store";

export const metadata: Metadata = {
  title: "Activity · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireAdmin();
  const range = parseAdminRange((await searchParams).range, OVERVIEW_ADMIN_RANGE);

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

  const items = storeConfigured ? await listAllUserProgress("activity") : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );
  const xpDays = adminRangeVietnamDayKeys(range);
  const fromDay = xpDays[xpDays.length - 1] ?? xpDays[0];
  const toDay = xpDays[0];
  const partWindow = adminRangeVietnamInterval(range);
  const learnerIds = new Set(
    rows.filter((row) => !row.isAdmin && !row.staff).map((row) => row.userId),
  );
  const partCounts = storeConfigured
    ? await Promise.all([
        countAdminStudyParts(fromDay, toDay, learnerIds),
        countAdminPracticeParts(partWindow.from, partWindow.to, learnerIds),
      ])
    : null;

  return (
    <AdminActivity
      rows={rows}
      catalog={catalog}
      range={range}
      storeConfigured={storeConfigured}
      studyPartsByUser={partCounts?.[0]?.ready ? partCounts[0].byUser : {}}
      practicePartsByUser={partCounts?.[1]?.ready ? partCounts[1].partsByUser : {}}
    />
  );
}
