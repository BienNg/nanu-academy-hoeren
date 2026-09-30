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
  title: "Practice clip difficulty · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminClipDifficultyPage() {
  await connection();
  await requireAdmin();

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
    />
  );
}
