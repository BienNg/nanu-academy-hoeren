"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BottomNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  googleProfileImage,
  type ClassBoardExtras,
  type ClassChampions,
  type LeaderboardBoard,
  type LeaderboardClassOption,
  type LeaderboardPayload,
  type LeaderboardRange,
  type LeaderboardScope,
} from "@/lib/xp";
import { BLITZRUNDE_ICON, BLITZRUNDE_SCHEMA_HINT } from "@/lib/blitzrunde";
import { BlitzrundeProgressChart } from "@/components/blitzrunde/BlitzrundeProgressChart";
import { DUEL_SCHEMA_HINT } from "@/lib/duels";
import { PersonAvatar, RankBadge } from "@/components/LeaderboardParts";

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

/** Visual order of a podium: third on the left, first in the middle, second on the right. Delays stage the reveal 3 → 2 → 1. */
const PODIUM_SLOTS = [
  {
    rank: 3,
    step: "min-h-14 sm:min-h-16",
    offset: "pt-56 sm:pt-60",
    disc: "h-14 w-14 sm:h-16 sm:w-16",
    icon: "text-[32px]! sm:text-[38px]!",
    block:
      "from-[#fdba74] to-[#ea7a2c] text-[#7c2d12] shadow-[inset_0_4px_0_0_rgba(255,255,255,0.45),0_6px_0_0_#9a3412]",
    rise: 100,
  },
  {
    rank: 1,
    step: "min-h-28 sm:min-h-32",
    offset: "pt-40 sm:pt-44",
    disc: "h-[72px] w-[72px] sm:h-20 sm:w-20",
    icon: "text-[42px]! sm:text-[48px]!",
    block:
      "from-[#ffe58a] to-[#f5b400] text-[#6b4500] shadow-[inset_0_4px_0_0_rgba(255,255,255,0.6),0_6px_0_0_#a86f00]",
    rise: 400,
  },
  {
    rank: 2,
    step: "min-h-20 sm:min-h-24",
    offset: "pt-48 sm:pt-52",
    disc: "h-14 w-14 sm:h-16 sm:w-16",
    icon: "text-[32px]! sm:text-[38px]!",
    block:
      "from-[#f8fafc] to-[#b6c2d2] text-[#475569] shadow-[inset_0_4px_0_0_rgba(255,255,255,0.7),0_6px_0_0_#64748b]",
    rise: 250,
  },
] as const;

const PODIUM_CONFETTI = [
  {
    left: "6%",
    color: "#ffd54a",
    delay: 1.0,
    duration: 4.2,
    shape: "h-2.5 w-1.5",
  },
  {
    left: "14%",
    color: "#f472b6",
    delay: 2.6,
    duration: 3.6,
    shape: "h-1.5 w-1.5 rounded-full",
  },
  {
    left: "22%",
    color: "#38bdf8",
    delay: 1.4,
    duration: 4.8,
    shape: "h-2 w-1",
  },
  {
    left: "31%",
    color: "#a3e635",
    delay: 3.1,
    duration: 4.0,
    shape: "h-2.5 w-1.5",
  },
  {
    left: "40%",
    color: "#ffd54a",
    delay: 1.8,
    duration: 3.8,
    shape: "h-1.5 w-1.5 rounded-full",
  },
  {
    left: "48%",
    color: "#fb923c",
    delay: 1.1,
    duration: 4.4,
    shape: "h-2 w-1",
  },
  {
    left: "56%",
    color: "#38bdf8",
    delay: 2.2,
    duration: 4.1,
    shape: "h-2.5 w-1.5",
  },
  {
    left: "64%",
    color: "#f472b6",
    delay: 1.3,
    duration: 3.7,
    shape: "h-2 w-1",
  },
  {
    left: "72%",
    color: "#ffd54a",
    delay: 2.9,
    duration: 4.6,
    shape: "h-1.5 w-1.5 rounded-full",
  },
  {
    left: "80%",
    color: "#a3e635",
    delay: 1.6,
    duration: 4.0,
    shape: "h-2.5 w-1.5",
  },
  {
    left: "88%",
    color: "#fb923c",
    delay: 2.4,
    duration: 3.9,
    shape: "h-2 w-1",
  },
  {
    left: "95%",
    color: "#38bdf8",
    delay: 1.2,
    duration: 4.5,
    shape: "h-1.5 w-1.5 rounded-full",
  },
];

