"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

type PartCompleteScreenProps = {
  partNumber: number;
  partCount: number;
  levelLabel: string;
  chapterLabel: string;
  questionCount: number;
  accuracy: number | null;
  elapsedMs: number | null;
  xp: number | null;
  xpKind: string | null;
  xpPending: boolean;
  streakDays: number;
  finishRun: boolean;
  failed: boolean;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Replaces the default heading, e.g. for a review session. */
  title?: string;
  /** Replaces the default part subtitle. */
  subtitle?: string;
  /** One line under the stats, e.g. how many clips come back in review. */
  note?: string | null;
};

const CONFETTI = [
  { delay: 0, duration: 1.15, x: -168, y: -36, rotate: 40, color: "#34C759", w: 10, h: 16 },
  { delay: 0.02, duration: 1.2, x: 156, y: -48, rotate: -30, color: "#ffd60a", w: 12, h: 12 },
  { delay: 0.04, duration: 1.05, x: -112, y: 28, rotate: 70, color: "#0066cc", w: 8, h: 16 },
  { delay: 0, duration: 1.25, x: 124, y: 18, rotate: -50, color: "#ff9f0a", w: 11, h: 11 },
  { delay: 0.06, duration: 1.1, x: -196, y: 8, rotate: 20, color: "#5ac8fa", w: 9, h: 14 },
  { delay: 0.03, duration: 1.2, x: 188, y: -8, rotate: -80, color: "#34C759", w: 8, h: 15 },
  { delay: 0.05, duration: 1.15, x: -64, y: -72, rotate: 55, color: "#af52de", w: 11, h: 8 },
  { delay: 0.01, duration: 1.05, x: 72, y: -78, rotate: -20, color: "#ffd60a", w: 8, h: 14 },
  { delay: 0.07, duration: 1.2, x: -140, y: -8, rotate: 90, color: "#0066cc", w: 12, h: 8 },
  { delay: 0.04, duration: 1.1, x: 210, y: 36, rotate: -60, color: "#ff9f0a", w: 9, h: 16 },
  { delay: 0.02, duration: 1.25, x: -210, y: -56, rotate: 15, color: "#34C759", w: 10, h: 10 },
  { delay: 0.08, duration: 1.15, x: 40, y: -92, rotate: 35, color: "#5ac8fa", w: 8, h: 13 },
  { delay: 0.03, duration: 1.05, x: -36, y: 48, rotate: -45, color: "#ffd60a", w: 13, h: 8 },
  { delay: 0.06, duration: 1.2, x: 96, y: 52, rotate: 25, color: "#af52de", w: 10, h: 10 },
  { delay: 0.01, duration: 1.1, x: -88, y: 56, rotate: -15, color: "#0066cc", w: 7, h: 14 },
  { delay: 0.09, duration: 1.15, x: 168, y: -72, rotate: 50, color: "#34C759", w: 10, h: 14 },
] as const;

