"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomNav, publishPendingNav } from "@/components/BottomNav";

const screenFont = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

const WAVE_HEIGHTS = [12, 20, 32, 44, 28, 40, 36, 24, 32, 40, 48, 36, 28, 40, 24, 32, 20, 28];

function LoadingBar() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px] overflow-hidden"
      aria-hidden="true"
    >
      <div className="route-loading-bar h-full w-1/4 bg-[#0066cc]" />
    </div>
  );
}

function Bone({
  className,
  style,
}: {
  className: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse bg-[#e8e8ed] motion-reduce:animate-none ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

function LoadingTitle() {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[15px] font-bold text-[#1d1d1f]">
      <span
        className="material-symbols-outlined shrink-0 animate-spin text-[16px] text-[#0066cc] motion-reduce:animate-none"
        aria-hidden="true"
      >
        progress_activity
      </span>
      <span className="truncate">Đang tải…</span>
    </span>
  );
}

export function backHrefFor(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "learn") {
    if (parts.length >= 3 && parts[1] && parts[2]) {
      return `/learn/${parts[1]}?lektion=${encodeURIComponent(parts[2])}`;
    }
    if (parts.length === 2) return "/";
  }
  if (parts[0] === "living") {
    if (parts.length >= 3 && parts[1]) return `/living/${parts[1]}`;
    return "/";
  }
  if (parts[0] === "interview" || parts[0] === "account") return "/";
  if (parts[0] === "admin" && parts.length > 1) return "/admin";
  if (parts[0] === "admin") return "/";
  return null;
}

function useResolvedPath(path?: string) {
  const pathname = usePathname();
  return path ?? pathname;
}

function BackControl({
  href,
  label = "Trở về",
}: {
  href: string | null;
  label?: string | null;
}) {
  if (!href) {
    return <Bone className="h-10 w-10 rounded-full" />;
  }

  return (
    <Link
      href={href}
      aria-label={label ?? "Trở về"}
      className="flex shrink-0 items-center gap-1.5 text-[#0066cc] transition-opacity hover:opacity-80 active:opacity-60"
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
        arrow_back_ios_new
      </span>
      {label ? (
        <span className="text-[17px] font-medium tracking-tight">{label}</span>
      ) : null}
    </Link>
  );
}

function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-layout="wide"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="relative flex min-h-dvh w-full flex-1 flex-col overflow-x-hidden bg-[#fbfbfd]"
      style={screenFont}
    >
      <LoadingBar />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>
      {children}
    </div>
  );
}

function LearnerHeader({
  path,
  kicker,
  showBack = true,
}: {
  path?: string;
  kicker?: string;
  showBack?: boolean;
}) {
  const backHref = showBack ? backHrefFor(useResolvedPath(path)) : null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 w-full max-w-4xl items-center justify-between gap-3 px-6 py-2">
        {showBack ? (
          <BackControl href={backHref} />
        ) : (
          <Bone className="h-10 w-10 rounded-full" />
        )}
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          {kicker ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#86868b]">
              {kicker}
            </span>
          ) : null}
          <LoadingTitle />
        </div>
        <Bone className="h-9 w-9 shrink-0 rounded-full" />
      </div>
    </header>
  );
}

export function QuestsScreenSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3 pb-2.5">
          <div className="h-7 w-32 animate-pulse rounded-full bg-[#e2e7ff]" />
          <div className="h-7 w-28 animate-pulse rounded-full bg-[#e2e7ff]" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-28">
        <div className="h-36 animate-pulse rounded-[24px] bg-[#ffb020]/25" />
        <div className="h-72 animate-pulse rounded-[24px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
        <div className="h-28 animate-pulse rounded-[24px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
      </main>
      <BottomNav />
    </div>
  );
}

export function DuelScreenSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.05] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl px-4 py-4 sm:px-6">
          <div className="h-7 w-24 animate-pulse rounded-full bg-[#e2e7ff]" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pb-28 pt-4 sm:px-6">
        <div className="h-40 animate-pulse rounded-[28px] bg-[#0284c7]/20" />
        <div className="h-24 animate-pulse rounded-[28px] bg-white shadow-[0_4px_0_0_#dae2fd]" />
      </main>
      <BottomNav />
    </div>
  );
}

export function LeaderboardScreenSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.05] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="h-7 w-40 animate-pulse rounded-full bg-[#e2e7ff]" />
          <div className="h-11 w-full animate-pulse rounded-full bg-[#e2e7ff]" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pb-28 pt-4 sm:px-6">
        <div className="h-36 animate-pulse rounded-[28px] bg-[#0284c7]/20" />
        <div className="h-64 animate-pulse rounded-[28px] bg-white shadow-[0_4px_0_0_#dae2fd]" />
      </main>
      <BottomNav />
    </div>
  );
}

