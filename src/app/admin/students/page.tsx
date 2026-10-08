import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminUsersDashboard } from "@/components/admin/AdminUsersDashboard";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  shortBerufLabel,
  rowsForClassScope,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireDashboard } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { getCefrLevels } from "@/lib/levels";
import {
  isProgressStoreConfigured,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Students · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminStudentsPage() {
  await connection();
  const access = await requireDashboard();
  const session = access.session;

  const berufe = getAvailableBerufe();
  const tracks: AdminTrackColumn[] = berufe.map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  const courseCatalog = buildAdminCourseCatalog(tracks);
  const levels = getCefrLevels().map(({ level, slug }) => ({ level, slug }));

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listCachedUserProgress("account") : [];
  const rows = rowsForClassScope(
    items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user))),
    access.teacherClassKeys,
  );

  return (
    <AdminUsersDashboard
      rows={rows}
      levels={levels}
      courseCatalog={courseCatalog}
      storeConfigured={storeConfigured}
      currentUserId={session.user.id}
    />
  );
}
