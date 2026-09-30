"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLITZRUNDE_ICON } from "@/lib/blitzrunde";
import type { LiveRound } from "@/lib/blitzrunde-store";

const POLL_MS = 5000;

function readLive(data: unknown): LiveRound | null {
  if (!data || typeof data !== "object") return null;
  const live = (data as { live?: unknown }).live;
  if (!live || typeof live !== "object") return null;
  const row = live as Partial<LiveRound>;
  if (typeof row.id !== "string" || (row.status !== "lobby" && row.status !== "active")) return null;
  return row as LiveRound;
}

/** Polls for an open round in the viewer's class while the page is visible. */
function useLiveRound(): LiveRound | null {
  const [live, setLive] = useState<LiveRound | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/blitzrunde", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          if (!cancelled) setLive(readLive(data));
        })
        .catch(() => {
          // Keep the last answer; the next poll retries.
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return live;
}

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={{ fontVariationSettings: "'FILL' 1" }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

export function BlitzrundeBanner() {
  const live = useLiveRound();
  if (!live || live.submitted) return null;
  // Late arrivals cannot join a running round, so only show it to those already in.
  if (live.status === "active" && !live.joined) return null;

  const cta = live.status === "active" ? "Vào chơi tiếp" : live.joined ? "Vào phòng chờ" : "Tham gia";
  const line =
    live.status === "active"
      ? "Vòng đang chạy — quay lại ngay!"
      : live.joined
        ? "Bạn đã vào phòng. Chờ giáo viên bắt đầu."
        : "Giáo viên vừa mở một vòng cho lớp bạn.";

  return (
    <Link
      href={`/blitzrunde/${live.id}`}
      className="group flex items-center gap-4 overflow-hidden rounded-2xl border-2 border-[#f59e0b] bg-[#fffbeb] px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b]"
    >
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f59e0b] text-white shadow-[0_4px_0_0_#b45309]">
        <MaterialIcon name={BLITZRUNDE_ICON} className="text-[30px]" />
        <span className="absolute -top-1 -right-1 h-3 w-3 animate-ping rounded-full bg-[#e11d48] motion-reduce:animate-none" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#e11d48]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#b45309]">
          Blitzrunde · {live.classLabel}
        </span>
        <span className="mt-0.5 block text-[18px] font-extrabold leading-tight text-[#131b2e]">
          {live.levelLabel} {live.lektionLabel}
        </span>
        <span className="mt-0.5 block text-[13px] font-bold leading-snug text-[#6e7881]">{line}</span>
      </span>
      <span className="shrink-0 rounded-2xl bg-[#f59e0b] px-4 py-3 text-[14px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_0_0_#b45309] transition-all group-hover:bg-[#fbbf24] group-active:translate-y-1 group-active:shadow-none">
        {cta}
      </span>
    </Link>
  );
}
