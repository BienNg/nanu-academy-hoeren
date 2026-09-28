"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ProfileButton } from "@/components/ProfileButton";
import { BottomNav } from "@/components/BottomNav";
import { TodayXpChip } from "@/components/TodayXpChip";
import type { Ausbildungsberuf } from "@/lib/content";
import type { ContinueLevelCatalogEntry } from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";
import { previewLeaderboardRows, type LeaderboardPayload, type LeaderboardRow } from "@/lib/xp";

export type LevelMeta = {
  level: string;
  slug: string;
  /** Lektionen listed in the catalog for this level (may still be empty of clips). */
  chapterCount: number;
};

type HomeScreenProps = {
  berufe: Ausbildungsberuf[];
  levels: LevelMeta[];
  levelCatalog: ContinueLevelCatalogEntry[];
  interviewClipTotals: Record<string, number>;
  /** CEFR slugs this learner may open. Everyone else sees a lock. */
  unlockedLevelSlugs?: readonly string[];
  /** When false, "Luyện phỏng vấn theo nghề" is omitted entirely. */
  interviewAccess?: boolean;
  /** Class board for this week, same default the Xếp hạng tab opens on. */
  ranking: LeaderboardPayload;
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
  levelLabel,
  chapterLabel,
  totalChapters,
  percent,
  currentChapterIndex,
  href,
}: {
  levelLabel: string;
  chapterLabel: string;
  totalChapters: number;
  percent: number;
  currentChapterIndex: number;
  href: string;
}) {
  const displayIndex = Math.min(currentChapterIndex + 1, Math.max(totalChapters, 1));

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
              Trình độ {levelLabel} · {chapterLabel}
            </h2>
            <p className="font-body-sm text-body-sm font-medium text-[#86868b]">
              Luyện tập theo trình độ
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[#0066cc]">
            <MaterialIcon name="hearing" className="text-[24px]" />
          </div>
        </div>

        <div className="flex flex-col gap-space-4">
          <div className="flex items-center justify-between font-caption text-caption font-medium text-[#86868b]">
            <span>
              Chương {displayIndex} / {Math.max(totalChapters, 1)}
              {percent >= 100 ? " · Đã hoàn thành" : " · Chưa hoàn thành"}
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
        aria-label={`Trình độ ${level.level} đang khóa. Nhờ giáo viên mở khóa.`}
        title="Nhờ giáo viên mở trình độ này"
        className="flex min-h-[200px] w-[240px] shrink-0 flex-col justify-between gap-5 rounded-[28px] border border-black/[0.06] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)]"
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#86868b]">
              Đã khóa
            </span>
            <h3 className="mt-1 font-headline-sm text-[22px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
              Trình độ {level.level}
            </h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b]">
            <MaterialIcon name="lock" className="text-[22px]" />
          </div>
        </div>
        <p className="border-t border-black/[0.05] pt-4 text-[14px] font-medium leading-snug text-[#86868b]">
          Nhờ giáo viên mở khóa
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/learn/${level.slug}`}
      aria-label={`Trình độ ${level.level}`}
      className="group flex min-h-[200px] w-[240px] shrink-0 flex-col justify-between gap-5 rounded-[28px] bg-white/80 backdrop-blur-xl border border-white/20 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 active:scale-[0.97]"
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#0066cc]">
            Trình độ
          </span>
          <h3 className="mt-1 font-headline-sm text-[22px] font-bold text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors duration-300" style={{ letterSpacing: "-0.015em" }}>
            {level.level}
          </h3>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f5f7] text-[#0066cc] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[#0066cc] group-hover:text-white group-hover:scale-110">
          <MaterialIcon name="hearing" className="text-[22px]" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-black/[0.05] pt-4 text-[14px] font-medium">
        <span className="text-[#86868b]">{chapterLabel}</span>
        <span className="flex items-center gap-0.5 font-semibold text-[#0066cc]">
          Vào
          <MaterialIcon name="arrow_forward" className="text-[16px] transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

const AVATAR_COLORS = ["#0284c7", "#0369a1", "#0f766e", "#b45309", "#7c3aed", "#be123c"];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 1)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0]!;
}

function nameInitial(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function DuoButton({ children }: { children: string }) {
  return (
    <span className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0284c7] text-[15px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_0_0_#0369a1] transition-all group-hover:bg-[#0ea5e9] group-active:translate-y-1 group-active:shadow-none">
      {children}
    </span>
  );
}

function MiniAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
        <Image
          src={image}
          alt=""
          width={32}
          height={32}
          referrerPolicy="no-referrer"
          className="h-8 w-8 object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
      style={{ backgroundColor: avatarColor(name) }}
      aria-hidden="true"
    >
      {nameInitial(name)}
    </span>
  );
}

function RankMark({ rank }: { rank: number | null }) {
  const tone =
    rank === 1
      ? "text-[#e6a800]"
      : rank === 2
        ? "text-[#7b8794]"
        : rank === 3
          ? "text-[#d4894a]"
          : "text-[#6e7881]";
  return (
    <span className={`w-6 shrink-0 text-center text-[15px] font-extrabold tabular-nums ${tone}`}>
      {rank ?? "–"}
    </span>
  );
}

function PreviewRow({ row }: { row: LeaderboardRow }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${
        row.isYou ? "bg-[#ddf4ff]" : ""
      }`}
    >
      <RankMark rank={row.rank} />
      <MiniAvatar name={row.name} image={row.image} />
      <span
        className={`min-w-0 flex-1 truncate text-[14px] font-extrabold ${
          row.isYou ? "text-[#0284c7]" : "text-[#3c3c3c]"
        }`}
      >
        {row.name}
      </span>
      {row.isYou ? (
        <span className="shrink-0 rounded-full bg-[#0284c7] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
          Bạn
        </span>
      ) : null}
      <span className="flex shrink-0 items-center gap-0.5 text-[14px] font-extrabold tabular-nums text-[#3c3c3c]">
        <MaterialIcon name="bolt" className="text-[16px] text-[#ffc800]" filled />
        {row.xp}
      </span>
    </div>
  );
}

