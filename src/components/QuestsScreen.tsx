"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { chunkyButton } from "@/components/chunkyButton";
import { ChillPingu } from "@/components/session/Pingu";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  questZoneHeaders,
  readQuestUpdate,
  type QuestKind,
  type QuestUpdate,
} from "@/lib/quests";
import { formatWeekCountdown } from "@/lib/xp";

type QuestRow = {
  id: string;
  kind: QuestKind;
  title: string;
  xp: number;
  target: number;
  progress: number;
  done: boolean;
};

type QuestBoardPayload = {
  quests: QuestRow[];
  bonus: { xp: number; claimed: boolean };
  earnedXp: number;
  maxXp: number;
  update: QuestUpdate | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; board: QuestBoardPayload }
  | { status: "unavailable" };

const KIND_STYLE: Record<QuestKind, { icon: string; face: string; lip: string; unit: string }> = {
  listening: { icon: "headphones", face: "#0071E3", lip: "#0A4FA0", unit: "" },
  study: { icon: "menu_book", face: "#34C759", lip: "#248a3d", unit: "" },
  habit: { icon: "bolt", face: "#FF9500", lip: "#c26e00", unit: " XP" },
};

const SPRING = { type: "spring" as const, stiffness: 420, damping: 18 };

function readBoard(value: unknown): QuestBoardPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    ready?: unknown;
    quests?: unknown;
    bonus?: { xp?: unknown; claimed?: unknown };
    earnedXp?: unknown;
    maxXp?: unknown;
    update?: unknown;
  };
  if (raw.ready !== true || !Array.isArray(raw.quests)) return null;
  const quests = raw.quests.filter(
    (quest): quest is QuestRow =>
      Boolean(quest) &&
      typeof quest.id === "string" &&
      typeof quest.title === "string" &&
      typeof quest.xp === "number" &&
      typeof quest.target === "number" &&
      quest.target > 0 &&
      typeof quest.progress === "number" &&
      typeof quest.done === "boolean" &&
      quest.kind in KIND_STYLE,
  );
  if (quests.length === 0) return null;
  return {
    quests,
    bonus: {
      xp: typeof raw.bonus?.xp === "number" ? raw.bonus.xp : 0,
      claimed: raw.bonus?.claimed === true,
    },
    earnedXp: typeof raw.earnedXp === "number" ? raw.earnedXp : 0,
    maxXp: typeof raw.maxXp === "number" ? raw.maxXp : 0,
    update: readQuestUpdate(raw.update),
  };
}

function nextLocalMidnight(from: number): number {
  const date = new Date(from);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

/** Wooden chest. It springs open once the quest it guards is done. */
function QuestChest({ open, size = 44 }: { open: boolean; size?: number }) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <motion.svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
      initial={false}
      animate={
        open && !reduceMotion
          ? { scale: [1, 1.18, 0.96, 1], rotate: [0, -8, 6, 0] }
          : { scale: 1, rotate: 0 }
      }
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {open ? (
        <>
          <circle cx="32" cy="30" r="26" fill="#FFC83D" opacity="0.28" />
          <path d="M9 31 L15 13 H49 L55 31 Z" fill="#7C2D12" />
          <path d="M13 15 Q32 2 51 15 L49 19 H15 Z" fill="#F59E0B" />
          <path d="M18 31 Q32 20 46 31 Z" fill="#FFE07A" />
          <path d="M51 6 L52.4 9 L55.5 10.4 L52.4 11.8 L51 15 L49.6 11.8 L46.5 10.4 L49.6 9 Z" fill="#FFC83D" />
          <path d="M13 9 L14 11 L16 12 L14 13 L13 15 L12 13 L10 12 L12 11 Z" fill="#FFC83D" />
        </>
      ) : (
        <>
          <path d="M8 30 Q8 14 32 14 Q56 14 56 30 Z" fill="#F59E0B" />
          <path d="M14 23 Q20 18 32 18" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
        </>
      )}
      <rect x="7" y="29" width="50" height="27" rx="5" fill="#D97706" />
      <rect x="7" y="50" width="50" height="6" rx="3" fill="#92400E" />
      <rect x="7" y="28" width="50" height="5" rx="2.5" fill="#92400E" />
      {open ? null : (
        <>
          <rect x="26" y="25" width="12" height="15" rx="3.5" fill="#FFC83D" />
          <circle cx="32" cy="32" r="2.4" fill="#92400E" />
          <rect x="31" y="32" width="2" height="4.5" rx="1" fill="#92400E" />
        </>
      )}
    </motion.svg>
  );
}

