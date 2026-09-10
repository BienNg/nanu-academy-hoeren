import type { Metadata } from "next";
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
  await requireAdmin();

  return (
    <div
      data-layout="wide"
      className="flex w-full flex-1 flex-col bg-surface"
    >
      {children}
    </div>
  );
}
