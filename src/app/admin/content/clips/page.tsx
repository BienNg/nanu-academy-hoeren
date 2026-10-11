import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminClipDifficulty } from "@/components/admin/AdminClipDifficulty";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import { shortBerufLabel, type AdminTrackColumn } from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  listClipOutcomeTotals,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Practice clip difficulty · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminClipDifficultyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  await requireAdmin();
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = first(params.tab) === "behavior" ? "behavior" : "clips";
  const cohort = first(params.cohort);

  const berufe = getAvailableBerufe();
  const tracks: AdminTrackColumn[] = berufe.map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  const catalog = buildAdminCourseCatalog(tracks);
  const storeConfigured = isProgressStoreConfigured();
  const totals = storeConfigured
    ? await listClipOutcomeTotals()
    : { status: "error" as const, rows: [] };

  return (
    <AdminClipDifficulty
      catalog={catalog}
      rows={totals.rows}
      status={totals.status}
      storeConfigured={storeConfigured}
      tab={tab}
      cohortId={cohort && /^[0-9a-f-]{36}$/i.test(cohort) ? cohort : null}
    />
  );
}
