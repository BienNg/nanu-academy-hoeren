"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ParticipantView } from "@/lib/blitzrunde-store";
import { playCelebrationSound } from "@/lib/sfx";

const PODIUM = {
  1: { height: 132, block: "bg-[#ffc800] shadow-[0_5px_0_0_#e0a800]", text: "text-[#7a4b00]", medal: "🥇", delay: 1.25 },
  2: { height: 96, block: "bg-[#dbe4ee] shadow-[0_5px_0_0_#b8c5d3]", text: "text-[#3e4850]", medal: "🥈", delay: 0.8 },
  3: { height: 72, block: "bg-[#f0b27a] shadow-[0_5px_0_0_#d4894a]", text: "text-[#6b3e12]", medal: "🥉", delay: 0.4 },
} as const;
const LIST_DELAY = 1.9;
const CONFETTI_COLORS = ["#ffc800", "#0284c7", "#e11d48", "#22c55e", "#a855f7", "#f97316"];
const CONFETTI_COUNT = 42;

/** Deterministic 0..1 per index, so the confetti layout is pure and stable across renders. */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const CONFETTI = Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
  x: (noise(index, 1) - 0.5) * 340,
  y: 180 + noise(index, 2) * 260,
  rotate: (noise(index, 3) - 0.5) * 720,
  delay: noise(index, 4) * 0.25,
  width: 6 + Math.round(noise(index, 5) * 6),
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? "#ffc800",
  round: index % 3 === 0,
}));

function initialFor(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function useCountUp(target: number, durationMs: number, skip: boolean): number {
  const [value, setValue] = useState(skip ? target : 0);
  useEffect(() => {
    if (skip) {
      const frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, skip]);
  return value;
}

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center overflow-visible" aria-hidden="true">
      {CONFETTI.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute top-10"
          style={{
            width: piece.width,
            height: piece.round ? piece.width : piece.width * 1.8,
            backgroundColor: piece.color,
            borderRadius: piece.round ? 999 : 2,
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: piece.x, y: piece.y, rotate: piece.rotate, opacity: 0, scale: 1 }}
          transition={{ duration: 1.8, delay: piece.delay, ease: [0.16, 0.84, 0.44, 1] }}
        />
      ))}
    </div>
  );
}

function PodiumColumn({
  entry,
  place,
  isYou,
  still,
}: {
  entry: ParticipantView;
  place: 1 | 2 | 3;
  isYou: boolean;
  still: boolean;
}) {
  const style = PODIUM[place];
  return (
    <div className="flex w-[31%] flex-col items-center justify-end">
      <motion.div
        className="flex flex-col items-center"
        initial={still ? false : { opacity: 0, y: 24, scale: 0.6 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18, delay: style.delay + 0.25 }}
      >
        {place === 1 ? (
          <motion.span
            className="text-[26px] leading-none"
            initial={still ? false : { rotate: -30, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 12, delay: style.delay + 0.5 }}
            aria-hidden="true"
          >
            👑
          </motion.span>
        ) : null}
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full text-[20px] font-extrabold text-white ${
            isYou ? "bg-[#0284c7] ring-4 ring-[#7dd3fc]" : "bg-[#475569]"
          }`}
        >
          {initialFor(entry.name)}
        </span>
        <span className="mt-1 max-w-full truncate px-1 text-[13px] font-extrabold text-[#131b2e]">
          {isYou ? "Bạn" : entry.name}
        </span>
        <span className="text-[12px] font-bold tabular-nums text-[#6e7881]">
          {entry.finalScore.toLocaleString("vi-VN")}
        </span>
      </motion.div>
      <motion.div
        className={`mt-2 flex w-full origin-bottom items-start justify-center rounded-t-2xl pt-2 ${style.block}`}
        style={{ height: style.height }}
        initial={still ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 20, delay: style.delay }}
      >
        <span className={`text-[28px] font-extrabold ${style.text}`}>{place}</span>
      </motion.div>
    </div>
  );
}

function RestList({ rest, youId, still }: { rest: ParticipantView[]; youId: string | null; still: boolean }) {
  return (
    <ol className="flex flex-col gap-2">
      {rest.map((entry, index) => {
        const you = entry.userId === youId;
        return (
          <motion.li
            key={entry.userId}
            initial={still ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: entry.rank == null ? 0.7 : 1, y: 0 }}
            transition={still ? { duration: 0 } : { delay: LIST_DELAY + index * 0.06 }}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
              entry.rank == null
                ? "bg-[#f1f3ff]"
                : you
                  ? "bg-[#e0f2fe] shadow-[0_3px_0_0_#7dd3fc]"
                  : "bg-white shadow-[0_3px_0_0_#e2e7ff]"
            }`}
          >
            <span className="w-8 text-center text-[16px] font-extrabold tabular-nums text-[#6e7881]">
              {entry.rank ?? "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold text-[#131b2e]">
                {entry.name}
                {you ? " (bạn)" : ""}
              </span>
              <span className="block text-[12px] font-bold text-[#6e7881]">
                {entry.rank == null
                  ? "không có kết quả"
                  : `${entry.correct}/${entry.answered} đúng${entry.completedDeck ? " · xong hết thẻ" : ""}${
                      entry.longestStreak > 1 ? ` · chuỗi ${entry.longestStreak}` : ""
                    }`}
              </span>
            </span>
            {entry.rank != null ? (
              <span className="text-[17px] font-extrabold tabular-nums text-[#131b2e]">
                {entry.finalScore.toLocaleString("vi-VN")}
              </span>
            ) : null}
          </motion.li>
        );
      })}
    </ol>
  );
}

