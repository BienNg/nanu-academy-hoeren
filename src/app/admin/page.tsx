import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminOverview } from "@/components/admin/AdminOverview";
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
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  countAdminPracticeParts,
  touchUserProfile,
} from "@/lib/progress-store";
import { countAdminStudyParts, sumAdminRangeXp } from "@/lib/xp-store";

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
  const range = parseAdminRange((await searchParams).range, OVERVIEW_ADMIN_RANGE);

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

  const items = storeConfigured ? await listCachedUserProgress("activity") : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );
  const xpDays = adminRangeVietnamDayKeys(range);
  const fromDay = xpDays[xpDays.length - 1] ?? xpDays[0];
  const toDay = xpDays[0];
  const xpReads = storeConfigured ? await sumAdminRangeXp(fromDay, toDay) : null;
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
  const cardUserIds = new Set<string>();
  if (partCounts?.[0]?.ready) {
    for (const [userId, count] of Object.entries(partCounts[0].byUser)) {
      if (count > 0) cardUserIds.add(userId);
    }
  }
  if (partCounts?.[1]?.ready) {
    for (const [userId, count] of Object.entries(partCounts[1].partsByUser)) {
      if (count > 0) cardUserIds.add(userId);
    }
  }

  return (
    <AdminOverview
      range={range}
      courseCatalog={courseCatalog}
      rows={rows}
      storeConfigured={storeConfigured}
      rangeXp={xpReads?.byUser ?? {}}
      rangeXpReady={xpReads?.ready === true}
      studyParts={
        partCounts == null ? 0 : partCounts[0].ready ? partCounts[0].count : null
      }
      studyPartsByUser={partCounts?.[0]?.ready ? partCounts[0].byUser : null}
      practiceParts={
        partCounts == null ? 0 : partCounts[1].ready ? partCounts[1].parts : null
      }
      practicePartsByUser={partCounts?.[1]?.ready ? partCounts[1].passedByUser : null}
      cardUserIds={[...cardUserIds]}
    />
  );
}