export function LevelScreenSkeleton({
  path,
  kicker = "Luyện tập theo trình độ",
}: {
  path?: string;
  kicker?: string;
}) {
  return (
    <ScreenFrame>
      <LearnerHeader path={path} kicker={kicker} />
      <section className="relative z-10 flex w-full flex-col items-center px-6 pb-16 pt-16 text-center">
        <Bone className="h-4 w-40 rounded-full" />
        <Bone className="mt-6 h-16 w-64 max-w-full rounded-2xl" />
        <Bone className="mt-6 h-5 w-80 max-w-full rounded-full" />
      </section>
      <section className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 pb-24">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex w-full flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-white p-4 shadow-[0_4px_0_0_#dae2fd]">
              <Bone className="h-6 w-2/3 rounded-full" />
            </div>
            <Bone className={`h-[70px] w-[70px] rounded-full ${index % 2 === 0 ? "-translate-x-9" : "translate-x-9"}`} />
            <Bone className="h-[70px] w-[70px] rounded-full" />
          </div>
        ))}
      </section>
    </ScreenFrame>
  );
}

export function ChapterScreenSkeleton({ path }: { path?: string }) {
  return (
    <ScreenFrame>
      <LearnerHeader path={path} />
      <section className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 pb-24 pt-8">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="rounded-[24px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-7"
          >
            <div className="flex items-start justify-between">
              <Bone className="h-12 w-12 rounded-[16px]" />
              <Bone className="h-10 w-10 rounded-full" />
            </div>
            <Bone className="mt-5 h-8 w-40 rounded-full" />
            <Bone className="mt-3 h-4 w-full rounded-full" />
            <Bone className="mt-2 h-4 w-4/5 rounded-full" />
            <Bone className="mt-6 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </section>
    </ScreenFrame>
  );
}

function SessionBody({ kind }: { kind: "study" | "practice" }) {
  return (
    <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
      <div className="flex items-center justify-end pt-6">
        <Bone className="h-7 w-24 rounded-full" />
      </div>
      <div className="mt-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <div className="flex h-12 items-end justify-between gap-[3px]">
          {WAVE_HEIGHTS.map((height, index) => (
            <Bone
              key={index}
              className="w-full rounded-full"
              style={{ height }}
            />
          ))}
        </div>
        <Bone className="mx-auto mt-6 h-14 w-14 rounded-full" />
      </div>
      {kind === "practice" ? (
        <div className="mt-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <Bone className="h-3 w-32 rounded-full" />
          <Bone className="mt-4 h-24 w-full rounded-2xl" />
          <Bone className="mt-6 h-14 w-full rounded-[16px]" />
        </div>
      ) : (
        <div className="mt-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <Bone className="h-6 w-28 rounded-full" />
          <Bone className="mt-4 h-5 w-full rounded-full" />
          <Bone className="mt-3 h-5 w-11/12 rounded-full" />
          <Bone className="mt-3 h-5 w-4/5 rounded-full" />
          <div className="mt-6 flex gap-3">
            <Bone className="h-14 w-14 rounded-[16px]" />
            <Bone className="h-14 flex-1 rounded-[16px]" />
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionScreenSkeleton({
  kind,
  path,
}: {
  kind: "study" | "practice";
  path?: string;
}) {
  return (
    <ScreenFrame>
      <LearnerHeader
        path={path}
        kicker={kind === "study" ? "Học nội dung" : "Luyện tập"}
      />
      <main className="relative flex w-full flex-1 flex-col items-center">
        <SessionBody kind={kind} />
      </main>
    </ScreenFrame>
  );
}

export function SessionContentSkeleton({
  kind,
}: {
  kind: "study" | "practice";
}) {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="relative flex w-full flex-1 flex-col items-center"
    >
      <LoadingBar />
      <SessionBody kind={kind} />
    </main>
  );
}

export function AccountScreenSkeleton({ path }: { path?: string }) {
  return (
    <ScreenFrame>
      <LearnerHeader path={path} kicker="Tài khoản" />
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col px-6 pb-24 pt-6">
        <div className="rounded-[32px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-4">
            <Bone className="h-[72px] w-[72px] rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bone className="h-6 w-40 rounded-full" />
              <Bone className="h-4 w-52 max-w-full rounded-full" />
            </div>
          </div>
          <Bone className="mt-6 h-12 w-full rounded-[16px]" />
        </div>
      </main>
    </ScreenFrame>
  );
}

function AdminBody() {
  return (
    <main className="flex w-full flex-1 flex-col gap-5 px-4 py-6 sm:px-6 min-[1440px]:px-8">
      <div className="flex flex-col gap-2">
        <Bone className="h-3 w-16 rounded-admin-badge" />
        <Bone className="h-7 w-56 max-w-full rounded-admin-control" />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-admin-card border border-admin-hairline bg-admin-card p-5 shadow-admin-card"
          >
            <Bone className="h-3 w-24 rounded-admin-badge" />
            <Bone className="h-9 w-28 rounded-admin-control" />
            <Bone className="h-3 w-40 max-w-full rounded-admin-badge" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-admin-card border border-admin-hairline bg-admin-card shadow-admin-card">
        <div className="h-10 border-b border-admin-hairline bg-admin-subtle" />
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex h-[52px] items-center gap-4 border-b border-admin-hairline px-4 last:border-b-0"
          >
            <Bone className="h-7 w-7 shrink-0 rounded-full" />
            <Bone className="h-3.5 w-40 rounded-admin-badge" />
            <Bone className="ml-auto hidden h-5 w-16 rounded-admin-badge sm:block" />
          </div>
        ))}
      </div>
    </main>
  );
}

/**
 * Content-only fallback for `loading.tsx` inside `/admin`, which already renders
 * below the sidebar and top bar that `AdminShell` provides.
 */
export function AdminContentSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="flex w-full flex-1 flex-col"
    >
      <LoadingBar />
      <AdminBody />
    </div>
  );
}

