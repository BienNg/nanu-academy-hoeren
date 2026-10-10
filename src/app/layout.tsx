import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/AppShell";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { auth } from "@/auth";
import { colors } from "@/lib/tokens";
import "./globals.css";

// Files in src/assets/fonts. next/font/google downloads at build time, and a
// Google Fonts URL with "&" in it makes Turbopack fail the production build.
const plusJakartaSans = localFont({
  src: "../assets/fonts/PlusJakartaSans-latin-vietnamese.woff2",
  variable: "--font-plus-jakarta-sans",
  weight: "200 800",
  display: "swap",
});

const beVietnamPro = localFont({
  src: [
    { path: "../assets/fonts/BeVietnamPro-latin-vietnamese-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/BeVietnamPro-latin-vietnamese-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/BeVietnamPro-latin-vietnamese-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/BeVietnamPro-latin-vietnamese-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

const fredoka = localFont({
  src: "../assets/fonts/Fredoka-Bold.ttf",
  variable: "--font-fredoka",
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
  appleWebApp: {
    capable: true,
    title: shareTitle,
    statusBarStyle: "default",
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
      suppressHydrationWarning
    >
      <head>
        {/* Hides the launch splash on later loads in this tab. Same key as SplashScreen. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(sessionStorage.getItem("nanu-splash")==="1")document.documentElement.setAttribute("data-splash","seen")}catch(e){}})()`,
          }}
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){})`,
          }}
        />
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
