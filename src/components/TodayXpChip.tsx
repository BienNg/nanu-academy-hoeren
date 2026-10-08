"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useProgress } from "@/lib/useProgress";

export function TodayXpChip({
  total: totalProp,
  gain = 0,
}: {
  /** When set, the chip shows this total instead of fetching. */
  total?: number | null;
  /** Newly awarded points. The chip counts from `total` up to `total + gain`. */
  gain?: number;
} = {}) {
  const [fetched, setFetched] = useState<number | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const [popping, setPopping] = useState(false);
  const reduceMotion = useReducedMotion();
  const controlled = totalProp !== undefined;
  const base = controlled ? totalProp : fetched;
  const earned = Math.max(0, gain);
  const end = base == null ? null : base + earned;

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    void fetch("/api/xp")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: unknown } | null) => {
        if (cancelled || !data || typeof data.total !== "number") return;
        setFetched(data.total);
      })
      .catch(() => {
        // The streak chip still shows. XP appears after the next visit.
      });
    return () => {
      cancelled = true;
    };
  }, [controlled]);

  useEffect(() => {
    if (base == null || end == null) return;
    if (earned <= 0 || reduceMotion) {
      setDisplay(end);
      setPopping(false);
      return;
    }

    setDisplay(base);
    setPopping(true);
    const startAt = performance.now() + 450;
    const duration = 800;
    let frame = 0;
    const tick = (now: number) => {
      if (now < startAt) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(1, (now - startAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(base + (end - base) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const hide = window.setTimeout(() => setPopping(false), 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(hide);
    };
  }, [base, earned, end, reduceMotion]);

  const shown = display ?? base;

  return (
    <Link
      href="/leaderboard"
      title="Tổng XP"
      aria-label={shown == null ? "Tổng XP" : `Tổng XP, ${end ?? shown}`}
      className="relative flex items-center gap-0.5 rounded-full border border-black/[0.05] bg-white px-2 py-1 text-[#1d1d1f] shadow-sm"
    >
      {popping && earned > 0 ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-0.5 -translate-x-1/2">
          <motion.span
            className="block text-[12px] font-extrabold text-[#f59e0b]"
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -10, scale: 1 }}
            transition={{ duration: 1.05, times: [0, 0.18, 0.55, 1], delay: 0.15 }}
            aria-hidden="true"
          >
            +{earned}
          </motion.span>
        </span>
      ) : null}
      <motion.span
        className="flex items-center gap-0.5"
        animate={popping && !reduceMotion ? { scale: [1, 1.14, 1] } : { scale: 1 }}
        transition={{ duration: 0.55, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <span
          className="material-symbols-outlined text-[16px] text-[#f59e0b]"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          bolt
        </span>
        <span
          className="text-[13px] font-semibold tabular-nums"
          style={end == null ? undefined : { minWidth: `${String(end).length}ch` }}
        >
          {shown ?? "–"}
        </span>
      </motion.span>
    </Link>
  );
}

export function StreakChip() {
  const { streakDays } = useProgress();

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-black/[0.05] bg-white px-2.5 py-1 shadow-sm"
      aria-label={`Chuỗi ${streakDays} ngày`}
    >
      <span
        className="material-symbols-outlined text-[16px] text-[#ff9500]"
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        local_fire_department
      </span>
      <span className="text-[13px] font-semibold text-[#1d1d1f]">{streakDays} ngày</span>
    </div>
  );
}

/** Streak and total XP — the controls on the home top bar. Profile lives in the bottom nav. */
export function TopBarStatus() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <StreakChip />
      <TodayXpChip />
    </div>
  );
}