/** Full-screen stand-in used by the navigation overlay, so it mirrors the shell. */
export function AdminScreenSkeleton() {
  return (
    <div
      data-layout="wide"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      className="flex min-h-dvh w-full flex-1 bg-admin-canvas"
    >
      <LoadingBar />
      <aside className="hidden w-[16.25rem] shrink-0 flex-col border-r border-admin-hairline bg-admin-card lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-admin-hairline px-4">
          <Bone className="h-9 w-9 rounded-admin-card" />
          <Bone className="h-4 w-20 rounded-admin-badge" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: 9 }, (_, index) => (
            <div key={index} className="flex h-9 items-center gap-3 px-3">
              <Bone className="h-5 w-5 shrink-0 rounded-admin-badge" />
              <Bone className="h-3 w-24 rounded-admin-badge" />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 w-full border-b border-admin-hairline/80 bg-white/85 pt-safe backdrop-blur-[12px]">
          <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
            <Bone className="h-9 w-9 rounded-admin-control lg:hidden" />
            <div className="min-w-0 flex-1" />
            <Bone className="hidden h-9 w-28 rounded-admin-control sm:block" />
            <Bone className="h-9 w-9 shrink-0 rounded-full" />
          </div>
        </header>
        <AdminBody />
      </div>
    </div>
  );
}

export function VideoLessonSkeleton({ path }: { path?: string }) {
  return (
    <ScreenFrame>
      <LearnerHeader path={path} kicker="Video" />
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pt-4 sm:justify-center sm:px-8 sm:py-8">
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Bone className="h-8 w-48 rounded-full sm:h-10" />
            <Bone className="h-7 w-20 rounded-full" />
          </div>
          <Bone className="aspect-video w-full rounded-[24px]" />
          <Bone className="h-16 w-full rounded-[24px]" />
        </div>
      </section>
    </ScreenFrame>
  );
}

export function ScreenForPath({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return <LevelScreenSkeleton path={path} />;
  if (parts[0] === "account" || parts[0] === "session-ended") {
    return <AccountScreenSkeleton path={path} />;
  }
  if (parts[0] === "admin") return <AdminScreenSkeleton />;
  if (parts[0] === "interview") {
    return <SessionScreenSkeleton kind="practice" path={path} />;
  }
  if (parts[0] === "living" && parts[parts.length - 1] === "study") {
    return <SessionScreenSkeleton kind="study" path={path} />;
  }
  if (parts[0] === "living" && parts[parts.length - 1] === "practice") {
    return <SessionScreenSkeleton kind="practice" path={path} />;
  }
  if (parts[0] === "living") {
    return <LevelScreenSkeleton path={path} kicker="Leben in Deutschland" />;
  }
  if (parts[0] === "learn" && parts[parts.length - 1] === "video") {
    return <VideoLessonSkeleton path={path} />;
  }
  if (parts[0] === "learn" && parts[parts.length - 1] === "study") {
    return <SessionScreenSkeleton kind="study" path={path} />;
  }
  if (parts[0] === "learn" && parts[parts.length - 1] === "practice") {
    return <SessionScreenSkeleton kind="practice" path={path} />;
  }
  if (parts[0] === "learn" && (parts.length === 2 || parts.length === 3)) {
    return <LevelScreenSkeleton path={path} />;
  }
  if (parts[0] === "learn") return <ChapterScreenSkeleton path={path} />;
  if (parts[0] === "quests") return <QuestsScreenSkeleton />;
  if (parts[0] === "duel") return <DuelScreenSkeleton />;
  if (parts[0] === "leaderboard") return <LeaderboardScreenSkeleton />;
  return <LevelScreenSkeleton path={path} />;
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);

  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setPendingPath(null);
  }

  useEffect(() => {
    publishPendingNav(null);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !isPlainLeftClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      setPendingPath(url.pathname);
      publishPendingNav(url.pathname);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pendingPath) return;
    const id = window.setTimeout(() => {
      setPendingPath(null);
      publishPendingNav(null);
    }, 20000);
    return () => window.clearTimeout(id);
  }, [pendingPath]);

  if (!pendingPath || pendingPath === pathname) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[#fbfbfd]">
      <ScreenForPath path={pendingPath} />
    </div>
  );
}
