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

const BOARD_OPTIONS: { id: LeaderboardBoard; label: string }[] = [
  { id: "xp", label: "XP" },
  { id: "duel", label: "Đấu" },
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
  onChange,
}: {
  board: LeaderboardBoard;
  onChange: (board: LeaderboardBoard) => void;
}) {
  return (
    <div className="flex border-b border-[#e4e8f6]" role="tablist" aria-label="Loại bảng">
      {BOARD_OPTIONS.map((option) => {
        const active = board === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`relative flex-1 pb-2.5 text-[15px] font-extrabold transition-colors ${
              active ? "text-[#0284c7]" : "text-[#94a3b8]"
            }`}
          >
            {option.label}
            {active ? (
              <span
                className="absolute inset-x-4 -bottom-px h-[3px] rounded-full bg-[#0284c7]"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-1 gap-0.5" role="tablist" aria-label={label}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`h-8 flex-1 whitespace-nowrap rounded-full text-[11px] font-extrabold transition-all sm:text-[12px] ${
              active ? "bg-white text-[#0284c7] shadow-[0_2px_0_0_#c3cdf2]" : "text-[#5b6577]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
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
          <BoardTabs board={boardKind} onChange={setBoardKind} />
          <div className="flex items-center gap-1 rounded-full bg-[#e2e7ff] p-1">
            <FilterGroup
              label="Phạm vi xếp hạng"
              value={scope}
              options={SCOPE_OPTIONS}
              onChange={setScope}
            />
            <span className="h-5 w-px shrink-0 bg-[#c3cdf2]" aria-hidden="true" />
            <FilterGroup
              label="Khoảng thời gian"
              value={range}
              options={RANGE_OPTIONS}
              onChange={setRange}
            />
          </div>
        </div>
      </header>

      <main
        className={`mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 ${
          loading ? "opacity-70" : ""
        }`}
      >
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">
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
                {board.board === "duel" ? "XP đấu" : "XP của bạn"}
              </p>
              {board.board === "duel" ? (
                <p className="mt-2 text-[13px] font-bold text-sky-50">
                  {board.yourWon} thắng · {board.yourTied} hòa · {board.yourLost} thua
                </p>
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
                : "Hoàn thành một phần luyện nghe hoặc một trận đấu để lên bảng."}
            </p>
          </section>
        ) : (
          <>
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
