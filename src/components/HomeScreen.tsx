"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import type { Ausbildungsberuf } from "@/lib/content";
import { useProgress } from "@/lib/useProgress";

export type LevelMeta = {
  level: string;
  slug: string;
  /** Lektionen listed in the catalog for this level (may still be empty of clips). */
  chapterCount: number;
};

type HomeScreenProps = {
  berufe: Ausbildungsberuf[];
  levels: LevelMeta[];
  interviewClipTotals: Record<string, number>;
  /** Admins can open CEFR practice; everyone else still sees Coming Soon. */
  levelsUnlocked?: boolean;
};

const BERUF_ICON: Record<string, string> = {
  restaurantfachkraft: "room_service",
  koch: "soup_kitchen",
  hotelfachkraft: "hotel",
  baecker: "bakery_dining",
  baeckereifachverkaeufer: "storefront",
  metzgerei: "kebab_dining",
};

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={
        filled ? { fontVariationSettings: "'FILL' 1" } : undefined
      }
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function ContinueCard({
  label,
  icon,
  totalClips,
  percent,
  currentClipIndex,
  href,
}: {
  label: string;
  icon: string;
  totalClips: number;
  percent: number;
  currentClipIndex: number;
  href: string;
}) {
  const displayIndex = Math.min(currentClipIndex + 1, Math.max(totalClips, 1));

  return (
    <section className="flex flex-col gap-space-8 pt-space-4">
      <div className="flex w-full flex-col gap-space-16 rounded-[32px] bg-white/80 backdrop-blur-xl border border-white/20 p-space-24 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-start justify-between gap-space-12">
          <div className="flex min-w-0 flex-col gap-space-4">
            <div className="inline-flex items-center gap-space-6">
              <span className="rounded-full bg-[#0066cc]/10 px-space-8 py-0.5 font-label-sm text-label-sm font-semibold text-[#0066cc]">
                Đang học dở
              </span>
            </div>
            <h2 className="mt-space-2 font-headline-sm text-headline-sm font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
              Ausbildung · {label}
            </h2>
            <p className="font-body-sm text-body-sm font-medium text-[#86868b]">
              Luyện nghe câu hỏi phỏng vấn theo nghề
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[#0066cc]">
            <MaterialIcon name={icon} className="text-[24px]" />
          </div>
        </div>

        <div className="flex flex-col gap-space-4">
          <div className="flex items-center justify-between font-caption text-caption font-medium text-[#86868b]">
            <span>
              Câu {displayIndex} / {Math.max(totalClips, 1)}
              {percent >= 100
                ? " · Đã hoàn thành"
                : " · Nghe chép chính tả"}
            </span>
            <span className="font-semibold text-[#1d1d1f]">{percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f7]">
            <div
              className="h-full rounded-full bg-[#0066cc] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <Link
          href={href}
          className="group flex h-[52px] w-full items-center justify-center gap-space-8 rounded-[16px] bg-[#0066cc] font-label-lg text-label-lg text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <MaterialIcon name="play_arrow" className="text-[20px]" filled />
          <span>Tiếp tục · Weiter</span>
          <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}

function LevelCard({
  level,
  unlocked,
}: {
  level: LevelMeta;
  unlocked: boolean;
}) {
  const chapterLabel =
    level.chapterCount === 0
      ? "0 chương"
      : `${level.chapterCount} chương`;

  if (!unlocked) {
    return (
      <div
        aria-disabled="true"
        className="flex w-[160px] shrink-0 flex-col justify-between gap-4 rounded-[24px] border border-white/10 bg-white/40 backdrop-blur-md p-5 opacity-70"
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
              Sắp ra mắt
            </span>
            <h3 className="mt-0.5 font-headline-sm text-[17px] font-bold text-[#1d1d1f]/70" style={{ letterSpacing: "-0.015em" }}>
              Trình độ {level.level}
            </h3>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b]">
            <MaterialIcon name="lock" className="text-[18px]" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-black/[0.05] pt-3 text-[12px] font-medium text-[#86868b]">
          <span>{chapterLabel}</span>
          <span className="text-[10px] uppercase tracking-wider">Coming Soon</span>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/learn/${level.slug}`}
      aria-label={`Trình độ ${level.level}`}
      className="group flex w-[160px] shrink-0 flex-col justify-between gap-4 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 active:scale-[0.97]"
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0066cc]">
            Trình độ
          </span>
          <h3 className="mt-0.5 font-headline-sm text-[17px] font-bold text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors duration-300" style={{ letterSpacing: "-0.015em" }}>
            {level.level}
          </h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7] text-[#0066cc] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[#0066cc] group-hover:text-white group-hover:scale-110 group-hover:shadow-md">
          <MaterialIcon name="hearing" className="text-[18px]" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-black/[0.05] pt-3 text-[12px] font-medium">
        <span className="text-[#86868b]">{chapterLabel}</span>
        <span className="flex items-center gap-0.5 font-semibold text-[#0066cc]">
          Vào
          <MaterialIcon name="arrow_forward" className="text-[14px] transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function berufDisplayLabel(label: string) {
  return label.split(" / ")[0]?.trim() || label;
}

function BerufCard({
  beruf,
  completedCount,
  totalClips,
  percent,
}: {
  beruf: Ausbildungsberuf;
  completedCount: number;
  totalClips: number;
  percent: number;
}) {
  const icon = BERUF_ICON[beruf.slug] ?? "work";
  const href = `/interview/${beruf.slug}`;
  const safeTotal = Math.max(totalClips, 0);
  const isComplete = safeTotal > 0 && percent >= 100;
  const lessonLabel =
    safeTotal > 0 ? `${completedCount}/${safeTotal} bài` : "Phỏng vấn";
  const title = berufDisplayLabel(beruf.label);

  return (
    <Link
      href={href}
      title={beruf.label}
      aria-label={
        isComplete ? `${beruf.label} · Đã hoàn thành` : beruf.label
      }
      className="group relative flex min-h-[220px] w-[200px] shrink-0 flex-col justify-between gap-3 overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] active:scale-[0.97]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
            {isComplete ? (
              <MaterialIcon name="check_circle" className="text-[14px] text-[#34C759]" filled />
            ) : null}
            Ausbildung
          </span>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:bg-[#0066cc] group-hover:text-white group-hover:shadow-md">
            <MaterialIcon name={icon} className="text-[18px]" />
          </div>
        </div>
        <h3 className="mt-1 line-clamp-2 break-words font-headline-sm text-[16px] font-bold leading-snug text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors duration-300 [overflow-wrap:anywhere]" style={{ letterSpacing: "-0.015em" }}>
          {title}
        </h3>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-black/[0.05] pt-3 text-[12px] font-medium">
        <span className="min-w-0 truncate text-[#86868b]">
          {lessonLabel}
        </span>
        {percent > 0 ? (
          <span className="shrink-0 font-semibold text-[#0066cc]">
            {percent}%
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5 font-semibold text-[#0066cc]">
            Vào
            <MaterialIcon name="arrow_forward" className="text-[14px] transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </Link>
  );
}

export function HomeScreen({
  berufe,
  levels,
  interviewClipTotals,
  levelsUnlocked = false,
}: HomeScreenProps) {
  const { data: session } = useSession();
  const { continueLearning, progressFor, streakDays } =
    useProgress(interviewClipTotals);
  const continueBeruf =
    berufe.find((b) => b.slug === continueLearning.berufSlug) ?? berufe[0];
  const continueIcon =
    BERUF_ICON[continueLearning.berufSlug] ??
    (continueBeruf ? BERUF_ICON[continueBeruf.slug] : undefined) ??
    "work";
  const firstName =
    session?.user?.name?.trim().split(/\s+/)[0] ?? "bạn";
  const greeting = `Chào ${firstName} 👋`;

  return (
    <div 
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-space-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0066cc] text-white shadow-[0_2px_8px_rgba(0,102,204,0.25)]">
              <MaterialIcon name="hearing" className="text-[20px]" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-headline-sm text-headline-sm font-bold leading-none tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                {greeting}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-space-8">
            <div className="flex items-center gap-space-4 rounded-full bg-white border border-black/[0.05] shadow-sm px-space-8 py-1 text-[#86868b]">
              <MaterialIcon
                name="local_fire_department"
                className="text-[16px] text-[#ff9500]"
                filled
              />
              <span className="font-label-sm text-label-sm font-semibold text-[#1d1d1f]">
                {streakDays} ngày
              </span>
            </div>
            <Link
              href="/account"
              className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#f5f5f7] text-[#86868b] transition-all hover:opacity-90 hover:scale-105 active:scale-95 border border-black/[0.05]"
              aria-label="Tài khoản"
            >
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 object-cover"
                />
              ) : (
                <MaterialIcon name="person" className="text-[18px]" />
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-4xl flex-col gap-space-24 px-6 pb-space-32">
          {continueBeruf ? (
            <ContinueCard
              label={continueBeruf.label}
              icon={continueIcon}
              totalClips={continueLearning.totalClips}
              percent={continueLearning.percent}
              currentClipIndex={continueLearning.currentClipIndex}
              href={continueLearning.href}
            />
          ) : null}

          <section className="flex flex-col gap-space-12 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-[22px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                Luyện tập theo trình độ
              </h2>
            </div>
            <div className="-mx-6 flex flex-nowrap gap-4 overflow-x-auto scroll-smooth px-6 pb-6 pt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {levels.map((level) => (
                <LevelCard
                  key={level.slug}
                  level={level}
                  unlocked={levelsUnlocked}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-space-12">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-[22px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                Luyện phỏng vấn theo nghề
              </h2>
            </div>
            <div className="-mx-6 flex flex-nowrap gap-4 overflow-x-auto scroll-smooth px-6 pb-6 pt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {[...berufe]
                .sort(
                  (a, b) =>
                    progressFor(b.slug).percent - progressFor(a.slug).percent,
                )
                .map((beruf) => {
                  const summary = progressFor(beruf.slug);
                  return (
                    <BerufCard
                      key={beruf.id}
                      beruf={beruf}
                      completedCount={summary.completedCount}
                      totalClips={summary.totalClips}
                      percent={summary.percent}
                    />
                  );
                })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
