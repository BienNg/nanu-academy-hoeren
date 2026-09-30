"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { BottomNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  googleProfileImage,
  type LeaderboardBoard,
  type LeaderboardPayload,
  type LeaderboardRange,
  type LeaderboardScope,
} from "@/lib/xp";
import { BLITZRUNDE_ICON, BLITZRUNDE_SCHEMA_HINT } from "@/lib/blitzrunde";
import { BlitzrundeProgressChart } from "@/components/blitzrunde/BlitzrundeProgressChart";
import { DUEL_SCHEMA_HINT } from "@/lib/duels";

const AVATAR_COLORS = ["#0284c7", "#0369a1", "#0f766e", "#b45309", "#7c3aed", "#be123c"];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 1)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0]!;
}

function initialFor(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function PersonAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
        <Image
          src={image}
          alt=""
          width={40}
          height={40}
          referrerPolicy="no-referrer"
          className="h-10 w-10 object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold text-white"
      style={{ backgroundColor: avatarColor(name) }}
      aria-hidden="true"
    >
      {initialFor(name)}
    </span>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) {
    return <span className="w-8 text-center text-[15px] font-bold text-[#94a3b8]">–</span>;
  }
  if (rank > 3) {
    return (
      <span className="w-8 text-center text-[15px] font-extrabold tabular-nums text-[#6e7881]">
        {rank}
      </span>
    );
  }
  const tone =
    rank === 1
      ? "bg-[#ffc800] text-[#7a4b00] shadow-[0_3px_0_0_#e0a800]"
      : rank === 2
        ? "bg-[#e8eef5] text-[#3e4850] shadow-[0_3px_0_0_#c5d0dc]"
        : "bg-[#f0b27a] text-[#6b3e12] shadow-[0_3px_0_0_#d4894a]";
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-extrabold tabular-nums ${tone}`}
    >
      {rank}
    </span>
  );
}

function MedalCount({ medal, count, label }: { medal: string; count: number; label: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${count === 0 ? "opacity-45" : ""}`} aria-label={`${count} ${label}`}>
      <span aria-hidden="true">{medal}</span>
      {count}
    </span>
  );
}