function rankDetail(board: LeaderboardPayload): string {
  if (!board.ready) return "Bảng sẽ hiện khi giáo viên bật lưu điểm.";
  if (board.viewerIsAdmin) return "Tài khoản giáo viên không hiện trên bảng.";
  if (!board.className) return "Nhờ giáo viên thêm bạn vào lớp để so với bạn học.";
  if (board.yourRank == null) return "Hoàn thành một bài nghe để lên bảng tuần này.";
  if (board.yourRank === 1) return "Bạn đang dẫn đầu tuần này.";
  if (board.yourRank <= 3) return "Bạn đang trong top 3 tuần này.";
  return "Học thêm một bài để vượt lên.";
}

function useIncomingChallenges(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/duels?badge=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled || !data || typeof data !== "object") return;
        const next = (data as { count?: unknown }).count;
        setCount(typeof next === "number" && next > 0 ? next : 0);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

function DuelCta() {
  const challenges = useIncomingChallenges();
  const waiting =
    challenges > 0
      ? challenges === 1
        ? "1 lời thách đấu đang chờ bạn"
        : `${challenges} lời thách đấu đang chờ bạn`
      : "Một bạn cùng lớp ngẫu nhiên. Cùng những câu cả hai đã học.";

  return (
    <Link
      href="/duel"
      aria-label={challenges > 0 ? `Vào Đấu, ${waiting}` : "Vào Đấu"}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-[#e5e5e5] bg-white font-headline-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284c7]"
    >
      <div className="flex items-center gap-3 bg-[#e0f2fe] px-4 py-4">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0284c7] text-white shadow-[0_4px_0_0_#0369a1]">
          <MaterialIcon name="swords" className="text-[28px]" filled />
          {challenges > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-extrabold leading-none text-white">
              {challenges > 9 ? "9+" : challenges}
            </span>
          ) : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#0284c7]">
            Đấu
          </span>
          <span className="mt-0.5 block text-[20px] font-extrabold leading-tight text-[#131b2e]">
            Thách bạn cùng lớp
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col px-4 py-4">
        <p className="text-[14px] font-bold leading-snug text-[#3e4850]">
          15 câu giống nhau. Ai nhanh hơn được điểm.
        </p>
        <p
          className={`mt-2 text-[13px] font-extrabold leading-snug ${
            challenges > 0 ? "text-[#e11d48]" : "text-[#6e7881]"
          }`}
        >
          {waiting}
        </p>
        <div className="mt-auto pt-4">
          <DuoButton>{challenges > 0 ? "Vào đấu" : "Đấu ngay"}</DuoButton>
        </div>
      </div>
    </Link>
  );
}

function RankingPreview({ board }: { board: LeaderboardPayload }) {
  const ranked = board.ready && !board.viewerIsAdmin && Boolean(board.className) && board.yourRank != null;
  const rows = ranked ? previewLeaderboardRows(board.rows) : [];
  const eyebrow = ranked && board.className ? `${board.className} · Tuần này` : "Tuần này";

  return (
    <Link
      href="/leaderboard"
      aria-label={
        board.yourRank != null ? `Xếp hạng, bạn đang hạng ${board.yourRank}` : "Xem bảng xếp hạng"
      }
      className="group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-[#e5e5e5] bg-white font-headline-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284c7]"
    >
      <div className="flex items-start gap-3 bg-[#fff4d6] px-4 py-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ffc800] text-[#7a4b00] shadow-[0_4px_0_0_#e6a800]">
          <MaterialIcon name="emoji_events" className="text-[28px]" filled />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-[11px] font-extrabold uppercase tracking-wider text-[#855300]">
              {eyebrow}
            </span>
            {board.ready && board.countdown ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-extrabold text-[#855300] shadow-[0_2px_0_0_#f4d48a]">
                <MaterialIcon name="schedule" className="text-[15px]" />
                {board.countdown}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[32px] font-extrabold leading-none tabular-nums text-[#131b2e]">
            {ranked && board.yourRank != null ? `#${board.yourRank}` : "–"}
          </span>
          {ranked ? (
            <span className="mt-1 flex items-center gap-0.5 text-[13px] font-extrabold text-[#855300]">
              <MaterialIcon name="bolt" className="text-[16px] text-[#f59e0b]" filled />
              {board.yourXp} XP
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-3 py-3">
        <p className="px-1 text-[13px] font-bold leading-snug text-[#6e7881]">{rankDetail(board)}</p>
        {rows.length > 0 ? (
          <div className="mt-2 flex flex-col gap-0.5">
            {rows.map((row, index) => (
              <div key={`${row.rank ?? "you"}-${row.name}-${index}`} className="flex flex-col">
                {row.gapBefore ? (
                  <p className="py-0.5 text-center text-[14px] font-extrabold tracking-[0.3em] text-[#afafaf]" aria-hidden="true">
                    ···
                  </p>
                ) : null}
                <PreviewRow row={row} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-auto pt-3">
          <DuoButton>Xem xếp hạng</DuoButton>
        </div>
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
      className="group relative flex min-h-[220px] w-[200px] shrink-0 flex-col justify-between gap-3 overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 active:scale-[0.97]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
            {isComplete ? (
              <MaterialIcon name="check_circle" className="text-[14px] text-[#34C759]" filled />
            ) : null}
            Ausbildung
          </span>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:bg-[#0066cc] group-hover:text-white">
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
  levelCatalog,
  interviewClipTotals,
  unlockedLevelSlugs = [],
  interviewAccess = false,
  ranking,
}: HomeScreenProps) {
  const { data: session } = useSession();
  const { continueLevel, progressFor, streakDays } =
    useProgress(interviewClipTotals, levelCatalog);
  const firstName =
    session?.user?.name?.trim().split(/\s+/)[0] ?? "bạn";
  const greeting = `Chào ${firstName} 👋`;

  return (
    <div 
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* Parallax Background Elements */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-6">
          <div className="flex min-w-0 items-center gap-space-8">
            <Image
              src="/logo192.png"
              alt="NaNu Nana"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain"
              priority
            />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate font-headline-sm text-headline-sm font-bold leading-none tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                {greeting}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
            <TodayXpChip />
            <ProfileButton />
          </div>
        </div>
      </header>

      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-4xl flex-col gap-space-24 px-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
          {continueLevel &&
          unlockedLevelSlugs.includes(continueLevel.levelSlug) ? (
            <ContinueCard
              levelLabel={continueLevel.levelLabel}
              chapterLabel={continueLevel.chapterLabel}
              totalChapters={continueLevel.totalChapters}
              percent={continueLevel.percent}
              currentChapterIndex={continueLevel.currentChapterIndex}
              href={continueLevel.href}
            />
          ) : null}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-stretch">
            <DuelCta />
            <RankingPreview board={ranking} />
          </section>

          <section className="flex flex-col gap-space-12 mt-4">
            <div className="flex flex-col gap-space-4">
              <h2 className="font-headline-sm text-[22px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                Luyện tập theo trình độ
              </h2>
              {levels.some((level) => !unlockedLevelSlugs.includes(level.slug)) ? (
                <p className="font-body-sm text-body-sm text-[#86868b]">
                  Ổ khóa nghĩa là trình độ chưa được mở. Nhờ giáo viên mở giúp bạn.
                </p>
              ) : null}
            </div>
            <div className="-mx-6 flex flex-nowrap gap-4 overflow-x-auto scroll-smooth px-6 pb-6 pt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {levels.map((level) => (
                <LevelCard
                  key={level.slug}
                  level={level}
                  unlocked={unlockedLevelSlugs.includes(level.slug)}
                />
              ))}
            </div>
          </section>

          {interviewAccess ? (
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
          ) : null}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
