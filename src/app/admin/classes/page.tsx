import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminClassStats } from "@/components/admin/AdminClassStats";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
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
  listPendingLevelGrants,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Classes · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminClassesPage() {
  await connection();
  const session = await requireAdmin();

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

  // Course, lesson, practice, and video totals need learn, interview, and videos.
  const items = storeConfigured ? await listCachedUserProgress("levels") : [];
  const pending = storeConfigured ? await listPendingLevelGrants() : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  return (
    <AdminClassStats
      rows={rows}
      courseCatalog={courseCatalog}
      storeConfigured={storeConfigured}
      pending={(pending ?? []).map((grant) => ({
        email: grant.email,
        className: grant.className,
      }))}
    />
  );
}
