"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileButton } from "@/components/ProfileButton";
import { useProgress } from "@/lib/useProgress";

export function TodayXpChip() {
  const [xp, setXp] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/xp")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: unknown } | null) => {
        if (cancelled || !data || typeof data.total !== "number") return;
        setXp(data.total);
      })
      .catch(() => {
        // The streak chip still shows. XP appears after the next visit.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/leaderboard"
      title="Tổng XP"
      aria-label={xp == null ? "Tổng XP" : `Tổng XP, ${xp}`}
      className="flex items-center gap-0.5 rounded-full border border-black/[0.05] bg-white px-2 py-1 text-[#1d1d1f] shadow-sm"
    >
      <span
        className="material-symbols-outlined text-[16px] text-[#f59e0b]"
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        bolt
      </span>
      <span className="text-[13px] font-semibold tabular-nums">{xp ?? "–"}</span>
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

/** Streak, total XP, and profile — the controls on the home top bar. */
export function TopBarStatus() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <StreakChip />
      <TodayXpChip />
      <ProfileButton />
    </div>
  );
}
