"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import type { Ausbildungsberuf } from "@/lib/content";
import { useProgress } from "@/lib/useProgress";

export type LevelMeta = {
  level: string;
  slug: string;
};

type HomeScreenProps = {
  berufe: Ausbildungsberuf[];
  levels: LevelMeta[];
  interviewTotalClips: number;
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
  totalClips,
  percent,
  currentClipIndex,
  href,
}: {
  label: string;
  totalClips: number;
  percent: number;
  currentClipIndex: number;
  href: string;
}) {
  const displayIndex = Math.min(currentClipIndex + 1, Math.max(totalClips, 1));

  return (
    <section className="flex flex-col gap-space-8 pt-space-4">
      <div className="flex w-full flex-col gap-space-16 rounded-3xl bg-surface-container-lowest p-space-20 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="flex items-start justify-between gap-space-12">
          <div className="flex min-w-0 flex-col gap-space-4">
            <div className="inline-flex items-center gap-space-6">
              <span className="rounded-full bg-primary-fixed px-space-8 py-0.5 font-label-sm text-label-sm font-semibold text-on-primary-fixed">
                Đang học dở
              </span>
            </div>
            <h2 className="mt-space-2 font-headline-sm text-headline-sm tracking-tight text-on-surface">
              Ausbildung · {label}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Luyện nghe câu hỏi phỏng vấn theo nghề
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-container text-primary-container">
            <MaterialIcon name="room_service" className="text-[24px]" />
          </div>
        </div>

        <div className="flex flex-col gap-space-4">
          <div className="flex items-center justify-between font-caption text-caption text-on-surface-variant">
            <span>
              Câu {displayIndex} / {Math.max(totalClips, 1)} · Nghe chép chính tả
            </span>
            <span className="font-semibold text-on-surface">{percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-primary-container transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <Link
          href={href}
          className="flex h-[52px] w-full items-center justify-center gap-space-8 rounded-2xl bg-primary-container font-label-lg text-label-lg text-on-primary shadow-[0_2px_8px_rgba(0,113,227,0.25)] transition-all hover:opacity-95 active:scale-[0.98]"
        >
          <MaterialIcon name="play_arrow" className="text-[20px]" filled />
          <span>Tiếp tục · Weiter</span>
          <MaterialIcon name="arrow_forward" className="text-[18px]" />
        </Link>
      </div>
    </section>
  );
}

function LevelCard({ level }: { level: LevelMeta }) {
  return (
    <div
      aria-disabled="true"
      className="flex w-[160px] shrink-0 flex-col justify-between gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container-low/60 p-4 opacity-75"
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
            Sắp ra mắt
          </span>
          <h3 className="mt-0.5 font-headline-sm text-[17px] font-bold text-on-surface/70">
            Trình độ {level.level}
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-outline">
          <MaterialIcon name="lock" className="text-[18px]" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-surface-container-high/50 pt-2 text-[12px] font-medium text-on-surface-variant">
        <span>0 bài</span>
        <span className="text-[11px] text-outline">Coming Soon</span>
      </div>
    </div>
  );
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
  const safeTotal = Math.max(totalClips, 1);

  return (
    <div className="flex flex-col gap-space-16 rounded-3xl border border-surface-container bg-surface-container-lowest p-space-20 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-space-12">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed/60 text-primary-container">
            <MaterialIcon name={icon} className="text-[24px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="inline-flex items-center gap-2">
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-caption text-[11px] font-semibold text-primary">
                Mục tiêu Ausbildung
              </span>
            </div>
            <h3 className="mt-1 font-headline-sm text-[18px] font-bold tracking-tight text-on-surface">
              {beruf.label}
            </h3>
            <p className="font-body-sm text-[13px] text-on-surface-variant">
              Luyện nghe phỏng vấn
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-[12px] font-semibold text-on-surface-variant">
          {percent}%
        </div>
      </div>

      <div className="flex flex-col gap-space-4">
        <div className="flex items-center justify-between font-caption text-caption text-on-surface-variant">
          <span>Tiến độ phỏng vấn</span>
          <span className="font-semibold text-on-surface">
            {completedCount} / {safeTotal} bài học · {percent}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary-container"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-surface-container-low pt-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-on-surface-variant">
          <MaterialIcon
            name="play_circle"
            className="shrink-0 text-[16px] text-primary-container"
          />
          <span className="truncate font-medium text-on-surface">
            Bài tiếp: Câu hỏi phỏng vấn
          </span>
        </div>
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-primary-container px-3.5 py-2 font-label-sm text-label-sm font-semibold text-on-primary shadow-[0_2px_8px_rgba(0,113,227,0.25)] transition-all hover:opacity-95 active:scale-[0.98]"
        >
          <span>Vào bài học</span>
          <MaterialIcon name="arrow_forward" className="text-[16px]" />
        </Link>
      </div>
    </div>
  );
}

export function HomeScreen({
  berufe,
  levels,
  interviewTotalClips,
}: HomeScreenProps) {
  const { data: session } = useSession();
  const { continueLearning, streakDays } = useProgress(interviewTotalClips);
  const continueBeruf =
    berufe.find((b) => b.slug === continueLearning.berufSlug) ?? berufe[0];
  const firstName =
    session?.user?.name?.trim().split(/\s+/)[0] ?? "bạn";
  const greeting = `Chào ${firstName} 👋`;

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-surface/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between px-space-16">
          <div className="flex items-center gap-space-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-container text-on-primary shadow-[0_2px_8px_rgba(0,113,227,0.25)]">
              <MaterialIcon name="hearing" className="text-[20px]" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-headline-sm text-headline-sm leading-none tracking-tight text-on-surface">
                {greeting}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-space-8">
            <div className="flex items-center gap-space-4 rounded-full bg-surface-container-high px-space-8 py-1 text-on-surface-variant">
              <MaterialIcon
                name="local_fire_department"
                className="text-[16px] text-primary-container"
                filled
              />
              <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                {streakDays} ngày
              </span>
            </div>
            <Link
              href="/account"
              className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary text-on-primary transition-opacity hover:opacity-90"
              aria-label="Tài khoản"
            >
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 object-cover"
                />
              ) : (
                <MaterialIcon name="person" className="text-[18px]" />
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex w-full flex-1 flex-col bg-surface">
        <div className="flex w-full flex-col gap-space-24 px-space-16 pb-space-32">
          {continueBeruf ? (
            <ContinueCard
              label={continueBeruf.label}
              totalClips={continueLearning.totalClips}
              percent={continueLearning.percent}
              currentClipIndex={continueLearning.currentClipIndex}
              href={continueLearning.href}
            />
          ) : null}

          <section className="flex flex-col gap-space-12">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Luyện tập theo trình độ
              </h2>
            </div>
            <div className="-mx-space-16 flex flex-nowrap gap-3 overflow-x-auto scroll-smooth px-space-16 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {levels.map((level) => (
                <LevelCard key={level.slug} level={level} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-space-12">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Luyện phỏng vấn theo nghề
              </h2>
            </div>
            <div className="flex flex-col gap-3">
              {berufe.map((beruf) => {
                const isContinue = beruf.slug === continueLearning.berufSlug;
                return (
                  <BerufCard
                    key={beruf.id}
                    beruf={beruf}
                    completedCount={
                      isContinue ? continueLearning.completedCount : 0
                    }
                    totalClips={isContinue ? continueLearning.totalClips : 0}
                    percent={isContinue ? continueLearning.percent : 0}
                  />
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
