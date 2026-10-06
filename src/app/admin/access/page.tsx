import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminAccess } from "@/components/admin/AdminAccess";
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
import { getCefrLevels } from "@/lib/levels";
import { getLivingWorkplaces } from "@/lib/living";
import {
  isProgressStoreConfigured,
  listPendingLevelGrants,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Access · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminAccessPage() {
  await connection();
  const session = await requireAdmin();
  const levels = getCefrLevels().map(({ level, slug }) => ({ level, slug }));
  const workplaces = getLivingWorkplaces().map(({ slug, label }) => ({ slug, label }));

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
  const pending = storeConfigured ? await listPendingLevelGrants() : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  return (
    <AdminAccess
      rows={rows}
      catalog={catalog}
      levels={levels}
      workplaces={workplaces}
      storeConfigured={storeConfigured}
      pending={pending ?? []}
      pendingReady={pending !== null}
    />
  );
}
