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
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  listAdminListeningRuns,
  listAllUserProgress,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Listening runs · Admin · NaNu Academy Hören",
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

  const items = storeConfigured ? await listAllUserProgress() : [];
  const people = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  const runs = storeConfigured
    ? await listAdminListeningRuns()
    : { status: "error" as const, rows: [] };

  return (
    <AdminListeningRuns
      board={buildAdminListeningRunBoard(runs.rows, range)}
      people={people}
      catalog={catalog}
      range={range}
      status={runs.status}
      storeConfigured={storeConfigured}
    />
  );
}
