"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomNav, publishPendingNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";

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
  const resolvedPath = useResolvedPath(path);
  const backHref = showBack ? backHrefFor(resolvedPath) : null;

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

const TAB_SCREEN =
  "relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]";
const TAB_MAIN_PAD = "pb-[calc(6.5rem+env(safe-area-inset-bottom))]";

function QuestsHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <h1 className="min-w-0 truncate font-headline-md text-headline-md font-extrabold tracking-tight text-[#131b2e]">
          {title}
        </h1>
        <TopBarStatus />
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
      data-layout="wide"
      className={TAB_SCREEN}
    >
      <QuestsHeader title="Nhiệm vụ" />
      <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 ${TAB_MAIN_PAD}`}>
        <section className="relative flex min-h-[132px] items-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ffb020] to-[#ff8a00] p-4 pr-[112px] text-white shadow-[0_6px_0_0_#d97706]">
          <div className="relative z-10 flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-wider text-white/85 uppercase">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                flag
              </span>
              Nhiệm vụ hằng ngày
            </span>
            <p className="text-[19px] leading-6 font-extrabold">Hoàn thành nhiệm vụ, nhận thêm XP!</p>
          </div>
        </section>
        <div className="h-72 animate-pulse rounded-[24px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
      </main>
      <BottomNav />
    </div>
  );
}

export function BadgesScreenSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      data-layout="wide"
      className={TAB_SCREEN}
    >
      <QuestsHeader title="Huy hiệu" />
      <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 ${TAB_MAIN_PAD}`}>
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#5856D6] to-[#0071E3] p-4 text-white shadow-[0_6px_0_0_#3634a3]">
          <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-wider text-white/85 uppercase">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              workspace_premium
            </span>
            Bộ sưu tập
          </span>
          <p className="mt-1 text-[28px] leading-8 font-extrabold tabular-nums">
            <span className="inline-block h-7 w-8 animate-pulse rounded-full bg-white/40 align-middle" />
            <span className="text-[18px] text-white/75"> / — huy hiệu</span>
          </p>
          <p className="mt-1 text-[13px] font-semibold text-white/85">
            Học đều, giữ chuỗi và leo bảng xếp hạng để mở khóa cấp Đồng, Bạc, Vàng và Kim cương.
          </p>
          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/25" />
        </section>
        <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-[22px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
          ))}
        </div>
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
      data-layout="wide"
      className={TAB_SCREEN}
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1 className="min-w-0 truncate font-headline-md text-headline-md font-extrabold tracking-tight">
            Đấu
          </h1>
          <TopBarStatus />
        </div>
      </header>
      <main className={`mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-4 sm:px-6 ${TAB_MAIN_PAD}`}>
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-4 text-white shadow-[0_6px_0_0_#0369a1]">
          <div className="flex min-h-[100px] flex-col gap-2 pr-[118px]">
            <span className="h-3 w-24 animate-pulse rounded-full bg-white/40" />
            <span className="h-6 w-48 max-w-full animate-pulse rounded-full bg-white/50" />
            <span className="h-4 w-40 max-w-full animate-pulse rounded-full bg-white/30" />
          </div>
          <span className="mt-4 flex h-[52px] w-full animate-pulse rounded-2xl bg-white/80" />
        </section>
        <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_3px_0_0_#dae2fd]">
          <span className="block h-3 w-20 animate-pulse rounded-full bg-[#e2e7ff]" />
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-start gap-3">
                <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#e0f2fe]" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                  <span className="h-4 w-32 animate-pulse rounded-full bg-[#e2e7ff]" />
                  <span className="h-3 w-full animate-pulse rounded-full bg-[#e2e7ff]" />
                </span>
              </div>
            ))}
          </div>
        </section>
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
      data-layout="wide"
      className={TAB_SCREEN}
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 pb-2.5 pt-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h1 className="min-w-0 font-headline-md text-headline-md font-extrabold tracking-tight text-[#131b2e]">
              Bảng xếp hạng
            </h1>
            <TopBarStatus />
          </div>
        </div>
      </header>
      <main className={`mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pt-4 sm:px-6 ${TAB_MAIN_PAD}`}>
        <div className="flex flex-col gap-3">
          <div className="h-[52px] animate-pulse rounded-2xl bg-[#e2e7ff]" />
          <div className="flex items-center justify-between gap-2">
            <div className="h-11 w-44 animate-pulse rounded-2xl bg-[#e2e7ff]" />
            <div className="h-11 w-28 animate-pulse rounded-2xl bg-[#e2e7ff]" />
          </div>
        </div>
        <section className="h-[148px] animate-pulse rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] shadow-[0_6px_0_0_#0369a1]" />
        <ol className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <li
              key={index}
              className="flex h-[60px] items-center gap-3 rounded-2xl bg-white px-3 shadow-[0_3px_0_0_#dae2fd]"
            >
              <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#e2e7ff]" />
              <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#e2e7ff]" />
              <span className="h-4 w-32 animate-pulse rounded-full bg-[#e2e7ff]" />
            </li>
          ))}
        </ol>
      </main>
      <BottomNav />
    </div>
  );
}

