import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { isAdminUser } from "@/lib/admins";
import { requireAdmin } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Admin · NaNu Academy Hören",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireAdmin();
  const role = isAdminUser(session.user) ? "owner" : "staff";

  return <AdminShell role={role}>{children}</AdminShell>;
}