function BlitzSummary({
  gold,
  silver,
  bronze,
  rounds,
  byClass,
  currentClass,
}: {
  gold: number;
  silver: number;
  bronze: number;
  rounds: number;
  byClass: { classKey: string; classLabel: string; points: number }[];
  currentClass: string | null;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-extrabold text-white">
        <MedalCount medal="🥇" count={gold} label="huy chương vàng" />
        <MedalCount medal="🥈" count={silver} label="huy chương bạc" />
        <MedalCount medal="🥉" count={bronze} label="huy chương đồng" />
        <span className="text-sky-50">· {rounds} vòng</span>
      </p>
      {byClass.length > 1 ? (
        <p className="text-[12px] font-bold text-sky-50">
          {byClass
            .map((entry) => `${entry.classLabel === currentClass ? "Lớp này" : `Lớp ${entry.classLabel}`}: ${entry.points.toLocaleString("vi-VN")}`)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function BlitzRowStats({ row }: { row: LeaderboardPayload["rows"][number] }) {
  const rounds = row.rounds ?? 0;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] font-bold text-[#6e7881]">
      {row.won > 0 ? <MedalCount medal="🥇" count={row.won} label="vàng" /> : null}
      {(row.silver ?? 0) > 0 ? <MedalCount medal="🥈" count={row.silver ?? 0} label="bạc" /> : null}
      {(row.bronze ?? 0) > 0 ? <MedalCount medal="🥉" count={row.bronze ?? 0} label="đồng" /> : null}
      <span>{rounds} vòng</span>
      {row.former ? (
        <span className="rounded-full bg-[#f1f3ff] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#94a3b8]">
          đã chuyển lớp
        </span>
      ) : null}
    </span>
  );
}

function ClassProgressCard({
  progress,
  className,
}: {
  progress: NonNullable<NonNullable<LeaderboardPayload["blitzrunde"]>["progress"]>;
  className: string | null;
}) {
  const you = progress.series.find((line) => line.userId === progress.youId);
  const place = you ? progress.series.indexOf(you) + 1 : null;
  return (
    <section className="rounded-[28px] bg-white p-4 shadow-[0_4px_0_0_#dae2fd] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fef3c7] text-[#b45309] shadow-[0_3px_0_0_#fcd34d]">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            trending_up
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#b45309]">
            Tiến bộ · {className ?? "Lớp của bạn"}
          </p>
          <p className="text-[17px] font-extrabold leading-tight text-[#131b2e]">
            {you && place
              ? `Mọi lúc: hạng ${place} trong lớp · ${you.total.toLocaleString("vi-VN")} điểm`
              : "Chơi một vòng để có đường của bạn"}
          </p>
          <p className="mt-0.5 text-[12px] font-bold text-[#6e7881]">
            Tổng điểm cộng dồn sau mỗi vòng · {progress.rounds.length} vòng gần nhất
          </p>
        </div>
      </div>
      {progress.rounds.length >= 2 ? (
        <div className="mt-3">
          <BlitzrundeProgressChart
            rounds={progress.rounds}
            series={progress.series}
            names={progress.names}
            youId={progress.youId}
            variant="student"
            height={200}
          />
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-[#f1f3ff] px-4 py-3 text-[13px] font-bold text-[#6e7881]">
          Biểu đồ hiện khi lớp đã chơi ít nhất 2 vòng.
        </p>
      )}
    </section>
  );
}

const BOARD_OPTIONS: { id: LeaderboardBoard; label: string; icon: string; iconClass: string }[] = [
  { id: "xp", label: "XP", icon: "bolt", iconClass: "text-[#f5a524]" },
  { id: "duel", label: "Đấu", icon: "swords", iconClass: "text-[#e11d48]" },
  { id: "blitzrunde", label: "Blitzrunde", icon: BLITZRUNDE_ICON, iconClass: "text-[#f59e0b]" },
];

const SCOPE_OPTIONS: { id: LeaderboardScope; label: string }[] = [
  { id: "class", label: "Lớp của bạn" },
  { id: "global", label: "Mọi người" },
];

const RANGE_OPTIONS: { id: LeaderboardRange; label: string }[] = [
  { id: "week", label: "Tuần này" },
  { id: "all", label: "Mọi lúc" },
];

function BoardTabs({
  board,
  options,
  onChange,
}: {
  board: LeaderboardBoard;
  options: typeof BOARD_OPTIONS;
  onChange: (board: LeaderboardBoard) => void;
}) {
  return (
    <div className="flex rounded-full bg-[#e8eef6] p-1" role="tablist" aria-label="Loại bảng">
      {options.map((option) => {
        const active = board === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full text-[14px] font-extrabold transition-colors sm:gap-1.5 sm:text-[16px] ${
              active
                ? "bg-white text-[#0084ff] shadow-[0_1px_3px_rgba(19,27,46,0.12)]"
                : "text-[#3d4d66]"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] sm:text-[20px] ${option.iconClass}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              {option.icon}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ScopeTabs({
  scope,
  onChange,
}: {
  scope: LeaderboardScope;
  onChange: (scope: LeaderboardScope) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-full bg-[#e8eef6] p-1" role="tablist" aria-label="Phạm vi xếp hạng">
      {SCOPE_OPTIONS.map((option) => {
        const active = scope === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold transition-colors sm:h-10 sm:px-4 sm:text-[15px] ${
              active ? "bg-[#0084ff] text-white" : "text-[#5c6b80]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RangeMenu({
  range,
  onChange,
}: {
  range: LeaderboardRange;
  onChange: (range: LeaderboardRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = RANGE_OPTIONS.find((option) => option.id === range)?.label ?? "Tuần này";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Khoảng thời gian"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#d5deea] bg-white px-2 text-[13px] font-extrabold text-[#131b2e] shadow-[0_1px_2px_rgba(19,27,46,0.06)] sm:h-12 sm:gap-2 sm:px-3.5 sm:text-[15px]"
      >
        <span className="material-symbols-outlined text-[18px] text-[#5c6b80]" aria-hidden="true">
          calendar_today
        </span>
        {label}
        <span
          className={`material-symbols-outlined text-[20px] text-[#5c6b80] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Khoảng thời gian"
          className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-white py-1 shadow-[0_8px_24px_rgba(19,27,46,0.12)]"
        >
          {RANGE_OPTIONS.map((option) => {
            const selected = range === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex h-11 w-full items-center px-4 text-left text-[15px] font-extrabold ${
                  selected ? "text-[#0084ff]" : "text-[#131b2e]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function isLeaderboardPayload(value: unknown): value is LeaderboardPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LeaderboardPayload>;
  return Array.isArray(record.rows) && (record.scope === "class" || record.scope === "global");
}

export function LeaderboardScreen({
  initial,
  isAdmin,
}: {
  initial: LeaderboardPayload;
  isAdmin: boolean;
}) {
  const { data: session } = useSession();
  const ownImage = googleProfileImage(session?.user?.image);
  const [board, setBoard] = useState(initial);
  const [boardKind, setBoardKind] = useState<LeaderboardBoard>(initial.board ?? "xp");
  const [scope, setScope] = useState<LeaderboardScope>(initial.scope);
  const [range, setRange] = useState<LeaderboardRange>(initial.range);
  const [loading, setLoading] = useState(false);
  const skipFirstFetch = useRef(true);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/leaderboard?scope=${scope}&range=${range}&board=${boardKind}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!cancelled && isLeaderboardPayload(data)) setBoard(data);
      })
      .catch(() => {
        // Keep the board already on screen.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, range, boardKind]);

  const duelTab = board.duelAvailable || isAdmin;
  const boardOptions = BOARD_OPTIONS.filter(
    (option) =>
      (option.id !== "blitzrunde" || board.blitzrundeAvailable) &&
      (option.id !== "duel" || duelTab),
  );

  useEffect(() => {
    if (!board.blitzrundeAvailable && boardKind === "blitzrunde") setBoardKind("xp");
    if (!duelTab && boardKind === "duel") setBoardKind("xp");
  }, [board.blitzrundeAvailable, duelTab, boardKind]);

  const emptyClass = board.ready && scope === "class" && !board.className;
  const emptyGlobal =
    board.ready && scope === "global" && board.rows.every((row) => row.xp === 0);
  const rangeLabel = range === "week" ? "tuần này" : "từ trước đến nay";

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 pb-2.5 pt-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h1 className="min-w-0 font-headline-md text-headline-md font-extrabold tracking-tight text-[#131b2e]">
              Bảng xếp hạng
            </h1>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {range === "week" && board.countdown ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4d6] px-2.5 py-1 text-[12px] font-extrabold text-[#855300] shadow-[0_2px_0_0_#f4d48a]">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    schedule
                  </span>
                  {board.countdown}
                </span>
              ) : null}
              <TopBarStatus />
            </div>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 ${
          loading ? "opacity-70" : ""
        }`}
      >
        <div className="flex flex-col gap-3">
          <BoardTabs board={boardKind} options={boardOptions} onChange={setBoardKind} />
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <ScopeTabs scope={scope} onChange={setScope} />
            <RangeMenu range={range} onChange={setRange} />
          </div>
        </div>
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">
                {board.board === "blitzrunde" && scope === "class" && board.className
                  ? `${board.className} · `
                  : ""}
                {range === "week" ? "Tuần này" : "Mọi lúc"}
              </p>
              <p className="mt-1 text-[40px] font-extrabold leading-none tabular-nums">
                {board.yourXp}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[14px] font-bold">
                <span
                  className="material-symbols-outlined text-[18px] text-[#ffd60a]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  bolt
                </span>
                {board.board === "duel" ? "XP đấu" : board.board === "blitzrunde" ? "Điểm Blitzrunde" : "XP của bạn"}
              </p>
              {board.board === "duel" ? (
                <p className="mt-2 text-[13px] font-bold text-sky-50">
                  {board.yourWon} thắng · {board.yourTied} hòa · {board.yourLost} thua
                </p>
              ) : board.board === "blitzrunde" && board.blitzrunde ? (
                <BlitzSummary
                  gold={board.yourWon}
                  silver={board.blitzrunde.yourSilver}
                  bronze={board.blitzrunde.yourBronze}
                  rounds={board.blitzrunde.yourRounds}
                  byClass={board.blitzrunde.yourByClass}
                  currentClass={board.className}
                />
              ) : null}
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 shadow-[0_3px_0_0_rgba(3,105,161,0.45)]">
              <span
                className="material-symbols-outlined text-[32px] text-[#ffd60a]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                emoji_events
              </span>
            </div>
          </div>
          <p className="relative z-10 mt-3 text-[13px] font-semibold text-sky-50">
            {board.viewerIsAdmin
              ? "Tài khoản giáo viên không hiện trên bảng."
              : board.board === "duel"
                ? "XP từ trận đấu. Hạng theo XP đấu."
                : board.board === "blitzrunde"
                  ? "Điểm từ các vòng Blitzrunde trên lớp. Không tính vào XP."
                  : "Điểm từ phần luyện nghe và đấu."}
          </p>
          <span
            className="pointer-events-none absolute -right-3 -bottom-6 text-white/15 material-symbols-outlined text-[120px]"
            aria-hidden="true"
          >
            emoji_events
          </span>
        </section>

        {!board.ready ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold text-[#131b2e]">Điểm xếp hạng chưa được lưu</p>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#6e7881]">
              {board.board === "duel"
                ? isAdmin
                  ? DUEL_SCHEMA_HINT
                  : "Bảng đấu sẽ hiện sau khi giáo viên bật tính năng này."
                : board.board === "blitzrunde"
                  ? isAdmin
                    ? BLITZRUNDE_SCHEMA_HINT
                    : "Bảng Blitzrunde sẽ hiện sau khi giáo viên bật tính năng này."
                : isAdmin
                  ? "Chạy supabase/xp_awards.sql một lần trong Supabase, rồi hoàn thành một phần luyện nghe."
                  : "Bảng sẽ hiện sau khi giáo viên bật lưu điểm."}
            </p>
          </section>
        ) : emptyClass ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#e0f2fe] text-[#0284c7]">
              <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
                groups
              </span>
            </div>
            <p className="text-[16px] font-extrabold text-[#131b2e]">Bạn chưa có lớp</p>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#6e7881]">
              Nhờ giáo viên thêm bạn vào lớp để so với bạn học. Mục Mọi người vẫn hiện toàn bộ học viên.
            </p>
          </section>
        ) : emptyGlobal ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold text-[#131b2e]">Chưa có điểm {rangeLabel}</p>
            <p className="mt-2 text-[14px] font-medium text-[#6e7881]">
              {board.board === "duel"
                ? "Hoàn thành một trận đấu để lên bảng."
                : board.board === "blitzrunde"
                  ? "Chơi một vòng Blitzrunde trên lớp để lên bảng."
                  : "Hoàn thành một phần luyện nghe hoặc một trận đấu để lên bảng."}
            </p>
          </section>
        ) : (
          <>
          {board.board === "blitzrunde" && scope === "class" && board.blitzrunde?.progress ? (
            <ClassProgressCard progress={board.blitzrunde.progress} className={board.className} />
          ) : null}
          {board.board === "blitzrunde" && scope === "class" && board.className ? (
            <p className="-mb-1 flex items-center gap-1.5 px-3 text-[11px] font-extrabold uppercase tracking-wide text-[#94a3b8]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                groups
              </span>
              Lớp {board.className} · chỉ tính các vòng chơi trong lớp này
            </p>
          ) : null}
          {board.board === "duel" ? (
            <p className="-mb-1 px-3 text-[11px] font-extrabold uppercase tracking-wide text-[#94a3b8]">
              Thắng-Hòa-Thua, rồi XP đấu
            </p>
          ) : null}
          <ol className="flex flex-col gap-2">
            {board.rows.map((row, index) => (
              <li key={`${row.rank ?? "you"}-${row.name}-${index}`} className="flex flex-col gap-2">
                {row.gapBefore ? (
                  <p className="py-1 text-center text-[18px] font-extrabold tracking-[0.3em] text-[#94a3b8]" aria-hidden="true">
                    ···
                  </p>
                ) : null}
                <div
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                    row.isYou
                      ? "bg-[#e0f2fe] shadow-[0_3px_0_0_#7dd3fc]"
                      : "bg-white shadow-[0_3px_0_0_#dae2fd]"
                  }`}
                >
                  <RankBadge rank={row.rank} />
                  <PersonAvatar
                    name={row.name}
                    image={row.image ?? (row.isYou ? ownImage : null)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-extrabold text-[#131b2e]">{row.name}</span>
                      {board.board === "duel" ? (
                        <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#6e7881]">
                          {row.won}-{row.tied}-{row.lost}
                        </span>
                      ) : null}
                      {row.isYou ? (
                        <span className="shrink-0 rounded-full bg-[#0284c7] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                          Bạn
                        </span>
                      ) : null}
                    </span>
                    {board.board === "blitzrunde" ? <BlitzRowStats row={row} /> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[16px] font-extrabold tabular-nums text-[#f59e0b]">
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                      aria-hidden="true"
                    >
                      bolt
                    </span>
                    {row.xp}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