function KindTile({ kind, done }: { kind: QuestKind; done: boolean }) {
  const style = KIND_STYLE[kind];
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
      style={{
        backgroundColor: done ? "#34C759" : style.face,
        boxShadow: `0 4px 0 0 ${done ? "#248a3d" : style.lip}`,
      }}
    >
      <span
        className="material-symbols-outlined text-[26px] text-white"
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}
        aria-hidden="true"
      >
        {done ? "check" : style.icon}
      </span>
    </span>
  );
}

function QuestProgressBar({ quest, delay }: { quest: QuestRow; delay: number }) {
  const reduceMotion = useReducedMotion() ?? false;
  const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  const unit = KIND_STYLE[quest.kind].unit;
  return (
    <div
      className="relative h-[18px] flex-1 overflow-hidden rounded-full bg-[#e5e5ea]"
      role="progressbar"
      aria-valuenow={quest.progress}
      aria-valuemin={0}
      aria-valuemax={quest.target}
      aria-label={quest.title}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ backgroundColor: quest.done ? "#34C759" : "#FFC800" }}
        initial={reduceMotion ? false : { width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut", delay }}
      >
        {percent > 0 ? (
          <span className="absolute inset-x-2 top-[4px] h-[4px] rounded-full bg-white/35" />
        ) : null}
      </motion.div>
      <span
        className={`absolute inset-0 flex items-center justify-center text-[12px] font-extrabold tabular-nums ${
          quest.done ? "text-white" : "text-[#6e6e73]"
        }`}
      >
        {quest.progress} / {quest.target}
        {unit}
      </span>
    </div>
  );
}

