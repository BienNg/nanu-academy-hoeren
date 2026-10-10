import type { Metadata } from "next";
import localFont from "next/font/local";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireDashboard } from "@/lib/auth-guard";

// Same reason as the root layout: these files are in the repo, so the build
// does not fetch Google Fonts.
const inter = localFont({
  src: "../../assets/fonts/Inter-latin-vietnamese.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../../assets/fonts/JetBrainsMono-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "Admin",
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
