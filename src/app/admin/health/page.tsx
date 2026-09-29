import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminHealth } from "@/components/admin/AdminHealth";
import { buildAdminCatalogBoard } from "@/lib/admin-catalog";
import { buildAdminHealthBoard } from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { probeAdminStores } from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Health · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminHealthPage() {
  await connection();
  await requireAdmin();

  const catalog = buildAdminCatalogBoard();
  const stores = await probeAdminStores();

  return (
    <AdminHealth
      board={buildAdminHealthBoard(stores, {
        lessonsReady: catalog.lessonsReady,
        lessonsListed: catalog.lessonsListed,
        clipsMissingAudio: catalog.clipsMissingAudio,
        videosBroken: catalog.videosBroken,
        tracksReady: catalog.tracksReady,
        tracksListed: catalog.tracksListed,
        issues: catalog.issues,
      })}
    />
  );
}
