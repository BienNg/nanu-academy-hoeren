"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function TodayXpChip() {
  const [xp, setXp] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/xp")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { today?: unknown } | null) => {
        if (cancelled || !data || typeof data.today !== "number") return;
        setXp(data.today);
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
      title="XP hôm nay"
      aria-label={xp == null ? "XP hôm nay" : `XP hôm nay, ${xp}`}
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
