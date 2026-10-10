import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminActivity } from "@/components/admin/AdminActivity";
import { parseActivityTab } from "@/lib/admin-learning";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import { loadActivityWindow, loadLearningWindow } from "@/app/admin/range-data";
import {
  OVERVIEW_ADMIN_RANGE,
  parseAdminRange,
  shortBerufLabel,
  rowsForClassScope,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireDashboard } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { isProgressStoreConfigured, touchUserProfile } from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Activity · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const access = await requireDashboard();
  const session = access.session;
  const params = await searchParams;
  const range = parseAdminRange(params.range, OVERVIEW_ADMIN_RANGE);
  const tab = parseActivityTab(params.tab);

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

  const items = storeConfigured ? await listCachedUserProgress("activity") : [];
  const rows = rowsForClassScope(
    items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user))),
    access.teacherClassKeys,
  );
  const [parts, learning] = await Promise.all([
    loadActivityWindow(range),
    tab === "learning" ? loadLearningWindow() : Promise.resolve(null),
  ]);

  return (
    <AdminActivity
      rows={rows}
      catalog={catalog}
      range={range}
      storeConfigured={storeConfigured}
      parts={parts}
      tab={tab}
      learning={learning}
    />
  );
}