const PODIUM_SPARKLES = [
  { className: "left-[8%] top-[22%] text-[14px]", delay: 0.2 },
  { className: "left-[24%] top-[12%] text-[10px]", delay: 1.1 },
  { className: "right-[10%] top-[18%] text-[16px]", delay: 0.6 },
  { className: "right-[26%] top-[34%] text-[10px]", delay: 1.6 },
  { className: "left-[4%] top-[52%] text-[11px]", delay: 1.9 },
  { className: "right-[5%] top-[50%] text-[12px]", delay: 0.9 },
];

function weekLabel(week: string): string {
  const [, month, day] = week.split("-");
  return `${day}.${month}.`;
}

/** Counts from 0 up to `target` after `delayMs`; jumps straight there for reduced motion. */
function useCountUp(target: number, delayMs: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = 900;
    const start = performance.now() + (reduce ? 0 : delayMs);
    let frame = requestAnimationFrame(function tick(now) {
      const progress = reduce
        ? 1
        : Math.min(1, Math.max(0, (now - start) / duration));
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, delayMs]);
  return value;
}

function PodiumPlace({
  place,
  slot,
}: {
  place: ClassChampions["places"][number] | undefined;
  slot: (typeof PODIUM_SLOTS)[number];
}) {
  const { rank } = slot;
  const popDelay = slot.rise + 450;
  const xp = useCountUp(place?.xp ?? 0, popDelay + 150);
  return (
    <li
      className={`flex min-w-0 flex-col ${slot.offset} ${rank === 1 ? "z-10" : ""}`}
    >
      <span className="sr-only">
        {place
          ? `Hạng ${rank}: ${place.name}, ${place.xp.toLocaleString("vi-VN")} XP`
          : `Hạng ${rank} trống`}
      </span>
      <div className="relative flex w-full flex-1 flex-col">
        <div className="absolute inset-x-0 bottom-full flex justify-center pb-2">
          {place ? (
            <div
              className="podium-pop flex w-full flex-col items-center px-0.5 text-center"
              style={{ animationDelay: `${popDelay}ms` }}
              aria-hidden="true"
            >
              <div className="relative">
                {rank === 1 ? (
                  <span className="podium-crown absolute -top-6 left-1/2 -ml-[14px] text-[28px] leading-none sm:-top-7 sm:-ml-4 sm:text-[32px]">
                    👑
                  </span>
                ) : null}
                <span
                  className={`flex items-center justify-center rounded-full bg-gradient-to-b ring-4 ring-white/15 ${slot.block} ${slot.disc} ${
                    rank === 1 ? "podium-glow" : ""
                  }`}
                >
                  <span
                    className={`material-symbols-outlined ${slot.icon}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {rank === 1 ? "emoji_events" : "military_tech"}
                  </span>
                </span>
              </div>
              <p
                className={`mt-2 w-full truncate font-extrabold leading-tight text-white ${
                  rank === 1
                    ? "text-[17px] sm:text-[19px]"
                    : "text-[14px] sm:text-[16px]"
                }`}
              >
                {place.name}
              </p>
              {place.isYours ? (
                <span className="mt-1 rounded-full bg-[#ffd54a] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#3d2700] shadow-[0_2px_0_0_#b77f00]">
                  Lớp bạn
                </span>
              ) : null}
              <p className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-extrabold tabular-nums text-[#ffe58a]">
                <span
                  className="material-symbols-outlined text-[14px]!"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  bolt
                </span>
                {xp.toLocaleString("vi-VN")}
              </p>
            </div>
          ) : (
            <span
              className="podium-pop flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-[18px] font-extrabold text-white/40"
              style={{ animationDelay: `${popDelay}ms` }}
              aria-hidden="true"
            >
              ?
            </span>
          )}
        </div>
        <div
          className={`podium-rise relative flex w-full flex-1 flex-col items-center overflow-hidden rounded-t-2xl px-1.5 pb-3 pt-2 sm:px-2.5 ${slot.step} ${
            place
              ? `bg-gradient-to-b ${slot.block}`
              : "border-2 border-b-0 border-dashed border-white/20 bg-white/5 text-white/30"
          }`}
          style={{ animationDelay: `${slot.rise}ms` }}
        >
          <span
            className={`font-extrabold leading-none ${rank === 1 ? "text-[38px] sm:text-[44px]" : "text-[26px] sm:text-[30px]"} ${
              place ? "drop-shadow-[0_2px_0_rgba(255,255,255,0.55)]" : ""
            }`}
            aria-hidden="true"
          >
            {rank}
          </span>
          {place && place.students.length > 0 ? (
            <ul
              className="mt-2 flex w-full flex-wrap justify-center gap-1"
              aria-label={`Học viên lớp ${place.name}`}
            >
              {place.students.map((student, index) => (
                <li
                  key={`${student.name}-${index}`}
                  className={`podium-name max-w-full break-words rounded-xl px-2 py-0.5 text-center text-[11px] font-extrabold leading-tight sm:rounded-full sm:text-[12px] ${
                    student.isYou
                      ? "bg-[#0284c7] text-white shadow-[0_2px_0_0_#0369a1]"
                      : "bg-white/45"
                  }`}
                  style={{
                    animationDelay: `${slot.rise + 650 + Math.min(index, 12) * 45}ms`,
                  }}
                >
                  {student.name}
                </li>
              ))}
            </ul>
          ) : null}
          {place && rank === 1 ? (
            <span
              className="podium-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Last week's top 3 classes, standing on a podium. Before any class has scored, it invites the first champion. */
function ClassChampionsBanner({ champions }: { champions: ClassChampions }) {
  const byRank = new Map(champions.places.map((place) => [place.rank, place]));
  const hasPlaces = champions.places.length > 0;
  return (
    <section
      aria-label="Nhà vô địch tuần trước"
      className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#3b1d8f] via-[#2a1670] to-[#160d45] p-4 text-white shadow-[0_5px_0_0_#0f0a33] sm:p-6"
    >
      <span
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,213,74,0.32),transparent_62%)]"
        aria-hidden="true"
      />
      {hasPlaces ? (
        <>
          {PODIUM_SPARKLES.map((sparkle) => (
            <span
              key={sparkle.className}
              className={`podium-twinkle pointer-events-none absolute leading-none text-[#ffe58a] ${sparkle.className}`}
              style={{ animationDelay: `${sparkle.delay}s` }}
              aria-hidden="true"
            >
              ✦
            </span>
          ))}
          {PODIUM_CONFETTI.map((piece) => (
            <span
              key={piece.left}
              className={`podium-confetti pointer-events-none absolute -top-3 ${piece.shape}`}
              style={{
                left: piece.left,
                backgroundColor: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              }}
              aria-hidden="true"
            />
          ))}
        </>
      ) : null}
      <div className="relative z-10 flex justify-center">
        <p className="inline-flex items-center gap-1 rounded-full bg-[#ffd54a] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#3d2700] shadow-[0_3px_0_0_#b77f00]">
          <span
            className="material-symbols-outlined text-[16px]!"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            emoji_events
          </span>
          Nhà vô địch tuần trước · từ {weekLabel(champions.week)}
        </p>
      </div>
      {hasPlaces ? (
        <ol
          className="relative z-10 mt-9 grid w-full grid-cols-3 gap-2 sm:mt-11 sm:gap-3"
          aria-label="Bục trao giải"
        >
          {PODIUM_SLOTS.map((slot) => (
            <PodiumPlace
              key={slot.rank}
              place={byRank.get(slot.rank)}
              slot={slot}
            />
          ))}
        </ol>
      ) : (
        <div className="relative z-10 mt-3 pr-16">
          <p className="text-[18px] font-extrabold leading-tight text-white">
            Chưa có nhà vô địch nào
          </p>
          <p className="mt-1 text-[13px] font-bold text-white/75">
            Tuần trước chưa lớp nào ghi XP. Lớp nào nhiều XP nhất đến Chủ nhật
            sẽ là nhà vô địch!
          </p>
        </div>
      )}
      {hasPlaces ? (
        <div
          className="relative z-10 -mx-4 -mb-4 h-3 bg-[#0f0a33]/70 sm:-mx-6 sm:-mb-6"
          aria-hidden="true"
        />
      ) : (
        <span
          className="material-symbols-outlined pointer-events-none absolute -bottom-5 -right-2 text-[110px] text-[#ffd54a]/25"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          emoji_events
        </span>
      )}
    </section>
  );
}

