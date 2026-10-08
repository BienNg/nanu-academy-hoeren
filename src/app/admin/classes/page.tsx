import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminClassStats } from "@/components/admin/AdminClassStats";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import { limitAdminClassLeague } from "@/lib/admin-class-league";
import { readAdminClassLeague } from "@/lib/class-quest-store";
import {
  classKey,
  rowsForClassScope,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireDashboard } from "@/lib/auth-guard";
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
  const classLeague = storeConfigured
    ? await readAdminClassLeague()
    : { ready: false, podiumsReady: false, league: null };
  const rows = rowsForClassScope(
    items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user))),
    access.teacherClassKeys,
  );
  const league = classLeague.league
    ? limitAdminClassLeague(classLeague.league, access.teacherClassKeys)
    : null;

  return (
    <AdminClassStats
      rows={rows}
      courseCatalog={courseCatalog}
      storeConfigured={storeConfigured}
      classLeague={{ ...classLeague, league }}
      pending={(pending ?? [])
        .filter(
          (grant) =>
            !access.teacherClassKeys ||
            access.teacherClassKeys.has(classKey(grant.className)),
        )
        .map((grant) => ({
          email: grant.email,
          className: grant.className,
        }))}
    />
  );
}