/**
 * End-of-round screen: your score counts up, the podium rises 3rd → 2nd → 1st,
 * confetti bursts when the winner lands, then everyone else slides in.
 */
export function BlitzrundeResults({
  standings,
  youId,
  ranked,
  fallbackScore,
}: {
  standings: ParticipantView[];
  youId: string | null;
  ranked: boolean;
  fallbackScore: number;
}) {
  const still = useReducedMotion() ?? false;
  const you = youId ? standings.find((entry) => entry.userId === youId) : undefined;
  const finishers = standings.filter((entry) => entry.rank != null);
  const score = useCountUp(you?.finalScore ?? fallbackScore, 1400, still);
  const [burst, setBurst] = useState(false);

  // One entry per podium place (ties share a rank; the first listed takes the spot).
  const podium = ([1, 2, 3] as const).flatMap((place) => {
    const entry = finishers.find((candidate) => candidate.rank === place);
    return entry ? [{ place, entry }] : [];
  });
  const onPodium = new Set(podium.map((spot) => spot.entry.userId));
  const rest = standings.filter((entry) => !onPodium.has(entry.userId));
  const youPlace = you?.rank ?? null;

  useEffect(() => {
    if (podium.length === 0) return;
    const at = still ? 0 : (PODIUM[1].delay + 0.2) * 1000;
    const timer = window.setTimeout(() => {
      setBurst(true);
      if (youPlace != null && youPlace <= 3) playCelebrationSound();
    }, at);
    return () => window.clearTimeout(timer);
    // Runs once when the results first appear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headline =
    youPlace === 1
      ? "Vô địch! 🎉"
      : youPlace != null && youPlace <= 3
        ? "Lên bục rồi! 🎉"
        : youPlace != null
          ? "Hoàn thành!"
          : "Kết quả";

  return (
    <div className="relative flex flex-col gap-5 py-4">
      {burst && !still ? <Confetti /> : null}

      <motion.section
        className="rounded-[28px] bg-gradient-to-br from-[#f59e0b] to-[#fbbf24] p-5 text-center text-white shadow-[0_6px_0_0_#b45309]"
        initial={still ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 18 }}
      >
        <p className="text-[13px] font-bold uppercase tracking-wider text-amber-50">
          {ranked ? headline : "Luyện tập (không xếp hạng)"}
        </p>
        <p className="mt-2 text-[48px] font-extrabold leading-none tabular-nums">{score.toLocaleString("vi-VN")}</p>
        <p className="mt-2 text-[15px] font-extrabold">
          {youPlace != null ? `Hạng ${youPlace}/${finishers.length}` : "Chưa có kết quả"}
          {you && you.longestStreak > 1 ? ` · 🔥 chuỗi ${you.longestStreak}` : ""}
        </p>
      </motion.section>

      {podium.length > 0 ? (
        <div className="flex items-end justify-center gap-2 px-1 pt-4" aria-label="Bục trao giải">
          {([2, 1, 3] as const).map((place) => {
            const spot = podium.find((candidate) => candidate.place === place);
            return spot ? (
              <PodiumColumn
                key={place}
                entry={spot.entry}
                place={place}
                isYou={spot.entry.userId === youId}
                still={still}
              />
            ) : (
              <div key={place} className="w-[31%]" />
            );
          })}
        </div>
      ) : null}

      {rest.length > 0 ? <RestList rest={rest} youId={youId} still={still} /> : null}

      <motion.div
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={still ? { duration: 0 } : { delay: LIST_DELAY + 0.3 }}
      >
        <Link
          href="/"
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0284c7] text-[15px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-1 active:shadow-none"
        >
          Về bài học
        </Link>
      </motion.div>
    </div>
  );
}