function QuestList({ quests }: { quests: readonly QuestRow[] }) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <ul className="overflow-hidden rounded-[24px] border-2 border-[#e5e5ea] bg-white shadow-[0_4px_0_0_#e5e5ea]">
      {quests.map((quest, index) => (
        <motion.li
          key={quest.id}
          className={`flex items-center gap-3 px-4 py-4 ${index > 0 ? "border-t-2 border-[#f2f2f7]" : ""}`}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.08 * index }}
        >
          <KindTile kind={quest.kind} done={quest.done} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-[15px] leading-5 font-extrabold ${
                  quest.done ? "text-[#86868b]" : "text-[#1d1d1f]"
                }`}
              >
                {quest.title}
              </p>
              <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold text-[#f59e0b]">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  bolt
                </span>
                {quest.xp}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <QuestProgressBar quest={quest} delay={0.15 + 0.08 * index} />
              <QuestChest open={quest.done} size={36} />
            </div>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

function BonusChest({ board }: { board: QuestBoardPayload }) {
  const done = board.quests.filter((quest) => quest.done).length;
  const total = board.quests.length;
  const claimed = board.bonus.claimed;
  return (
    <section
      aria-label="Rương thưởng"
      className={`flex items-center gap-4 rounded-[24px] border-2 p-4 ${
        claimed
          ? "border-[#ffd66b] bg-[#fff8e1] shadow-[0_4px_0_0_#ffd66b]"
          : "border-[#e5e5ea] bg-white shadow-[0_4px_0_0_#e5e5ea]"
      }`}
    >
      <QuestChest open={claimed} size={68} />
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-extrabold text-[#1d1d1f]">Rương thưởng</h2>
        <p className="mt-0.5 text-[13px] font-semibold leading-5 text-[#6e6e73]">
          {claimed
            ? `Bạn đã mở rương và nhận +${board.bonus.xp} XP!`
            : `Xong cả ${total} nhiệm vụ để mở rương +${board.bonus.xp} XP`}
        </p>
        <div className="mt-2 flex gap-1.5" aria-label={`${done} / ${total} nhiệm vụ`}>
          {board.quests.map((quest) => (
            <span
              key={quest.id}
              className={`h-2.5 flex-1 rounded-full ${quest.done ? "bg-[#34C759]" : "bg-[#e5e5ea]"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Hero({ board, countdown }: { board: QuestBoardPayload | null; countdown: string | null }) {
  const done = board?.quests.filter((quest) => quest.done).length ?? 0;
  const total = board?.quests.length ?? 3;
  const headline = !board
    ? "Hoàn thành nhiệm vụ, nhận thêm XP!"
    : done === total
      ? "Xuất sắc! Bạn đã xong hết hôm nay."
      : done === 0
        ? "Hoàn thành nhiệm vụ, nhận thêm XP!"
        : `Còn ${total - done} nhiệm vụ nữa thôi!`;
  return (
    <section className="relative flex min-h-[132px] items-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ffb020] to-[#ff8a00] p-4 pr-[112px] text-white shadow-[0_6px_0_0_#d97706]">
      <div className="relative z-10 flex flex-col gap-1">
        <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-wider text-white/85 uppercase">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            flag
          </span>
          Nhiệm vụ hằng ngày
        </span>
        <p className="text-[19px] leading-6 font-extrabold">{headline}</p>
        {countdown ? (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 text-[12px] font-extrabold">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              schedule
            </span>
            {countdown}
          </span>
        ) : null}
      </div>
      <div
        className="pointer-events-none absolute right-3 bottom-1 origin-bottom-right scale-[1.3]"
        aria-hidden="true"
      >
        <ChillPingu pose={done === total && board ? "balloon" : "pen"} />
      </div>
    </section>
  );
}

function EarnedToast({ update, onDone }: { update: QuestUpdate; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <motion.div
      role="status"
      className="fixed inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top,0px))] z-40 mx-auto flex w-fit items-center gap-2 rounded-full bg-[#1d1d1f] px-4 py-2.5 text-[14px] font-extrabold text-white shadow-lg"
      initial={{ opacity: 0, y: -16, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16 }}
      transition={SPRING}
    >
      <span
        className="material-symbols-outlined text-[18px] text-[#FFC83D]"
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        bolt
      </span>
      {update.bonus ? "Mở rương thưởng" : "Nhiệm vụ hoàn thành"} · +{update.xp} XP
    </motion.div>
  );
}

export function QuestsScreen() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [toast, setToast] = useState<QuestUpdate | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [resetAt, setResetAt] = useState<number | null>(null);

  const load = useCallback(() => {
    void fetch("/api/quests", { headers: questZoneHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const board = readBoard(data);
        setState(board ? { status: "ready", board } : { status: "unavailable" });
        if (board?.update && board.update.xp > 0) setToast(board.update);
        const loadedAt = Date.now();
        setNow(loadedAt);
        setResetAt(nextLocalMidnight(loadedAt));
      })
      .catch(() => setState({ status: "unavailable" }));
  }, []);

  useEffect(() => {
    load();
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    // Coming back to the tab picks up progress from other tabs and a new local day.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const expired = now != null && resetAt != null && now >= resetAt;
  useEffect(() => {
    if (expired) load();
  }, [expired, load]);

  const countdown =
    now != null && resetAt != null && !expired
      ? formatWeekCountdown(new Date(resetAt).toISOString(), new Date(now))
      : null;
  const board = state.status === "ready" ? state.board : null;
  const allDone = board ? board.quests.every((quest) => quest.done) : false;
  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <div className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff] text-[#131b2e]">
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 pt-3 pb-2.5">
          <h1 className="font-headline-md text-headline-md font-extrabold tracking-tight text-[#131b2e]">
            Nhiệm vụ
          </h1>
          <TopBarStatus />
        </div>
      </header>

      <AnimatePresence>
        {toast ? <EarnedToast key="toast" update={toast} onDone={dismissToast} /> : null}
      </AnimatePresence>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <Hero board={board} countdown={countdown} />

        {state.status === "loading" ? (
          <div className="h-72 animate-pulse rounded-[24px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
        ) : null}

        {state.status === "unavailable" ? (
          <section className="flex flex-col items-center gap-3 rounded-[24px] border-2 border-[#e5e5ea] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#e5e5ea]">
            <QuestChest open={false} size={64} />
            <p className="text-[15px] font-extrabold text-[#1d1d1f]">Chưa tải được nhiệm vụ</p>
            <p className="text-[13px] font-semibold text-[#6e6e73]">
              Kiểm tra kết nối mạng rồi thử lại nhé.
            </p>
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                load();
              }}
              className={chunkyButton("secondary", "mt-1 w-full")}
            >
              Thử lại
            </button>
          </section>
        ) : null}

        {board ? (
          <>
            <div className="flex items-end justify-between px-1">
              <h2 className="text-[18px] font-extrabold text-[#1d1d1f]">Hôm nay</h2>
              <span className="text-[13px] font-bold text-[#6e6e73]">
                +{board.earnedXp} / {board.maxXp} XP
              </span>
            </div>
            <QuestList quests={board.quests} />
            <BonusChest board={board} />
            {allDone ? null : (
              <Link href="/" className={chunkyButton("primary", "w-full")}>
                Luyện tập ngay
              </Link>
            )}
            <p className="px-2 text-center text-[12px] font-semibold text-[#86868b]">
              Nhiệm vụ mới mỗi ngày lúc 0 giờ theo giờ trên máy của bạn.
            </p>
          </>
        ) : null}
      </main>

      <BottomNav />
    </div>
  );
}
