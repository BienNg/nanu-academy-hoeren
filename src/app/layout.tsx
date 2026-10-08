import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Fredoka, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { auth } from "@/auth";
import { colors } from "@/lib/tokens";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: "700",
  display: "swap",
});

const siteUrl = "https://www.nanugo.app";
const shareTitle = "NaNu Go";
const shareDescription =
  "Học và luyện tập tiếng Đức chuyên ngành. Từ NaNu NaNa - Du Hoc Duc.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: shareTitle,
    template: "%s · NaNu Go",
  },
  description: shareDescription,
  applicationName: "NaNu Go",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: siteUrl,
    siteName: "NaNu NaNa - Du Hoc Duc",
    title: shareTitle,
    description: shareDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: shareDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: colors.surface,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="vi"
      className={`${plusJakartaSans.variable} ${beVietnamPro.variable} ${fredoka.variable} h-full antialiased`}
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
        <AuthSessionProvider session={session}>
          <AppShell>{children}</AppShell>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