function formatPartDuration(elapsedMs: number | null): string {
  if (elapsedMs == null) return "—";
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function subtitleFor(
  failed: boolean,
  finishRun: boolean,
  partNumber: number,
  partCount: number,
): string {
  if (failed) return "Phần này bắt đầu lại từ đầu.";
  if (finishRun) {
    return partCount > 1
      ? `Bạn đã xong cả ${partCount} phần.`
      : "Bạn đã xong bài nghe này.";
  }
  return `Phần ${partNumber} / ${partCount}`;
}

function xpCaption(xp: number | null, kind: string | null): { value: string; note: string | null } {
  if (kind === "rejected") {
    return {
      value: "+0 XP",
      note: "Lần này chưa cộng điểm. Làm lại phần để nhận XP.",
    };
  }
  if (kind === "repeat") {
    return { value: "+0 XP", note: "Phần này đã được tính hôm nay" };
  }
  if (kind === "capped") {
    return { value: "+0 XP", note: "Đã đủ 3 lượt ôn tập có XP hôm nay" };
  }
  if (kind === "review" && (xp ?? 0) === 0) {
    return { value: "+0 XP", note: "Đã đủ 30 XP ôn tập hôm nay" };
  }
  return {
    value: `+${xp ?? 0} XP`,
    note: kind === "review" ? "Ôn tập" : null,
  };
}

export function PartCompleteScreen({
  partNumber,
  partCount,
  levelLabel,
  chapterLabel,
  questionCount,
  accuracy,
  elapsedMs,
  xp,
  xpKind,
  xpPending,
  streakDays,
  finishRun,
  failed,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
  title,
  subtitle,
  note,
}: PartCompleteScreenProps) {
  const reduceMotion = useReducedMotion();
  const continueRef = useRef<HTMLButtonElement>(null);
  const perfect = accuracy != null && accuracy >= 100;
  const earned = !failed && (xpPending || xpKind) ? xpCaption(xp, xpKind) : null;
  const stats = [
    { label: "Câu", value: String(questionCount), color: "#0066cc" },
    { label: "Chính xác", value: accuracy == null ? "—" : `${accuracy}%`, color: perfect ? "#34C759" : "#ff9f0a" },
    { label: "Thời gian", value: formatPartDuration(elapsedMs), color: "#5e5ce6" },
  ];

  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  useEffect(() => {
    const armedAt = Date.now() + 400;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      if (Date.now() < armedAt) return;
      event.preventDefault();
      onContinue();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onContinue]);

  return (
    <main className="relative flex w-full flex-1 flex-col items-center overflow-hidden">
      {reduceMotion || failed ? null : (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {CONFETTI.map((piece, index) => (
            <motion.span
              key={`confetti-${index}`}
              className="absolute left-1/2 top-[22%] block"
              style={{
                width: piece.w,
                height: piece.h,
                borderRadius: piece.w === piece.h ? 999 : 2,
                backgroundColor: piece.color,
              }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{
                x: piece.x,
                y: piece.y,
                rotate: piece.rotate,
                scale: 1,
                opacity: 1,
              }}
              transition={{
                duration: piece.duration,
                delay: piece.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-28 pt-8 text-center">
        <motion.div
          className="relative mb-6 flex h-36 w-36 items-center justify-center"
          initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 14 }
          }
        >
          <motion.div
            className={`absolute inset-2 rounded-full ${failed ? "bg-[#ff3b30]/15" : "bg-[#ffd60a]/25"}`}
            animate={reduceMotion || failed ? undefined : { scale: [1, 1.12, 1] }}
            transition={
              reduceMotion || failed
                ? undefined
                : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            }
          />
          <motion.div
            className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white ${
              failed
                ? "bg-gradient-to-br from-[#ff6b64] to-[#ff3b30] shadow-[0_12px_40px_rgba(255,59,48,0.35)]"
                : "bg-gradient-to-br from-[#ffd60a] to-[#ff9f0a] shadow-[0_12px_40px_rgba(255,159,10,0.45)]"
            }`}
            animate={reduceMotion || failed ? undefined : { y: [0, -8, 0] }}
            transition={
              reduceMotion || failed
                ? undefined
                : { delay: 0.35, duration: 0.55, repeat: 2, ease: "easeInOut" }
            }
          >
            <span
              className="material-symbols-outlined text-[52px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              {failed ? "heart_broken" : "emoji_events"}
            </span>
          </motion.div>
        </motion.div>

        <motion.p
          className="text-[13px] font-semibold uppercase tracking-wider text-[#86868b]"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.25 }}
        >
          {levelLabel} · {chapterLabel}
        </motion.p>
        <motion.h2
          className="mt-2 text-[34px] font-bold tracking-tight text-[#1d1d1f] sm:text-[40px]"
          style={{ letterSpacing: "-0.03em" }}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.18, duration: 0.3 }}
        >
          {title ?? (failed ? "Hết tim" : finishRun ? "Bài học hoàn thành!" : "Phần hoàn thành!")}
        </motion.h2>
        <motion.p
          className="mt-2 text-[17px] font-medium text-[#86868b]"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.24, duration: 0.25 }}
        >
          {subtitle ?? subtitleFor(failed, finishRun, partNumber, partCount)}
        </motion.p>

        {earned ? (
          <motion.div
            className="mt-5 flex flex-col items-center gap-1"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 16, delay: 0.2 }}
          >
            <span className="inline-flex items-center gap-1 text-[28px] font-extrabold leading-none text-[#f59e0b]">
              <span
                className="material-symbols-outlined text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                bolt
              </span>
              {xpPending ? "Đang cộng XP…" : earned.value}
            </span>
            {!xpPending && earned.note ? (
              <span className="text-[13px] font-semibold text-[#86868b]">{earned.note}</span>
            ) : null}
          </motion.div>
        ) : null}

        <div className="mt-8 grid w-full grid-cols-3 gap-3">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center gap-1 rounded-[20px] border border-black/[0.04] bg-white px-2 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 380, damping: 24, delay: 0.28 + index * 0.08 }
              }
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
                {stat.label}
              </span>
              <span
                className="text-[26px] font-bold leading-none tracking-tight"
                style={{ color: stat.color }}
              >
                {stat.value}
              </span>
            </motion.div>
          ))}
        </div>

        {note ? (
          <p className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#7c3aed]">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              replay
            </span>
            {note}
          </p>
        ) : null}

        {perfect && !failed ? (
          <motion.div
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#34C759]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#34C759]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.5 }}
          >
            <span
              className="material-symbols-outlined text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              verified
            </span>
            Hoàn hảo
          </motion.div>
        ) : null}

        {streakDays > 0 ? (
          <motion.div
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#1d1d1f] shadow-sm"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.55 }}
          >
            <span
              className="material-symbols-outlined text-[18px] text-[#ff9500]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              local_fire_department
            </span>
            Chuỗi {streakDays} ngày
          </motion.div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#fbfbfd] via-[#fbfbfd]/95 to-transparent pb-safe">
        <div className="mx-auto w-full max-w-md px-6 pb-6 pt-8">
          <motion.button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98]"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.4, duration: 0.25 }}
          >
            {continueLabel}
          </motion.button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="mt-3 flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#f5f5f7] text-[17px] font-semibold text-[#1d1d1f] transition-all hover:bg-[#e8e8ed] active:scale-[0.98]"
            >
              <span
                className="material-symbols-outlined text-[20px]"
                aria-hidden="true"
              >
                replay
              </span>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
