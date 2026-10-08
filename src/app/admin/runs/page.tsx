import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminListeningRuns } from "@/components/admin/AdminListeningRuns";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  buildAdminListeningRunBoard,
  parseAdminRange,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { listCachedAdminListeningRuns, listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  listAdminMissedClipIds,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Practice · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminListeningRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireAdmin();
  const range = parseAdminRange((await searchParams).range);

  const berufe = getAvailableBerufe();
  const tracks: AdminTrackColumn[] = berufe.map((beruf) => ({
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
  const people = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  const runs = storeConfigured
    ? await listCachedAdminListeningRuns()
    : { status: "error" as const, rows: [] };
  const board = buildAdminListeningRunBoard(runs.rows, range);
  const missedClipIds =
    storeConfigured && runs.status === "ready"
      ? await listAdminMissedClipIds(
          board.recent.filter((run) => run.accuracy < 100).map((run) => run.id),
        )
      : {};

  return (
    <AdminListeningRuns
      runs={runs.rows}
      people={people}
      catalog={catalog}
      range={range}
      status={runs.status}
      storeConfigured={storeConfigured}
      missedClipIds={missedClipIds}
    />
  );
}