function ClassBoardList({ classes }: { classes: ClassBoardExtras }) {
  return (
    <>
      <p className="-mb-1 px-3 text-[11px] font-extrabold uppercase tracking-wide text-[#94a3b8]">
        Tổng XP tuần này của cả lớp
      </p>
      <ol className="flex flex-col gap-2">
        {classes.rows.map((row) => (
          <li
            key={`${row.rank}-${row.name}`}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
              row.isYours ? "bg-[#e0f2fe] shadow-[0_3px_0_0_#7dd3fc]" : "bg-white shadow-[0_3px_0_0_#dae2fd]"
            }`}
          >
            <RankBadge rank={row.rank} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[15px] font-extrabold text-[#131b2e]">{row.name}</span>
                {row.isYours ? (
                  <span className="shrink-0 rounded-full bg-[#0284c7] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    Lớp bạn
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[12px] font-bold text-[#6e7881]">
                {row.members} học viên · {row.xpPerMember.toLocaleString("vi-VN")} XP/người
              </span>
              {row.isYours ? (
                <span className="block text-[12px] font-extrabold text-[#0284c7]">
                  Bạn góp {classes.yourContribution.toLocaleString("vi-VN")} XP
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-[16px] font-extrabold tabular-nums text-[#f59e0b]">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                bolt
              </span>
              {row.xp.toLocaleString("vi-VN")}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

const BOARD_OPTIONS: { id: LeaderboardBoard; label: string; icon: string; iconClass: string }[] = [
  { id: "xp", label: "XP", icon: "bolt", iconClass: "text-[#f5a524]" },
  { id: "classes", label: "Lớp", icon: "groups", iconClass: "text-[#0284c7]" },
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
    <div className="flex rounded-2xl bg-[#e2e7ff] p-1" role="tablist" aria-label="Loại bảng">
      {options.map((option) => {
        const active = board === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl text-[14px] font-extrabold transition-all sm:gap-1.5 sm:text-[16px] ${
              active
                ? "bg-white text-[#0284c7] shadow-[0_3px_0_0_#bec8f0]"
                : "text-[#5c6b80] active:translate-y-0.5"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] sm:text-[20px] ${option.iconClass}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              {option.icon}
            </span>
            <span className={!active && options.length > 3 ? "sr-only sm:not-sr-only" : undefined}>{option.label}</span>
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
    <div className="flex shrink-0 rounded-2xl bg-[#e2e7ff] p-1" role="tablist" aria-label="Phạm vi xếp hạng">
      {SCOPE_OPTIONS.map((option) => {
        const active = scope === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl px-3 text-[13px] font-extrabold transition-colors sm:h-10 sm:px-4 sm:text-[15px] ${
              active ? "bg-[#0284c7] text-white shadow-[0_3px_0_0_#0369a1]" : "text-[#5c6b80]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ClassScope({
  scope,
  classKey,
  options,
  onScope,
  onClass,
}: {
  scope: LeaderboardScope;
  classKey: string | null;
  options: LeaderboardClassOption[];
  onScope: (scope: LeaderboardScope) => void;
  onClass: (classKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.key === classKey);
  const classActive = scope === "class";
  const label = selected?.label ?? (classActive ? "Chọn lớp" : "Lớp");

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
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <div ref={rootRef} className="relative min-w-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={selected ? `Lớp ${selected.label}` : "Chọn lớp"}
          onClick={() => setOpen((current) => !current)}
          className={`inline-flex h-9 max-w-[9.5rem] items-center gap-0.5 rounded-xl px-3 text-[13px] font-extrabold sm:h-10 sm:max-w-[14rem] sm:gap-1 sm:px-4 sm:text-[15px] ${
            classActive ? "bg-[#0284c7] text-white shadow-[0_3px_0_0_#0369a1]" : "text-[#5c6b80]"
          }`}
        >
          <span className="truncate">{label}</span>
          <span
            className={`material-symbols-outlined shrink-0 text-[18px] transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            expand_more
          </span>
        </button>
        {open ? (
          <div
            role="menu"
            aria-label="Lớp"
            className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-64 w-max min-w-full max-w-[16rem] overflow-y-auto rounded-2xl border border-black/[0.06] bg-white py-1 shadow-[0_8px_24px_rgba(19,27,46,0.12)]"
          >
            {options.map((option) => {
              const selectedOption = classActive && classKey === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selectedOption}
                  onClick={() => {
                    onClass(option.key);
                    setOpen(false);
                  }}
                  className={`flex h-11 w-full items-center px-4 text-left text-[15px] font-extrabold ${
                    selectedOption ? "text-[#0284c7]" : "text-[#131b2e]"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        role="tab"
        aria-selected={scope === "global"}
        onClick={() => onScope("global")}
        className={`inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-3 text-[13px] font-extrabold sm:h-10 sm:px-4 sm:text-[15px] ${
          scope === "global" ? "bg-[#0284c7] text-white shadow-[0_3px_0_0_#0369a1]" : "text-[#5c6b80]"
        }`}
      >
        Mọi người
      </button>
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
        className="inline-flex h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl bg-white px-2 text-[13px] font-extrabold text-[#131b2e] shadow-[0_3px_0_0_#dae2fd] active:translate-y-0.5 sm:h-12 sm:gap-2 sm:px-3.5 sm:text-[15px]"
      >
        <span className="material-symbols-outlined text-[18px] text-[#0284c7]" aria-hidden="true">
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
                  selected ? "text-[#0284c7]" : "text-[#131b2e]"
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
  canPickClass,
}: {
  initial: LeaderboardPayload;
  isAdmin: boolean;
  canPickClass: boolean;
}) {
  const { data: session } = useSession();
  const ownImage = googleProfileImage(session?.user?.image);
  const [board, setBoard] = useState(initial);
  const [boardKind, setBoardKind] = useState<LeaderboardBoard>(initial.board ?? "xp");
  const [scope, setScope] = useState<LeaderboardScope>(initial.scope);
  const [classKey, setClassKey] = useState<string | null>(initial.classKey);
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
    const params = new URLSearchParams({ scope, range, board: boardKind });
    if (canPickClass && scope === "class" && classKey) params.set("class", classKey);
    void fetch(`/api/leaderboard?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!cancelled && isLeaderboardPayload(data)) {
          setBoard(data);
          if (data.scope === "class") setClassKey(data.classKey);
        }
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
  }, [scope, range, boardKind, classKey, canPickClass]);

  const duelTab = board.duelAvailable || isAdmin;
  const boardOptions = BOARD_OPTIONS.filter(
    (option) =>
      (option.id !== "blitzrunde" || board.blitzrundeAvailable) &&
      (option.id !== "duel" || duelTab),
  );

  // Fall back to XP as soon as the picked board is no longer offered.
  if (
    (!board.blitzrundeAvailable && boardKind === "blitzrunde") ||
    (!duelTab && boardKind === "duel")
  ) {
    setBoardKind("xp");
  }

  const classBoard = board.board === "classes" ? board.classes : undefined;
  // The classes board is always this week, whatever range the other boards use.
  const shownRange: LeaderboardRange = board.board === "classes" ? "week" : range;
  const emptyClass = board.ready && !classBoard && scope === "class" && !board.className;
  const emptyGlobal =
    board.ready && !classBoard && scope === "global" && board.rows.every((row) => row.xp === 0);
  const emptyClasses = board.ready && board.board === "classes" && (classBoard?.rows.length ?? 0) === 0;
  const rangeLabel = shownRange === "week" ? "tuần này" : "từ trước đến nay";

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
              {shownRange === "week" && board.countdown ? (
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
          {boardOptions.length > 1 ? (
            <BoardTabs board={boardKind} options={boardOptions} onChange={setBoardKind} />
          ) : null}
          {boardKind === "classes" ? null : (
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            {canPickClass && board.classOptions.length > 0 ? (
              <div className="flex min-w-0 rounded-2xl bg-[#e2e7ff] p-1">
                <ClassScope
                  scope={scope}
                  classKey={classKey}
                  options={board.classOptions}
                  onScope={setScope}
                  onClass={(key) => {
                    setClassKey(key);
                    setScope("class");
                  }}
                />
              </div>
            ) : (
              <ScopeTabs scope={scope} onChange={setScope} />
            )}
            <RangeMenu range={range} onChange={setRange} />
          </div>
          )}
        </div>
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">
                {(board.board === "blitzrunde" && scope === "class") || board.board === "classes"
                  ? board.className
                    ? `${board.className} · `
                    : ""
                  : ""}
                {shownRange === "week" ? "Tuần này" : "Mọi lúc"}
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
                {board.board === "duel"
                  ? "XP đấu"
                  : board.board === "blitzrunde"
                    ? "Điểm Blitzrunde"
                    : board.board === "classes"
                      ? "XP của lớp bạn"
                      : "XP của bạn"}
              </p>
              {classBoard ? (
                <p className="mt-2 text-[13px] font-bold text-sky-50">
                  {classBoard.yourClassRank
                    ? `Hạng ${classBoard.yourClassRank} / ${classBoard.rows.length} lớp`
                    : "Lớp bạn chưa có XP tuần này"}
                </p>
              ) : board.board === "duel" ? (
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
                  : board.board === "classes"
                    ? "Mỗi XP bạn kiếm được cũng cộng cho lớp."
                    : "Điểm từ phần luyện tập và đấu."}
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
                  ? "Chạy supabase/xp_awards.sql một lần trong Supabase, rồi hoàn thành một phần luyện tập."
                  : "Bảng sẽ hiện sau khi giáo viên bật lưu điểm."}
            </p>
          </section>
        ) : emptyClasses ? (
          <>
          {classBoard?.lastWeek ? <ClassChampionsBanner champions={classBoard.lastWeek} /> : null}
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold text-[#131b2e]">Chưa có lớp nào có XP tuần này</p>
            <p className="mt-2 text-[14px] font-medium text-[#6e7881]">
              Hoàn thành một phần luyện tập để đưa lớp bạn lên bảng.
            </p>
          </section>
          </>
        ) : classBoard ? (
          <>
            {classBoard.lastWeek ? <ClassChampionsBanner champions={classBoard.lastWeek} /> : null}
            <ClassBoardList classes={classBoard} />
          </>
        ) : emptyClass ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#e0f2fe] text-[#0284c7]">
              <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
                groups
              </span>
            </div>
            <p className="text-[16px] font-extrabold text-[#131b2e]">
              {canPickClass ? "Chọn một lớp" : "Bạn chưa có lớp"}
            </p>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#6e7881]">
              {canPickClass
                ? "Chọn lớp ở trên để xem bảng xếp hạng của lớp đó. Mục Mọi người vẫn hiện toàn bộ học viên."
                : "Nhờ giáo viên thêm bạn vào lớp để so với bạn học. Mục Mọi người vẫn hiện toàn bộ học viên."}
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
                  : "Hoàn thành một phần luyện tập hoặc một trận đấu để lên bảng."}
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
                <Link
                  href={`/leaderboard/${encodeURIComponent(row.userId)}`}
                  aria-label={row.isYou ? "Hồ sơ của bạn" : `Hồ sơ của ${row.name}`}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-transform active:translate-y-0.5 ${
                    row.isYou
                      ? "bg-[#e0f2fe] shadow-[0_3px_0_0_#7dd3fc]"
                      : "bg-white shadow-[0_3px_0_0_#dae2fd] hover:bg-[#f7f8ff]"
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
                </Link>
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
