import { AdminUsersDashboard } from "@/components/admin/AdminUsersDashboard";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { getCefrLevels } from "@/lib/levels";
import {
  isProgressStoreConfigured,
  listAllUserProgress,
  touchUserProfile,
} from "@/lib/progress-store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdmin();

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

  const items = storeConfigured ? await listAllUserProgress() : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
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
