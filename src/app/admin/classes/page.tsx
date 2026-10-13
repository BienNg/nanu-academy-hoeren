import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminClassStats } from "@/components/admin/AdminClassStats";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import { limitAdminClassLeague } from "@/lib/admin-class-league";
import { readAdminClassLeague } from "@/lib/class-quest-store";
import { listClassSchedules } from "@/lib/class-schedule-store";
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
import { getCefrLevels } from "@/lib/levels";
import {
  isProgressStoreConfigured,
  listPendingLevelGrants,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Classes · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  await connection();
  const requestedClass = (await searchParams).class;
  const initialClassKey = classKey(
    Array.isArray(requestedClass) ? requestedClass[0] : requestedClass,
  );
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
  const allSchedules = storeConfigured ? await listClassSchedules() : [];
  const schedules = (allSchedules ?? []).filter(
    (schedule) => !access.teacherClassKeys || access.teacherClassKeys.has(schedule.classKey),
  );
  const scheduleLevels = getCefrLevels().map((level) => ({
    slug: level.slug,
    label: level.level,
    lektionen: level.chapters.length,
  }));
  const rows = rowsForClassScope(
    items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user))),
    access.teacherClassKeys,
  );
  const league = classLeague.league
    ? limitAdminClassLeague(classLeague.league, access.teacherClassKeys)
    : null;

  return (
    <AdminClassStats
      initialClassKey={initialClassKey || null}
      rows={rows}
      courseCatalog={courseCatalog}
      storeConfigured={storeConfigured}
      classLeague={{ ...classLeague, league }}
      schedules={schedules}
      schedulesReady={allSchedules !== null}
      scheduleLevels={scheduleLevels}
      canEditSchedule={access.role !== "teacher"}
      now={new Date().toISOString()}
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
