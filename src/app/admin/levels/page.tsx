import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminLevels } from "@/components/admin/AdminLevels";
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
  title: "Levels · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminLevelsPage() {
  await connection();
  const access = await requireDashboard();
  const session = access.session;

  const tracks: AdminTrackColumn[] = getAvailableBerufe().map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });
  }

  const items = storeConfigured ? await listCachedUserProgress("levels") : [];

  return (
    <AdminLevels
      rows={rowsForClassScope(
        items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user))),
        access.teacherClassKeys,
      )}
      levels={getCefrLevels().map(({ level, slug }) => ({ level, slug }))}
      courseCatalog={buildAdminCourseCatalog(tracks)}
      storeConfigured={storeConfigured}
    />
  );
}
