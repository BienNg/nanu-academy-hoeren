"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RatingPingu } from "@/components/session/Pingu";
import { FOCUS_RING } from "@/lib/keyboard";
import { otherOverlayOpen, overlaySnapshot, setOverlayOpen, subscribeOverlays } from "@/lib/overlay-gate";
import { readStreakCelebration, subscribeStreakCelebration } from "@/lib/useProgress";
import type { PendingRating } from "@/lib/session-rating-store";
import { RatingSheet, type RatingSheetExit } from "./RatingSheet";

type Phase = "sheet" | "card" | "gone";

const RATING_OVERLAY = "session-rating";

/** The sheet opens once per session per device; after that Home shows only the card. */
function seenKey(pending: PendingRating): string {
  return `nr-rating-seen:${pending.classKey}|${pending.day}`;
}

function readSeen(pending: PendingRating): boolean {
  try {
    return window.localStorage.getItem(seenKey(pending)) === "1";
  } catch {
    return false;
  }
}

function markSeen(pending: PendingRating): void {
  try {
    window.localStorage.setItem(seenKey(pending), "1");
  } catch {
    // Private mode: the sheet may open again next visit.
  }
}

function hoursLeft(closesAt: string): number {
  return Math.max(1, Math.ceil((Date.parse(closesAt) - Date.now()) / 3_600_000));
}

/**
 * Session rating on Home: the sheet on the first visit after a class session,
 * then the reminder card (S4) until the window closes. Sending or "Để sau"
 * removes both. `blocked` holds the sheet back while the onboarding tour runs.
 * Client only (Home loads it with `ssr: false`), so it reads localStorage while
 * rendering. Give it a `key` per session.
 */
export default function SessionRatingPrompt({ pending, blocked }: { pending: PendingRating; blocked: boolean }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => {
    if (Date.parse(pending.closesAt) <= Date.now()) return "gone";
    return readSeen(pending) ? "card" : "sheet";
  });

  useEffect(() => {
    const left = Date.parse(pending.closesAt) - Date.now();
    if (left <= 0) return;
    const timer = window.setTimeout(() => setPhase("gone"), left);
    return () => window.clearTimeout(timer);
  }, [pending.closesAt]);

  // Wait for the tour, the daily quest intro, or the streak flame to finish first.
  useSyncExternalStore(subscribeOverlays, overlaySnapshot, () => "");
  const streak = useSyncExternalStore(subscribeStreakCelebration, readStreakCelebration, () => null);
  const showSheet = phase === "sheet" && !blocked && !streak && !otherOverlayOpen(RATING_OVERLAY);

  useEffect(() => {
    setOverlayOpen(RATING_OVERLAY, showSheet);
    if (showSheet) markSeen(pending);
    return () => setOverlayOpen(RATING_OVERLAY, false);
  }, [showSheet, pending]);

  function handleExit(exit: RatingSheetExit) {
    setPhase(exit === "done" ? "gone" : "card");
  }

  if (phase === "card") {
    return (
      <motion.section
        aria-label="Đánh giá buổi học"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5 rounded-[20px] border-2 border-[#e5e5ea] bg-white py-3 pr-3 pl-2 shadow-[0_3px_0_#e5e5ea]"
      >
        <RatingPingu mood={0} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-5 text-[#1b1b1d]">Đánh giá buổi học Lektion {pending.lektion}</p>
          <p className="mt-0.5 font-[family-name:var(--font-be-vietnam-pro)] text-[13px] text-[#5e5e63]">
            Chỉ mất 10 giây · còn {hoursLeft(pending.closesAt)} giờ
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase("sheet")}
          className={`h-11 shrink-0 rounded-xl bg-[#0066cc] px-3.5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_3px_0_#004c99] active:translate-y-[3px] active:shadow-none ${FOCUS_RING}`}
        >
          Đánh giá
        </button>
      </motion.section>
    );
  }

  if (showSheet) return <RatingSheet pending={pending} onExit={handleExit} />;
  return null;
}
