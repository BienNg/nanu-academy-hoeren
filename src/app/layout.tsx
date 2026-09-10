import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { colors } from "@/lib/tokens";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NaNu Academy Hören",
  description: "German listening and dictation practice for Vietnamese learners",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: colors.surface,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${plusJakartaSans.variable} ${beVietnamPro.variable} h-full antialiased`}
    >
      <head>
        {/* Material Symbols used by design-reference mockups (home, exercise). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="flex min-h-dvh flex-col bg-surface font-body-md text-body-md text-on-surface antialiased selection:bg-primary-fixed">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
