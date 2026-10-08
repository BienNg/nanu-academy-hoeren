import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireDashboard } from "@/lib/auth-guard";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { role } = await requireDashboard();

  return (
    <AdminShell role={role} fontClassName={`${inter.variable} ${jetbrainsMono.variable}`}>
      {children}
    </AdminShell>
  );
}
