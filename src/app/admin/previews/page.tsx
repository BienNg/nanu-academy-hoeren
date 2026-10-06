import type { Metadata } from "next";
import { AdminPreviews } from "@/components/admin/AdminPreviews";
import { requireAdmin } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Previews · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminPreviewsPage() {
  await requireAdmin();
  return <AdminPreviews />;
}