const LEVEL_PATH_SHIFTS = [-36, 0, 36];

export function LevelScreenSkeleton({
  kicker = "Luyện tập theo trình độ",
}: {
  path?: string;
  kicker?: string;
}) {
  const living = kicker === "Leben in Deutschland";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#fbfbfd]"
    >
      <LoadingBar />
      <header className="fixed top-0 left-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <span className="flex max-w-[11rem] items-center gap-0.5 text-[#0066cc] sm:max-w-[16rem]">
            <span className="h-[17px] w-16 animate-pulse rounded-md bg-[#c5dff8]" />
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              expand_more
            </span>
          </span>
          <TopBarStatus />
        </div>
      </header>
      <section className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1rem)] pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] sm:px-6">
        <div
          className={`relative w-full overflow-hidden rounded-2xl p-4 text-white ${
            living
              ? "bg-gradient-to-br from-[#e11d48] to-[#f97316] shadow-[0_6px_0_0_#be123c]"
              : "bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] shadow-[0_6px_0_0_#0369a1]"
          }`}
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              {living ? "storefront" : "school"}
            </span>
            {kicker}
          </span>
          <span className="mt-2 block h-7 w-40 max-w-full animate-pulse rounded-full bg-white/40" />
          <span className="mt-2 block h-4 w-full animate-pulse rounded-full bg-white/30" />
          <span className="mt-1.5 block h-4 w-4/5 animate-pulse rounded-full bg-white/30" />
          <span className="mt-4 block h-3 w-full animate-pulse rounded-full bg-white/25" />
        </div>
        {Array.from({ length: 2 }, (_, lesson) => (
          <div key={lesson} className="flex w-full flex-col items-center gap-3">
            <div className="flex w-full flex-col gap-2 rounded-2xl bg-white p-4 shadow-[0_4px_0_0_#dae2fd]">
              <span className="h-7 w-2/3 animate-pulse rounded-full bg-[#e8e8ed]" />
              <span className="h-4 w-1/2 animate-pulse rounded-full bg-[#e8e8ed]" />
            </div>
            <ul className="flex w-full flex-col items-center gap-3 py-3">
              {LEVEL_PATH_SHIFTS.map((shift, index) => (
                <li key={index} style={{ transform: `translateX(${shift}px)` }}>
                  <span className="block h-[52px] w-[52px] animate-pulse rounded-full bg-[#e8e8ed] shadow-[0_5px_0_0_#C5CEDB]" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <BottomNav />
    </div>
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

const PROFILE_STATS = ["Chuỗi ngày", "Tổng XP", "Hạng lớp", "Lần top 3"] as const;

export function AccountScreenSkeleton({ path }: { path?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Đang tải nội dung"
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col overflow-x-hidden bg-[#faf8ff] text-[#131b2e]"
    >
      <LoadingBar />
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-end px-4 md:max-w-3xl">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#1cb0f6]" aria-hidden="true">
            <span className="material-symbols-outlined text-[26px]">settings</span>
          </span>
        </div>
      </header>
      <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-4 md:max-w-3xl ${TAB_MAIN_PAD}`}>
        <section className="flex flex-col items-center text-center">
          <div className="h-28 w-28 animate-pulse rounded-full border-4 border-white bg-[#ddf4ff] shadow-[0_4px_0_#e5e5e5] ring-2 ring-[#e5e5e5]" />
          <div className="mt-3 h-8 w-40 animate-pulse rounded-full bg-[#e2e7ff]" />
        </section>
        <section>
          <h2 className="mb-3 text-[22px] leading-7 font-extrabold tracking-tight">Thống kê</h2>
          <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
            {PROFILE_STATS.map((label) => (
              <div
                key={label}
                className="flex min-h-[88px] items-center gap-2.5 rounded-2xl border-2 border-[#e5e5e5] bg-white px-3 py-3"
              >
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#e2e7ff]" />
                <span className="min-w-0">
                  <span className="block h-6 w-10 animate-pulse rounded-full bg-[#e2e7ff]" />
                  <span className="mt-1 block text-[13px] leading-4 font-bold text-[#afafaf]">{label}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
        <div className="h-40 animate-pulse rounded-2xl bg-[#e2e7ff]" />
        <section>
          <h2 className="mb-3 text-[22px] leading-7 font-extrabold tracking-tight">Lớp của bạn</h2>
          <div className="h-36 animate-pulse rounded-2xl bg-[#e2e7ff]" />
        </section>
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-[22px] leading-7 font-extrabold tracking-tight">Huy hiệu</h2>
            <span className="text-[13px] font-extrabold tracking-wide text-[#1cb0f6] uppercase">Tất cả</span>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="h-28 animate-pulse rounded-2xl bg-[#e2e7ff]" />
            ))}
          </ul>
        </section>
      </main>
      <BottomNav />
      {path ? <span className="sr-only">{path}</span> : null}
    </div>
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
  if (parts[0] === "badges") return <BadgesScreenSkeleton />;
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
