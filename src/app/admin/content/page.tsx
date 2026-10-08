import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminCatalog } from "@/components/admin/AdminCatalog";
import { buildAdminCatalogBoard } from "@/lib/admin-catalog";
import { requireAdmin } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Catalog · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminContentPage() {
  await connection();
  await requireAdmin();
  return <AdminCatalog board={buildAdminCatalogBoard()} />;
}
