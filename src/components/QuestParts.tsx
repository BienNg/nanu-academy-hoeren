"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { QuestKind, QuestProgress } from "@/lib/quests";

export const KIND_STYLE: Record<QuestKind, { icon: string; face: string; lip: string; unit: string }> = {
  listening: { icon: "headphones", face: "#0071E3", lip: "#0A4FA0", unit: "" },
  study: { icon: "menu_book", face: "#34C759", lip: "#248a3d", unit: "" },
  habit: { icon: "bolt", face: "#FF9500", lip: "#c26e00", unit: " XP" },
};

/** A number that counts from `from` to `to`. Jumps straight to `to` with reduced motion. */
export function CountUp({
  from,
  to,
  delay = 0,
  duration = 0.9,
}: {
  from: number;
  to: number;
  delay?: number;
  duration?: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(from, to, {
      delay,
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [from, to, delay, duration, reduceMotion]);

  return <>{reduceMotion ? to : value}</>;
}

/** Wooden chest. It springs open once the quest it guards is done. */
export function QuestChest({ open, size = 44 }: { open: boolean; size?: number }) {
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

export function KindTile({ kind, done }: { kind: QuestKind; done: boolean }) {
  const style = KIND_STYLE[kind];
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-300"
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

/**
 * Fills to the quest's progress. With `from`, the bar starts at that progress
 * instead of empty, so only the step a run just added moves.
 */
export function QuestProgressBar({
  quest,
  delay,
  from,
}: {
  quest: QuestProgress;
  delay: number;
  from?: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const percentOf = (value: number) => Math.min(100, Math.round((value / quest.target) * 100));
  const percent = percentOf(quest.progress);
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
        className="absolute inset-y-0 left-0 rounded-full transition-colors duration-300"
        style={{ backgroundColor: quest.done ? "#34C759" : "#FFC800" }}
        initial={reduceMotion ? false : { width: `${percentOf(from ?? 0)}%` }}
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
        {from == null ? quest.progress : <CountUp from={from} to={quest.progress} delay={delay} duration={0.8} />}
        {" / "}
        {quest.target}
        {unit}
      </span>
    </div>
  );
}
