import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminActivity } from "@/components/admin/AdminActivity";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import { loadActivityWindow } from "@/app/admin/range-data";
import {
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
import { isProgressStoreConfigured, touchUserProfile } from "@/lib/progress-store";

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

  const items = storeConfigured ? await listCachedUserProgress("activity") : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );
  const parts = await loadActivityWindow(range);

  return (
    <AdminActivity
      rows={rows}
      catalog={catalog}
      range={range}
      storeConfigured={storeConfigured}
      parts={parts}
    />
  );
}
