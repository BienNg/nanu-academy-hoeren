"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { PersonAvatar, RankBadge } from "@/components/LeaderboardParts";
import { ChillPingu, PATH_POSES, Pingu, type PathPose } from "@/components/session/Pingu";
import { chunkyButton } from "@/components/chunkyButton";
import { CountUp, KindTile, QuestChest, QuestProgressBar } from "@/components/QuestParts";
import { Flame, StreakCount } from "@/components/StreakCelebration";
import { isCardEnter } from "@/lib/keyboard";
import { questStepMoved, type QuestStep, type QuestUpdate } from "@/lib/quests";
import {
  classmateDoneCaption,
  classmateJoinCaption,
  finishedAgoLabel,
  readClassmateFinish,
  type ClassmateFinish,
  type LessonFinishSide,
} from "@/lib/progress";
import { planClassRankClimb, planRankClimb, type ClassRankClimb, type RankClimb } from "@/lib/rank-climb";
import {
  canAskForStreakReminder,
  dismissStreakReminderPrompt,
  enableStreakReminders,
} from "@/lib/push-client";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";
import {
  readQueuedStreakCelebration,
  subscribeStreakCelebration,
  takeStreakCelebration,
  type StreakCelebration,
} from "@/lib/useProgress";
import { googleProfileImage, type LeaderboardPayload } from "@/lib/xp";

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
  /** All-time XP with this part counted, from the same request as `xp`. */
  totalXp?: number | null;
  /** Quests this part moved or finished, when the server reports any. */
  questUpdate?: QuestUpdate | null;
  streakDays: number;
  /** True when a streak step this run raised should show after the classmates step. */
  celebrateStreak?: boolean;
  finishRun: boolean;
  failed: boolean;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Replaces the heading, e.g. for a jump test. */
  title?: string;
  /** Replaces the line under the heading. */
  subtitle?: string;
  /** Replaces the note under a +0 XP result. */
  xpNote?: string;
  /**
   * Skip the live class board and the classes ranking. The admin sequence
   * previews do this so they can show a sample climb instead.
   */
  skipBoard?: boolean;
  /** Sample classmates for an admin sequence. Shown without reading the class. */
  classmatePreview?: ClassmateFinish;
  /** Progress key of this Lektion. With `finishSide`, loads classmates who have finished it. */
  lessonKey?: string;
  finishSide?: LessonFinishSide;
  /** You have finished `finishSide` of this Lektion, by the same stamp classmates are counted on. */
  sideFinished?: boolean;
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

/** The loader stays at least this long, so it never just flickers. */
const LOADER_MIN_MS = 700;
/** After this the completed screen shows even if the server has not answered. */
const LOADER_MAX_MS = 10_000;

/** Focuses the continue button and lets Enter press it once the screen settles. */
function useContinueShortcut(onContinue: () => void) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const armedAt = Date.now() + 400;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCardEnter(event) || Date.now() < armedAt) return;
      event.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onContinue]);

  return continueRef;
}

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
      : "Bạn đã xong bài này.";
  }
  return `Phần ${partNumber} / ${partCount}`;
}

function xpCaption(
  xp: number | null,
  kind: string | null,
): { value: string; amount: number; note: string | null } {
  if (kind === "rejected") {
    return {
      value: "+0 XP",
      amount: 0,
      note: "Lần này chưa cộng điểm. Làm lại phần để nhận XP.",
    };
  }
  if (kind === "repeat") {
    return { value: "+0 XP", amount: 0, note: "Phần này đã được tính hôm nay" };
  }
  if (kind === "review" && (xp ?? 0) === 0) {
    return { value: "+0 XP", amount: 0, note: "Đã đủ 30 XP ôn tập hôm nay" };
  }
  return {
    value: `+${xp ?? 0} XP`,
    amount: xp ?? 0,
    note: kind === "review" ? "Ôn tập" : null,
  };
}

type CompleteViewProps = Omit<PartCompleteScreenProps, "questUpdate" | "celebrateStreak" | "totalXp"> & {
  /** Shown only when no quest screen follows. */
  questUpdate: QuestUpdate | null;
  /** The learner's total XP before and after this part. Null when unknown. */
  totalXp: { from: number; to: number } | null;
};

const XP_COUNT_DURATION = 0.8;
const TOTAL_COUNT_DURATION = 0.8;
const STAT_GAP = 0.15;

/**
 * Start times, in seconds, for the completed screen. Each block waits for the
 * one above it, and blocks that are not shown leave no gap.
 */
function completeBeats(shown: {
  earned: boolean;
  countsXp: boolean;
  stats: number;
  perfect: boolean;
  streak: boolean;
  total: boolean;
}) {
  // Pingu rises first and his bubble lands around 0.6s.
  let cursor = 0.55;
  const next = (gap: number) => {
    const start = cursor;
    cursor += gap;
    return start;
  };
  const label = next(0.15);
  const title = next(0.15);
  const subtitle = next(0.3);
  const xp = shown.earned ? next(shown.countsXp ? 0.2 + XP_COUNT_DURATION + 0.2 : 0.35) : cursor;
  const xpCount = xp + 0.2;
  const stats = next(shown.stats * STAT_GAP + 0.2);
  const perfect = shown.perfect ? next(0.3) : cursor;
  const streak = shown.streak ? next(0.3) : cursor;
  const total = shown.total ? next(0.3 + TOTAL_COUNT_DURATION + 0.3) : cursor;
  const totalCount = total + 0.3;
  return {
    label,
    title,
    subtitle,
    xp,
    xpCount,
    stats,
    perfect,
    streak,
    total,
    totalCount,
    button: cursor,
  };
}

function CompleteView({
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
  questUpdate,
  streakDays,
  finishRun,
  failed,
  totalXp,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
  title,
  subtitle,
  xpNote,
}: CompleteViewProps) {
  const reduceMotion = useReducedMotion();
  const continueRef = useContinueShortcut(onContinue);
  const soundPlayedRef = useRef(false);
  const perfect = accuracy != null && accuracy >= 100;
  const caption = xpCaption(xp, xpKind);
  const earned =
    !failed && (xpPending || xpKind)
      ? { ...caption, note: xpNote && caption.amount === 0 ? xpNote : caption.note }
      : null;
  const stats = [
    { label: "Câu", value: String(questionCount), color: "#0066cc" },
    { label: "Chính xác", value: accuracy == null ? "—" : `${accuracy}%`, color: perfect ? "#34C759" : "#ff9f0a" },
    { label: "Thời gian", value: formatPartDuration(elapsedMs), color: "#5e5ce6" },
  ];
  const showPerfect = perfect && !failed;
  const showTotal = totalXp != null && !failed;
  const beats = completeBeats({
    earned: earned != null,
    countsXp: earned != null && !xpPending && earned.amount > 0,
    stats: stats.length,
    perfect: showPerfect,
    streak: streakDays > 0,
    total: showTotal,
  });
  const at = (seconds: number) => (reduceMotion ? 0 : seconds);

  useEffect(() => {
    if (failed || soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    playCelebrationSound();
  }, [failed]);

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
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

      <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+3.5rem)]">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6 py-4 text-center">
        <Pingu mood={failed ? "oops" : "cheering"} />

        <motion.p
          className="text-[13px] font-semibold uppercase tracking-wider text-[#86868b]"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(beats.label), duration: 0.25 }}
        >
          {levelLabel} · {chapterLabel}
        </motion.p>
        <motion.h2
          className="mt-2 text-[34px] font-bold tracking-tight text-[#1d1d1f] sm:text-[40px]"
          style={{ letterSpacing: "-0.03em" }}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(beats.title), duration: 0.3 }}
        >
          {title ?? (failed ? "Hết tim" : finishRun ? "Bài học hoàn thành!" : "Phần hoàn thành!")}
        </motion.h2>
        <motion.p
          className="mt-2 text-[17px] font-medium text-[#86868b]"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: at(beats.subtitle), duration: 0.25 }}
        >
          {subtitle ?? subtitleFor(failed, finishRun, partNumber, partCount)}
        </motion.p>

        {earned ? (
          <motion.div
            className="mt-3 flex flex-col items-center gap-1"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 16, delay: beats.xp }}
          >
            <span className="inline-flex items-center gap-1 text-[28px] font-extrabold leading-none text-[#f59e0b]">
              <span
                className="material-symbols-outlined text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                bolt
              </span>
              {xpPending ? (
                "Đang cộng XP…"
              ) : earned.amount > 0 ? (
                <>
                  +<CountUp from={0} to={earned.amount} delay={beats.xpCount} duration={XP_COUNT_DURATION} />
                  {" XP"}
                </>
              ) : (
                earned.value
              )}
            </span>
            {!xpPending && earned.note ? (
              <span className="text-[13px] font-semibold text-[#86868b]">{earned.note}</span>
            ) : null}
            {!xpPending && questUpdate && (questUpdate.completed.length > 0 || questUpdate.bonus) ? (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e9f9ee] px-3 py-1 text-[13px] font-bold text-[#1f8a3b]">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  flag
                </span>
                {questUpdate.bonus
                  ? "Xong cả 3 nhiệm vụ"
                  : questUpdate.completed.length === 1
                    ? "Xong 1 nhiệm vụ"
                    : `Xong ${questUpdate.completed.length} nhiệm vụ`}
                {questUpdate.xp > 0 ? ` · +${questUpdate.xp} XP` : ""}
              </span>
            ) : null}
          </motion.div>
        ) : null}

        <div className="mt-5 grid w-full grid-cols-3 gap-3">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center gap-1 rounded-[20px] border border-black/[0.04] bg-white px-2 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 380, damping: 24, delay: beats.stats + index * STAT_GAP }
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

        {showPerfect ? (
          <motion.div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#34C759]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#34C759]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: at(beats.perfect) }}
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
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#1d1d1f] shadow-sm"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: at(beats.streak) }}
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

        {totalXp && showTotal ? (
          <motion.div
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-black/[0.05] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#1d1d1f] shadow-sm"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: at(beats.total) }}
            aria-label={`Tổng ${totalXp.to} XP`}
          >
            <span
              className="material-symbols-outlined text-[18px] text-[#f59e0b]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              bolt
            </span>
            <motion.span
              className="tabular-nums"
              style={{ minWidth: `${String(totalXp.to).length}ch` }}
              initial={false}
              animate={
                reduceMotion || totalXp.to === totalXp.from ? { scale: 1 } : { scale: [1, 1.18, 1] }
              }
              transition={{ duration: 0.4, delay: beats.totalCount + TOTAL_COUNT_DURATION }}
            >
              <CountUp
                from={totalXp.from}
                to={totalXp.to}
                delay={beats.totalCount}
                duration={TOTAL_COUNT_DURATION}
              />
            </motion.span>
            XP
          </motion.div>
        ) : null}

      </div>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
          <motion.button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className={chunkyButton("primary", "w-full")}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: at(beats.button), duration: 0.25 }}
          >
            {continueLabel}
          </motion.button>
          <SecondaryButton label={secondaryLabel} onClick={onSecondary} delay={at(beats.button)} />
      </div>
    </main>
  );
}

/** Shown the moment a part ends, while the server works out the XP. */
function XpLoader({ label = "Đang tính XP" }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  const [pose] = useState<PathPose>(
    () => PATH_POSES[Math.floor(Math.random() * PATH_POSES.length)] ?? "tea",
  );

  return (
    <main
      className="fixed inset-0 z-10 flex flex-col items-center justify-center bg-[#fbfbfd] px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <motion.div
        className="flex h-[170px] items-end justify-center"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22 }}
      >
        <div className="origin-bottom scale-[1.9]" aria-hidden="true">
          <ChillPingu pose={pose} />
        </div>
      </motion.div>
      <p className="mt-6 text-[17px] font-bold text-[#1d1d1f]">{label}</p>
      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]"
            animate={reduceMotion ? undefined : { y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </main>
  );
}

/** Seconds into the quest screen when the first moving bar starts to fill. */
const QUEST_FILL_START = 0.45;
const QUEST_FILL_GAP = 0.35;
const QUEST_FILL_DURATION = 0.8;

function QuestStepRow({
  step,
  index,
  fillDelay,
}: {
  step: QuestStep;
  index: number;
  /** Null when this quest did not move. */
  fillDelay: number | null;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const moved = fillDelay != null;
  const finishesNow = moved && step.done && step.before < step.target;
  const [filled, setFilled] = useState(!moved || reduceMotion);

  useEffect(() => {
    if (filled || fillDelay == null) return;
    const timer = window.setTimeout(
      () => setFilled(true),
      (fillDelay + QUEST_FILL_DURATION) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [filled, fillDelay]);

  const done = step.done && (filled || !finishesNow);
  const shown = { ...step, done };

  return (
    <motion.li
      className={`relative flex items-center gap-3 px-4 py-4 ${index > 0 ? "border-t-2 border-[#f2f2f7]" : ""} ${
        moved ? "bg-[#fffbeb]" : ""
      }`}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18, delay: 0.08 * index }}
    >
      <motion.div
        initial={false}
        animate={finishesNow && filled && !reduceMotion ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <KindTile kind={step.kind} done={done} />
      </motion.div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-[15px] leading-5 font-extrabold ${
              done && !finishesNow ? "text-[#86868b]" : "text-[#1d1d1f]"
            }`}
          >
            {step.title}
          </p>
          {finishesNow && filled ? (
            <motion.span
              className="mt-px inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#34C759] px-2 py-0.5 text-[12px] font-extrabold text-white"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.5, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 16 }}
            >
              +{step.xp} XP
            </motion.span>
          ) : (
            <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold text-[#f59e0b]">
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                bolt
              </span>
              {step.xp}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <QuestProgressBar
            quest={shown}
            delay={fillDelay ?? 0}
            from={moved ? step.before : undefined}
          />
          <QuestChest open={done} size={36} />
        </div>
      </div>
    </motion.li>
  );
}

/** Seconds between the beats of the XP hand-off on the quest screen. */
const XP_SHOW_GAP = 0.25;
const XP_SLIDE_AFTER = 0.7;
const XP_TOTAL_AFTER = 0.45;
const XP_TRANSFER_AFTER = 0.5;
const XP_TRANSFER_DURATION = 0.9;

type XpBeat = "hidden" | "gained" | "slid" | "total" | "transfer" | "settled";

/**
 * The quest XP pops in, slides left, the learner's total joins it, then the
 * gained XP drains into the total.
 */
function QuestXpTransfer({
  gained,
  totalAfter,
  startAt,
}: {
  gained: number;
  totalAfter: number | null;
  startAt: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const hasTotal = totalAfter != null;
  const [beat, setBeat] = useState<XpBeat>(
    reduceMotion ? (hasTotal ? "settled" : "gained") : "hidden",
  );

  useEffect(() => {
    if (reduceMotion) return;
    const beats: [XpBeat, number][] = [["gained", startAt + XP_SHOW_GAP]];
    if (hasTotal) {
      let at = startAt + XP_SHOW_GAP + XP_SLIDE_AFTER;
      beats.push(["slid", at]);
      at += XP_TOTAL_AFTER;
      beats.push(["total", at]);
      at += XP_TRANSFER_AFTER;
      beats.push(["transfer", at]);
      at += XP_TRANSFER_DURATION + 0.35;
      beats.push(["settled", at]);
    }
    const timers = beats.map(([next, at]) => window.setTimeout(() => setBeat(next), at * 1000));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion, hasTotal, startAt]);

  if (beat === "hidden") return <div className="mt-6 h-16" aria-hidden="true" />;

  const totalShown = beat === "total" || beat === "transfer" || beat === "settled";
  const draining = beat === "transfer" || beat === "settled";
  const totalBefore = (totalAfter ?? 0) - gained;
  const spring = { type: "spring" as const, stiffness: 380, damping: 24 };

  return (
    <div
      className="mt-6 flex h-16 w-full items-center justify-center gap-4"
      aria-label={hasTotal ? `+${gained} XP, tổng ${totalAfter} XP` : `+${gained} XP`}
    >
      {beat !== "settled" ? (
        <motion.span
          layout
          className={`inline-flex items-center gap-1 text-[30px] leading-none font-extrabold text-[#f59e0b] tabular-nums ${
            beat === "gained" ? "" : "mr-auto"
          }`}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.5, y: 10 }}
          animate={{ opacity: draining ? 0.55 : 1, scale: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : spring}
          aria-hidden="true"
        >
          <span
            className="material-symbols-outlined text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
          +{draining ? <CountUp from={gained} to={0} duration={XP_TRANSFER_DURATION} /> : gained}
        </motion.span>
      ) : null}
      {totalShown ? (
        <motion.span
          layout
          className="inline-flex items-center gap-2 rounded-full border border-black/[0.05] bg-white px-4 py-2 shadow-sm"
          initial={reduceMotion ? false : { opacity: 0, x: 24, scale: 0.85 }}
          animate={
            beat === "settled" && !reduceMotion
              ? { opacity: 1, x: 0, scale: [1, 1.12, 1] }
              : { opacity: 1, x: 0, scale: 1 }
          }
          transition={reduceMotion ? { duration: 0 } : beat === "settled" ? { duration: 0.4 } : spring}
          aria-hidden="true"
        >
          <span
            className="material-symbols-outlined text-[22px] text-[#f59e0b]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
          <span
            className="text-[22px] font-extrabold text-[#1d1d1f] tabular-nums"
            style={{ minWidth: `${String(totalAfter).length}ch` }}
          >
            {draining ? (
              <CountUp from={totalBefore} to={totalAfter ?? 0} duration={XP_TRANSFER_DURATION} />
            ) : (
              totalBefore
            )}
          </span>
          <span className="text-[14px] font-bold text-[#86868b]">XP</span>
        </motion.span>
      ) : null}
    </div>
  );
}

function QuestStepView({
  update,
  totalXp,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
}: {
  update: QuestUpdate;
  /** The learner's total XP with this sync's quest XP included. */
  totalXp: number | null;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const continueRef = useContinueShortcut(onContinue);
  const steps = update.quests;
  const movedIds = steps.filter(questStepMoved).map((step) => step.id);
  const finished = steps.filter((step) => questStepMoved(step) && step.done && step.before < step.target);
  const allDone = steps.length > 0 && steps.every((step) => step.done);
  const fillsEnd =
    QUEST_FILL_START + Math.max(0, movedIds.length - 1) * QUEST_FILL_GAP + QUEST_FILL_DURATION;
  const bonusAt = fillsEnd + 0.15;
  const xpAt = update.bonus ? bonusAt + 0.5 : fillsEnd;

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
      <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+2.5rem)]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6 py-4 text-center">
          <motion.div
            className="flex h-[110px] items-end justify-center"
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22 }}
            aria-hidden="true"
          >
            <div className="origin-bottom scale-[1.35]">
              <ChillPingu pose={allDone ? "balloon" : "pen"} />
            </div>
          </motion.div>
          <h2
            className="mt-4 text-[30px] font-bold tracking-tight text-[#1d1d1f]"
            style={{ letterSpacing: "-0.03em" }}
          >
            {update.bonus || allDone
              ? "Xong hết nhiệm vụ!"
              : finished.length > 0
                ? "Nhiệm vụ hoàn thành!"
                : "Tiến gần hơn rồi!"}
          </h2>

          <ul className="mt-5 w-full overflow-hidden rounded-[24px] border-2 border-[#e5e5ea] bg-white shadow-[0_4px_0_0_#e5e5ea]">
            {steps.map((step, index) => {
              const order = movedIds.indexOf(step.id);
              return (
                <QuestStepRow
                  key={step.id}
                  step={step}
                  index={index}
                  fillDelay={order < 0 ? null : QUEST_FILL_START + order * QUEST_FILL_GAP}
                />
              );
            })}
          </ul>

          {update.bonus ? (
            <motion.div
              className="mt-3 flex w-full items-center gap-3 rounded-[20px] border-2 border-[#ffd66b] bg-[#fff8e1] px-4 py-3 text-left shadow-[0_4px_0_0_#ffd66b]"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 16, delay: bonusAt }
              }
            >
              <QuestChest open size={44} />
              <p className="text-[15px] font-extrabold text-[#1d1d1f]">Mở rương thưởng</p>
            </motion.div>
          ) : null}

          {update.xp > 0 ? (
            <QuestXpTransfer gained={update.xp} totalAfter={totalXp} startAt={xpAt} />
          ) : null}
        </div>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
        <motion.button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className={chunkyButton("primary", "w-full")}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.4, duration: 0.25 }}
        >
          {continueLabel}
        </motion.button>
        <SecondaryButton label={secondaryLabel} onClick={onSecondary} delay={reduceMotion ? 0 : 0.4} />
      </div>
    </main>
  );
}

/** The second action on an end card. It rises with the primary button. */
function SecondaryButton({
  label,
  onClick,
  delay,
}: {
  label?: string;
  onClick?: () => void;
  delay: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  if (!label || !onClick) return null;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={chunkyButton("secondary", "mt-3 w-full")}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.25 }}
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
        replay
      </span>
      {label}
    </motion.button>
  );
}

/** The flame and the day counter ticking up, after the completed screen. */
function StreakStepView({
  step,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
}: {
  step: StreakCelebration;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const continueRef = useContinueShortcut(onContinue);

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <Flame still={reduceMotion} />
        <StreakCount from={step.from} to={step.to} still={reduceMotion} />
        <p className="mt-2 text-[20px] font-semibold tracking-tight text-[#1d1d1f]">
          ngày liên tiếp
        </p>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
        <motion.button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className={chunkyButton("primary", "w-full")}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.85, duration: 0.25 }}
        >
          {continueLabel}
        </motion.button>
        <SecondaryButton label={secondaryLabel} onClick={onSecondary} delay={reduceMotion ? 0 : 0.85} />
      </div>
    </main>
  );
}

const CLIMB_ROW_HEIGHT = 64;
/** Seconds into the ranking screen when your XP starts to tick up. */
const CLIMB_XP_AT = 0.6;
const CLIMB_XP_DURATION = 0.8;
/** Seconds your row stays lifted before it starts to climb. */
const CLIMB_LIFT = 0.25;
const CLIMB_EASE = [0.65, 0, 0.35, 1] as const;

/** before → lift (your row pops out) → climb (rows trade places) → settled. */
type ClimbPhase = "before" | "lift" | "climb" | "settled";

function climbDuration(places: number): number {
  return Math.min(1.8, 0.6 + places * 0.12);
}

/** Your rank badge counting down while your row climbs. */
function ClimbingRank({
  from,
  to,
  climbing,
  settled,
  duration,
}: {
  from: number;
  to: number;
  climbing: boolean;
  settled: boolean;
  duration: number;
}) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!climbing) return;
    const controls = animate(from, to, {
      duration,
      ease: CLIMB_EASE,
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [climbing, from, to, duration]);

  return <RankBadge rank={settled ? to : value} />;
}

/** The weekly class board, with your row climbing past the classmates this part overtook. */
export function RankClimbStepView({
  climb,
  className,
  countdown,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
}: {
  climb: RankClimb;
  className: string | null;
  countdown: string;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const continueRef = useContinueShortcut(onContinue);
  const places = climb.rankBefore - climb.rankAfter;
  const moved = places > 0;
  const climbFor = climbDuration(places);
  const [running, setRunning] = useState<ClimbPhase>("before");
  const phase: ClimbPhase = reduceMotion ? "settled" : running;

  useEffect(() => {
    if (reduceMotion) return;
    const xpDone = (CLIMB_XP_AT + CLIMB_XP_DURATION) * 1000;
    const timers = moved
      ? [
          window.setTimeout(() => setRunning("lift"), xpDone + 100),
          window.setTimeout(() => setRunning("climb"), xpDone + 100 + CLIMB_LIFT * 1000),
          window.setTimeout(
            () => {
              setRunning("settled");
              playSuccessSound();
            },
            xpDone + 100 + (CLIMB_LIFT + climbFor) * 1000,
          ),
        ]
      : [window.setTimeout(() => setRunning("settled"), xpDone + 100)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion, moved, climbFor]);

  const placed = phase === "climb" || phase === "settled";
  const lifted = phase === "lift" || phase === "climb";
  const windowStart = placed ? climb.windowAfter : climb.windowBefore;
  const slide = reduceMotion ? { duration: 0 } : { duration: climbFor, ease: CLIMB_EASE };
  const title =
    moved && phase !== "settled"
      ? "Bảng xếp hạng tuần"
      : moved
        ? `Bạn đã lên hạng ${climb.rankAfter}!`
        : climb.rankAfter === 1
          ? "Bạn vẫn đứng đầu lớp!"
          : `Bạn đang giữ hạng ${climb.rankAfter}`;

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
      <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+2.5rem)]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6 py-4 text-center">
          <motion.div
            className="flex h-[76px] w-[76px] items-center justify-center rounded-[26px] bg-[#ffc800] shadow-[0_5px_0_0_#e0a800]"
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.8 }}
            animate={
              phase === "settled" && moved && !reduceMotion
                ? { opacity: 1, y: 0, scale: [1, 1.2, 1], rotate: [0, -8, 8, 0] }
                : { opacity: 1, y: 0, scale: 1, rotate: 0 }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : phase === "settled"
                  ? { duration: 0.5, ease: "easeOut" }
                  : { type: "spring", stiffness: 380, damping: 22 }
            }
            aria-hidden="true"
          >
            <span
              className="material-symbols-outlined text-[44px] text-[#7a4b00]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              trophy
            </span>
          </motion.div>

          <motion.h2
            key={title}
            className="mt-5 text-[26px] font-bold tracking-tight text-[#1d1d1f]"
            style={{ letterSpacing: "-0.03em" }}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 22 }}
            aria-live="polite"
          >
            {title}
          </motion.h2>
          <p className="mt-1.5 text-[15px] font-extrabold text-[#f59e0b]">
            {className ? `Lớp ${className} · ` : ""}
            {countdown}
          </p>

          <motion.div
            className="mt-6 w-full overflow-hidden rounded-[24px] border-2 border-[#e5e5ea] bg-white px-1.5 py-1.5 shadow-[0_4px_0_0_#e5e5ea]"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.15, duration: 0.3 }}
          >
            <div
              className="relative overflow-hidden"
              style={{ height: climb.visible * CLIMB_ROW_HEIGHT }}
            >
              <motion.ol
                className="absolute inset-x-0 top-0"
                aria-label="Bảng xếp hạng tuần của lớp"
                initial={false}
                animate={{ y: -windowStart * CLIMB_ROW_HEIGHT }}
                transition={slide}
              >
                {climb.rows.map((row) => {
                  const place = placed ? row.after : row.before;
                  return (
                    <motion.li
                      key={row.key}
                      className="absolute inset-x-0 top-0 px-1"
                      style={{ height: CLIMB_ROW_HEIGHT, zIndex: row.isYou ? 2 : 1 }}
                      initial={false}
                      animate={{ y: place * CLIMB_ROW_HEIGHT }}
                      transition={slide}
                    >
                      <motion.div
                        className={`flex h-[58px] items-center gap-3 rounded-2xl px-3 text-left ${
                          row.isYou ? "bg-[#e0f2fe]" : ""
                        }`}
                        style={{ marginTop: (CLIMB_ROW_HEIGHT - 58) / 2 }}
                        initial={false}
                        animate={
                          row.isYou
                            ? {
                                scale: lifted ? 1.04 : 1,
                                boxShadow: lifted
                                  ? "0 10px 22px -6px rgba(2,132,199,0.45)"
                                  : "0 3px 0 0 #7dd3fc",
                              }
                            : undefined
                        }
                        transition={
                          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 24 }
                        }
                      >
                        {row.isYou ? (
                          <ClimbingRank
                            from={climb.rankBefore}
                            to={climb.rankAfter}
                            climbing={phase === "climb"}
                            settled={phase === "settled"}
                            duration={climbFor}
                          />
                        ) : (
                          <RankBadge rank={place + 1} />
                        )}
                        <PersonAvatar name={row.name} image={row.image} />
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate text-[15px] font-extrabold text-[#131b2e]">
                            {row.name}
                          </span>
                          {row.isYou ? (
                            <span className="shrink-0 rounded-full bg-[#0284c7] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                              Bạn
                            </span>
                          ) : null}
                        </span>
                        <span className="relative flex shrink-0 items-center gap-0.5 text-[16px] font-extrabold tabular-nums text-[#f59e0b]">
                          <span
                            className="material-symbols-outlined text-[18px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            aria-hidden="true"
                          >
                            bolt
                          </span>
                          {row.isYou ? (
                            <>
                              <CountUp
                                from={row.xpBefore}
                                to={row.xpAfter}
                                delay={CLIMB_XP_AT}
                                duration={CLIMB_XP_DURATION}
                              />
                              {reduceMotion ? null : (
                                <motion.span
                                  className="pointer-events-none absolute -top-3 right-0 text-[12px] font-extrabold text-[#f59e0b]"
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: [0, 1, 1, 0], y: [4, -4, -8, -14] }}
                                  transition={{ delay: CLIMB_XP_AT, duration: CLIMB_XP_DURATION + 0.4 }}
                                  aria-hidden="true"
                                >
                                  +{row.xpAfter - row.xpBefore}
                                </motion.span>
                              )}
                            </>
                          ) : (
                            row.xpAfter
                          )}
                        </span>
                      </motion.div>
                    </motion.li>
                  );
                })}
              </motion.ol>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
        <motion.button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className={chunkyButton("primary", "w-full")}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.4, duration: 0.25 }}
        >
          {continueLabel}
        </motion.button>
        <SecondaryButton label={secondaryLabel} onClick={onSecondary} delay={reduceMotion ? 0 : 0.4} />
      </div>
    </main>
  );
}

const CLASS_CLIMB_ROW_HEIGHT = 86;

/** The weekly classes board, with your class climbing past the classes this part overtook. */
export function ClassRankClimbStepView({
  climb,
  countdown,
  contributionBefore,
  contributionAfter,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
}: {
  climb: ClassRankClimb;
  countdown: string;
  contributionBefore: number;
  contributionAfter: number;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const continueRef = useContinueShortcut(onContinue);
  const places = climb.rankBefore - climb.rankAfter;
  const moved = places > 0;
  const climbFor = climbDuration(places);
  const [running, setRunning] = useState<ClimbPhase>("before");
  const phase: ClimbPhase = reduceMotion ? "settled" : running;

  useEffect(() => {
    if (reduceMotion) return;
    const xpDone = (CLIMB_XP_AT + CLIMB_XP_DURATION) * 1000;
    const timers = moved
      ? [
          window.setTimeout(() => setRunning("lift"), xpDone + 100),
          window.setTimeout(() => setRunning("climb"), xpDone + 100 + CLIMB_LIFT * 1000),
          window.setTimeout(
            () => {
              setRunning("settled");
              playSuccessSound();
            },
            xpDone + 100 + (CLIMB_LIFT + climbFor) * 1000,
          ),
        ]
      : [window.setTimeout(() => setRunning("settled"), xpDone + 100)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion, moved, climbFor]);

  const placed = phase === "climb" || phase === "settled";
  const lifted = phase === "lift" || phase === "climb";
  const windowStart = placed ? climb.windowAfter : climb.windowBefore;
  const slide = reduceMotion ? { duration: 0 } : { duration: climbFor, ease: CLIMB_EASE };
  const title =
    moved && phase !== "settled"
      ? "Xếp hạng các lớp"
      : moved
        ? `Lớp bạn đã lên hạng ${climb.rankAfter}!`
        : climb.rankAfter === 1
          ? "Lớp bạn vẫn đứng đầu!"
          : `Lớp bạn đang giữ hạng ${climb.rankAfter}`;

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
      <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+2.5rem)]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6 py-4 text-center">
          <motion.div
            className="flex h-[76px] w-[76px] items-center justify-center rounded-[26px] bg-[#38bdf8] shadow-[0_5px_0_0_#0284c7]"
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.8 }}
            animate={
              phase === "settled" && moved && !reduceMotion
                ? { opacity: 1, y: 0, scale: [1, 1.2, 1], rotate: [0, -8, 8, 0] }
                : { opacity: 1, y: 0, scale: 1, rotate: 0 }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : phase === "settled"
                  ? { duration: 0.5, ease: "easeOut" }
                  : { type: "spring", stiffness: 380, damping: 22 }
            }
            aria-hidden="true"
          >
            <span
              className="material-symbols-outlined text-[44px] text-white"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              groups
            </span>
          </motion.div>

          <motion.h2
            key={title}
            className="mt-5 text-[26px] font-bold tracking-tight text-[#1d1d1f]"
            style={{ letterSpacing: "-0.03em" }}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 22 }}
            aria-live="polite"
          >
            {title}
          </motion.h2>
          <p className="mt-1.5 text-[15px] font-extrabold text-[#0284c7]">Tuần này · {countdown}</p>

          <motion.div
            className="mt-6 w-full overflow-hidden rounded-[24px] border-2 border-[#e5e5ea] bg-white px-1.5 py-1.5 shadow-[0_4px_0_0_#e5e5ea]"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.15, duration: 0.3 }}
          >
            <div
              className="relative overflow-hidden"
              style={{ height: climb.visible * CLASS_CLIMB_ROW_HEIGHT }}
            >
              <motion.ol
                className="absolute inset-x-0 top-0"
                aria-label="Xếp hạng các lớp trong tuần"
                initial={false}
                animate={{ y: -windowStart * CLASS_CLIMB_ROW_HEIGHT }}
                transition={slide}
              >
                {climb.rows.map((row) => {
                  const place = placed ? row.after : row.before;
                  const perMember = placed ? row.xpPerMemberAfter : row.xpPerMemberBefore;
                  return (
                    <motion.li
                      key={row.key}
                      className="absolute inset-x-0 top-0 px-1"
                      style={{ height: CLASS_CLIMB_ROW_HEIGHT, zIndex: row.isYours ? 2 : 1 }}
                      initial={false}
                      animate={{ y: place * CLASS_CLIMB_ROW_HEIGHT }}
                      transition={slide}
                    >
                      <motion.div
                        className={`flex h-[78px] items-center gap-3 rounded-2xl px-3 text-left ${
                          row.isYours ? "bg-[#e0f2fe]" : ""
                        }`}
                        style={{ marginTop: (CLASS_CLIMB_ROW_HEIGHT - 78) / 2 }}
                        initial={false}
                        animate={
                          row.isYours
                            ? {
                                scale: lifted ? 1.03 : 1,
                                boxShadow: lifted
                                  ? "0 10px 22px -6px rgba(2,132,199,0.45)"
                                  : "0 3px 0 0 #7dd3fc",
                              }
                            : undefined
                        }
                        transition={
                          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 24 }
                        }
                      >
                        {row.isYours ? (
                          <ClimbingRank
                            from={climb.rankBefore}
                            to={climb.rankAfter}
                            climbing={phase === "climb"}
                            settled={phase === "settled"}
                            duration={climbFor}
                          />
                        ) : (
                          <RankBadge rank={place + 1} />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-extrabold text-[#131b2e]">
                              {row.name}
                            </span>
                            {row.isYours ? (
                              <span className="shrink-0 rounded-full bg-[#0284c7] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                                Lớp bạn
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[12px] font-bold text-[#6e7881]">
                            {row.members} học viên ·{" "}
                            {row.isYours ? (
                              <CountUp
                                from={row.xpPerMemberBefore}
                                to={row.xpPerMemberAfter}
                                delay={CLIMB_XP_AT}
                                duration={CLIMB_XP_DURATION}
                                format={(value) => value.toLocaleString("vi-VN")}
                              />
                            ) : (
                              perMember.toLocaleString("vi-VN")
                            )}{" "}
                            XP/người
                          </span>
                          {row.isYours ? (
                            <span className="block text-[12px] font-extrabold text-[#0284c7]">
                              Bạn góp{" "}
                              <CountUp
                                from={contributionBefore}
                                to={contributionAfter}
                                delay={CLIMB_XP_AT}
                                duration={CLIMB_XP_DURATION}
                                format={(value) => value.toLocaleString("vi-VN")}
                              />{" "}
                              XP
                            </span>
                          ) : null}
                        </span>
                        <span className="relative flex shrink-0 items-center gap-0.5 text-[16px] font-extrabold tabular-nums text-[#f59e0b]">
                          <span
                            className="material-symbols-outlined text-[18px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            aria-hidden="true"
                          >
                            bolt
                          </span>
                          {row.isYours ? (
                            <>
                              <CountUp
                                from={row.xpBefore}
                                to={row.xpAfter}
                                delay={CLIMB_XP_AT}
                                duration={CLIMB_XP_DURATION}
                                format={(value) => value.toLocaleString("vi-VN")}
                              />
                              {reduceMotion ? null : (
                                <motion.span
                                  className="pointer-events-none absolute -top-3 right-0 text-[12px] font-extrabold text-[#f59e0b]"
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: [0, 1, 1, 0], y: [4, -4, -8, -14] }}
                                  transition={{ delay: CLIMB_XP_AT, duration: CLIMB_XP_DURATION + 0.4 }}
                                  aria-hidden="true"
                                >
                                  +{(row.xpAfter - row.xpBefore).toLocaleString("vi-VN")}
                                </motion.span>
                              )}
                            </>
                          ) : (
                            row.xpAfter.toLocaleString("vi-VN")
                          )}
                        </span>
                      </motion.div>
                    </motion.li>
                  );
                })}
              </motion.ol>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
        <motion.button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className={chunkyButton("primary", "w-full")}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.4, duration: 0.25 }}
        >
          {continueLabel}
        </motion.button>
        <SecondaryButton label={secondaryLabel} onClick={onSecondary} delay={reduceMotion ? 0 : 0.4} />
      </div>
    </main>
  );
}

type Stage = "complete" | "streak" | "notify" | "quests" | "classmates" | "ranking" | "classes";

function NotifyStepView({ streakDays, onDone }: { streakDays: number; onDone: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function allow() {
    setBusy(true);
    setFailed(false);
    const result = await enableStreakReminders();
    if (result === "granted" || result === "denied") {
      onDone();
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <Flame still={reduceMotion} />
        <h2
          className="mt-4 text-[26px] font-bold tracking-tight text-[#1d1d1f]"
          style={{ letterSpacing: "-0.03em" }}
        >
          Chuỗi {streakDays} ngày
        </h2>
        <p className="mt-2 max-w-[18rem] text-[17px] font-semibold leading-6 text-[#3a3a3c]">
          Nhắc một lần vào buổi tối nếu hôm đó bạn chưa học.
        </p>
        {failed ? (
          <p className="mt-3 text-[14px] font-semibold text-[#ff3b30]">Chưa bật được. Thử lại sau.</p>
        ) : null}
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
        <button
          type="button"
          onClick={() => void allow()}
          disabled={busy}
          className={chunkyButton(busy ? "disabled" : "primary", "w-full")}
        >
          {busy ? "Đang bật" : "Bật nhắc nhở"}
        </button>
        <button
          type="button"
          onClick={() => {
            dismissStreakReminderPrompt();
            onDone();
          }}
          disabled={busy}
          className={chunkyButton("secondary", "mt-3 w-full")}
        >
          Để sau
        </button>
      </div>
    </main>
  );
}

/** Seconds into the classmates step when your face joins the stack. */
const CLASSMATE_JOIN_AT = 0.6;
const CLASSMATE_ROWS_AT = 0.35;
const CLASSMATE_ROW_GAP = 0.06;

/** The green tick on a face that finished. */
function FinishedDot({ size, className = "absolute -right-1 -bottom-1" }: { size: number; className?: string }) {
  return (
    <span
      className={`${className} flex items-center justify-center rounded-full border-[3px] border-[#fbfbfd] bg-[#34C759] text-white`}
      style={{ width: size, height: size }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: Math.round(size * 0.6), fontVariationSettings: "'FILL' 1, 'wght' 700" }}
      >
        check
      </span>
    </span>
  );
}

function ClassmateRow({
  name,
  image,
  note,
  you,
  done,
  index,
  checkAt,
}: {
  name: string;
  image: string | null;
  note: string | null;
  you: boolean;
  done: boolean;
  index: number;
  checkAt: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <motion.li
      className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t-2 border-[#f2f2f7]" : ""} ${
        you && done ? "bg-[#e0f2fe]" : ""
      }`}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 420, damping: 22, delay: CLASSMATE_ROWS_AT + index * CLASSMATE_ROW_GAP }
      }
    >
      <PersonAvatar name={name} image={image} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-extrabold text-[#131b2e]">{you ? "Bạn" : name}</span>
        </span>
        {note ? (
          <span className={`block text-[13px] font-bold ${you ? "text-[#0284c7]" : "text-[#86868b]"}`}>{note}</span>
        ) : null}
      </span>
      {done ? (
        <motion.span
          className="material-symbols-outlined shrink-0 text-[28px] text-[#34C759]"
          style={{ fontVariationSettings: "'FILL' 1" }}
          initial={reduceMotion ? false : { scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 14, delay: checkAt }}
          aria-hidden="true"
        >
          check_circle
        </motion.span>
      ) : (
        <span
          className="mr-0.5 h-6 w-6 shrink-0 rounded-full border-[3px] border-dashed border-[#c7c7cc]"
          aria-hidden="true"
        />
      )}
    </motion.li>
  );
}

/**
 * Classmates who have finished this Lektion's study or practice.
 * Once you have finished it too, your face joins theirs.
 */
export function ClassmateFinishStepView({
  finish,
  youFinished,
  continueLabel,
  onContinue,
  secondaryLabel,
  onSecondary,
}: {
  finish: ClassmateFinish;
  /** You have finished the same side of this Lektion. */
  youFinished: boolean;
  continueLabel: string;
  onContinue: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const continueRef = useContinueShortcut(onContinue);
  const { data: session } = useSession();
  const youName = session?.user?.name?.trim() || "Bạn";
  const youImage = googleProfileImage(session?.user?.image);
  const [now] = useState(() => Date.now());
  const caption = classmateJoinCaption(finish, youFinished);
  const more = finish.total - finish.people.length;
  const at = (seconds: number) => (reduceMotion ? 0 : seconds);
  const firstClassmateRow = youFinished ? 1 : 0;
  const youRow = youFinished ? 0 : finish.people.length + (more > 0 ? 1 : 0);

  useEffect(() => {
    if (!youFinished) return;
    const timer = window.setTimeout(playSuccessSound, reduceMotion ? 0 : (CLASSMATE_JOIN_AT + 0.25) * 1000);
    return () => window.clearTimeout(timer);
  }, [youFinished, reduceMotion]);

  return (
    <main className="fixed inset-0 z-10 flex flex-col bg-[#fbfbfd]">
      <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+2.5rem)]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6 py-4 text-center">
          <div className="relative flex h-[96px] w-full items-center justify-center" aria-hidden="true">
            {youFinished && !reduceMotion ? (
              <div className="pointer-events-none absolute -inset-x-6 -inset-y-12 overflow-hidden">
                {CONFETTI.map((piece, index) => (
                  <motion.span
                    key={`classmate-confetti-${index}`}
                    className="absolute top-1/2 left-1/2 block"
                    style={{
                      width: piece.w,
                      height: piece.h,
                      borderRadius: piece.w === piece.h ? 999 : 2,
                      backgroundColor: piece.color,
                    }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
                    animate={{
                      x: piece.x * 0.8,
                      y: piece.y * 0.7,
                      rotate: piece.rotate,
                      scale: 1,
                      opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                      duration: piece.duration + 0.6,
                      delay: CLASSMATE_JOIN_AT + 0.2 + piece.delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                ))}
              </div>
            ) : null}
            <div className="relative flex items-center">
              {finish.people.map((person, index) => (
                <motion.span
                  key={`${person.name}-${index}`}
                  className={`relative block rounded-full ring-[3px] ring-[#fbfbfd] ${index === 0 ? "" : "-ml-2.5"}`}
                  style={{ zIndex: finish.people.length - index }}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.4, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 520, damping: 18, delay: 0.05 + index * 0.07 }
                  }
                >
                  <PersonAvatar name={person.name} image={person.image} size={44} />
                  <FinishedDot size={20} />
                </motion.span>
              ))}
              {youFinished ? (
                <motion.span
                  className="relative z-10 -ml-3 block rounded-full bg-[#34C759] p-[5px] shadow-[0_4px_0_0_#249a43]"
                  initial={reduceMotion ? false : { opacity: 0, x: 56, scale: 0.5 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 14, delay: CLASSMATE_JOIN_AT }
                  }
                >
                  <span className="block rounded-full ring-2 ring-white">
                    <PersonAvatar name={youName} image={youImage} size={62} />
                  </span>
                  <motion.span
                    className="absolute -right-1 -bottom-1 block"
                    initial={reduceMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 520, damping: 12, delay: CLASSMATE_JOIN_AT + 0.3 }
                    }
                  >
                    <FinishedDot size={28} className="" />
                  </motion.span>
                </motion.span>
              ) : (
                <motion.span
                  className="relative ml-3 flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-dashed border-[#7dd3fc] bg-white"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { delay: 0.45, duration: 0.3 }}
                >
                  <span className="block opacity-60 grayscale">
                    <PersonAvatar name={youName} image={youImage} size={54} />
                  </span>
                  <motion.span
                    className="absolute -right-1.5 -bottom-1.5 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#fbfbfd] bg-[#0284c7] text-white"
                    animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
                  >
                    <span
                      className="material-symbols-outlined text-[16px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      directions_run
                    </span>
                  </motion.span>
                </motion.span>
              )}
            </div>
          </div>

          <motion.h2
            className="mt-6 text-[28px] font-bold tracking-tight text-[#1d1d1f]"
            style={{ letterSpacing: "-0.03em" }}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.12, duration: 0.25 }}
          >
            {youFinished ? "Bạn cũng về đích rồi!" : "Về đích cùng các bạn nhé!"}
          </motion.h2>
          <motion.p
            className="mt-1.5 text-[15px] font-extrabold text-balance text-[#0284c7]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: at(0.2), duration: 0.25 }}
          >
            {caption}
          </motion.p>

          <ul
            className="mt-6 w-full overflow-hidden rounded-2xl border-2 border-b-4 border-[#e5e5ea] bg-white text-left"
            aria-label="Bạn cùng lớp đã xong bài này"
          >
            {youFinished ? (
              <ClassmateRow
                name={youName}
                image={youImage}
                note="Vừa xong"
                you
                done
                index={0}
                checkAt={CLASSMATE_JOIN_AT + 0.35}
              />
            ) : null}
            {finish.people.map((person, index) => (
              <ClassmateRow
                key={`${person.name}-${index}`}
                name={person.name}
                image={person.image}
                note={finishedAgoLabel(person.finishedAt, now)}
                you={false}
                done
                index={firstClassmateRow + index}
                checkAt={CLASSMATE_ROWS_AT + (firstClassmateRow + index) * CLASSMATE_ROW_GAP + 0.15}
              />
            ))}
            {more > 0 ? (
              <motion.li
                className="border-t-2 border-[#f2f2f7] px-4 py-3 text-center text-[14px] font-extrabold text-[#86868b]"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  delay: at(CLASSMATE_ROWS_AT + (firstClassmateRow + finish.people.length) * CLASSMATE_ROW_GAP),
                  duration: 0.25,
                }}
              >
                +{more} bạn nữa cũng đã xong
              </motion.li>
            ) : null}
            {youFinished ? null : (
              <ClassmateRow
                name={youName}
                image={youImage}
                note="Đang học bài này"
                you
                done={false}
                index={youRow}
                checkAt={0}
              />
            )}
          </ul>
        </div>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#fbfbfd] px-6 pt-2 pb-6">
        <motion.button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className={chunkyButton("primary", "w-full")}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.2, duration: 0.25 }}
        >
          {continueLabel}
        </motion.button>
        <SecondaryButton label={secondaryLabel} onClick={onSecondary} delay={reduceMotion ? 0 : 0.2} />
      </div>
    </main>
  );
}

/**
 * The end of a part: a loader while the server counts XP, the completed
 * screen, classmates who have finished this Lektion, the streak flame when
 * this run raised it, the daily quests when this part moved one, the weekly
 * class board when this part earned XP, then the weekly ranking of classes.
 */
export function PartCompleteScreen(props: PartCompleteScreenProps) {
  const {
    xp,
    xpKind,
    xpPending,
    totalXp = null,
    questUpdate,
    failed,
    celebrateStreak = false,
    continueLabel,
    onContinue,
    secondaryLabel,
    onSecondary,
    skipBoard = false,
    lessonKey,
    finishSide,
    sideFinished = false,
    classmatePreview,
  } = props;
  const expectsClassmates = classmatePreview
    ? !failed && classmatePreview.total > 0
    : !skipBoard && !failed && Boolean(lessonKey) && (finishSide === "study" || finishSide === "practice");
  const [loaderShown] = useState(() => xpPending && !failed);
  const [minElapsed, setMinElapsed] = useState(!loaderShown);
  const [gaveUp, setGaveUp] = useState(false);
  /** The weekly class board with this part counted. Undefined while loading, null when unread. */
  const [board, setBoard] = useState<LeaderboardPayload | null | undefined>(undefined);
  const [boardGaveUp, setBoardGaveUp] = useState(false);
  /** The weekly classes board with this part counted. Undefined while loading, null when unread. */
  const [classesBoard, setClassesBoard] = useState<LeaderboardPayload | null | undefined>(undefined);
  const [classesGaveUp, setClassesGaveUp] = useState(false);
  /** Classmates who have finished this Lektion side. Undefined while loading. */
  const [classmates, setClassmates] = useState<ClassmateFinish | null | undefined>(
    classmatePreview ?? (expectsClassmates ? undefined : null),
  );
  const leftRef = useRef(false);
  const [stage, setStage] = useState<Stage>("complete");
  const [streakStep, setStreakStep] = useState<StreakCelebration | null>(null);
  const [askPush, setAskPush] = useState(false);
  const queuedStreak = useSyncExternalStore(
    subscribeStreakCelebration,
    readQueuedStreakCelebration,
    () => null,
  );

  useEffect(() => {
    setAskPush(canAskForStreakReminder());
  }, []);

  useEffect(() => {
    if (minElapsed) return;
    const timer = window.setTimeout(() => setMinElapsed(true), LOADER_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [minElapsed]);

  useEffect(() => {
    if (!xpPending || failed) return;
    const timer = window.setTimeout(() => setGaveUp(true), LOADER_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [xpPending, failed]);

  const partXp = xpCaption(xp, xpKind).amount;
  const questXp = questUpdate?.xp ?? 0;
  const earnedXp = failed ? 0 : partXp + questXp;

  // Read once this part's XP is stored, so the board already counts it. It
  // loads behind the completed screen; the loader does not wait for it.
  useEffect(() => {
    if (skipBoard || xpPending || earnedXp <= 0) return;
    let cancelled = false;
    void fetch("/api/leaderboard?scope=class&range=week")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: LeaderboardPayload | null) => {
        if (cancelled) return;
        setBoard(data && data.ready && Array.isArray(data.rows) ? data : null);
      })
      .catch(() => {
        if (!cancelled) setBoard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [skipBoard, xpPending, earnedXp]);

  useEffect(() => {
    if (skipBoard || xpPending || earnedXp <= 0 || board !== undefined) return;
    const timer = window.setTimeout(() => setBoardGaveUp(true), LOADER_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [skipBoard, xpPending, earnedXp, board]);

  useEffect(() => {
    if (skipBoard || xpPending || earnedXp <= 0) return;
    let cancelled = false;
    void fetch("/api/leaderboard?board=classes")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: LeaderboardPayload | null) => {
        if (cancelled) return;
        setClassesBoard(data && data.ready && data.classes ? data : null);
      })
      .catch(() => {
        if (!cancelled) setClassesBoard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [skipBoard, xpPending, earnedXp]);

  useEffect(() => {
    if (skipBoard || xpPending || earnedXp <= 0 || classesBoard !== undefined) return;
    const timer = window.setTimeout(() => setClassesGaveUp(true), LOADER_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [skipBoard, xpPending, earnedXp, classesBoard]);

  useEffect(() => {
    if (classmatePreview || !expectsClassmates || !lessonKey || !finishSide) return;
    let cancelled = false;
    const params = new URLSearchParams({ lesson: lessonKey, side: finishSide });
    void fetch(`/api/classmates?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { ready?: boolean; finish?: unknown } | null) => {
        if (cancelled) return;
        setClassmates(data?.ready ? readClassmateFinish(data.finish) : null);
      })
      .catch(() => {
        if (!cancelled) setClassmates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [classmatePreview, expectsClassmates, lessonKey, finishSide]);

  useEffect(() => {
    if (!expectsClassmates || classmates !== undefined) return;
    const timer = window.setTimeout(() => setClassmates(null), LOADER_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [expectsClassmates, classmates]);

  const loading = !failed && (!minElapsed || (xpPending && !gaveUp));
  const boardPending = board === undefined && !boardGaveUp;
  const climb = board ? planRankClimb(board.rows, earnedXp) : null;
  const classesPending = classesBoard === undefined && !classesGaveUp;
  const classClimb = classesBoard?.classes
    ? planClassRankClimb(classesBoard.classes.rows, earnedXp)
    : null;
  const classAhead =
    !skipBoard && !xpPending && earnedXp > 0 && (classesPending || classClimb != null);
  const questsAhead =
    !failed && !xpPending && questUpdate != null && questUpdate.quests.some(questStepMoved);
  const streakAhead = !failed && celebrateStreak && (streakStep != null || queuedStreak != null);
  // Any part that earned XP ends on the board. While it is still loading the
  // step stays ahead, so the learner waits for it instead of skipping it.
  const rankingAhead = !skipBoard && !xpPending && earnedXp > 0 && (boardPending || climb != null);
  const classmatesPending = classmates === undefined;
  const classmatesShow = classmates != null && classmates.total > 0 && classmateDoneCaption(classmates) != null;
  const classmatesAhead = expectsClassmates && (classmatesPending || classmatesShow);
  const rankingGone = stage === "ranking" && !boardPending && climb == null && !classAhead;
  const classesGone = stage === "classes" && !classesPending && classClimb == null;

  // A board that failed, or does not rank this learner, is skipped. The last
  // ranking step leaving does the same as its continue button.
  useEffect(() => {
    if (leftRef.current) return;
    if (stage === "ranking" && !boardPending && climb == null && classAhead) {
      setStage("classes");
      return;
    }
    if (!rankingGone && !classesGone) return;
    leftRef.current = true;
    onContinue();
  }, [rankingGone, classesGone, stage, boardPending, climb, classAhead, onContinue]);

  const following: Stage[] = [];
  if (classmatesAhead) following.push("classmates");
  if (streakAhead) following.push("streak");
  if (askPush && streakAhead) following.push("notify");
  if (questsAhead) following.push("quests");
  if (rankingAhead) following.push("ranking");
  if (classAhead) following.push("classes");
  const sequenceKey = following.join(",");

  // A classmate row that comes back empty is skipped. The next step is
  // whichever celebration still follows the part card.
  useEffect(() => {
    if (leftRef.current || stage !== "classmates" || classmates === undefined) return;
    if (classmates && classmates.total > 0) return;
    const steps = sequenceKey
      .split(",")
      .filter((item): item is Stage => item !== "" && item !== "classmates");
    const nextStage = steps[0];
    if (nextStage === "streak") {
      const step = streakStep ?? takeStreakCelebration();
      if (!step) {
        const after = steps[1];
        if (after) {
          setStage(after);
          return;
        }
        leftRef.current = true;
        onContinue();
        return;
      }
      setStreakStep(step);
    }
    if (nextStage) {
      setStage(nextStage);
      return;
    }
    leftRef.current = true;
    onContinue();
  }, [stage, classmates, sequenceKey, streakStep, onContinue]);
  const next = following[following.indexOf(stage) + 1];
  const last = next == null;

  const advance = () => {
    if (!next) {
      onContinue();
      return;
    }
    if (next === "streak") {
      const step = streakStep ?? takeStreakCelebration();
      if (!step) {
        const after = following[following.indexOf("streak") + 1];
        if (after) setStage(after);
        else onContinue();
        return;
      }
      setStreakStep(step);
    }
    setStage(next);
  };

  const shared = {
    continueLabel: last ? continueLabel : "Tiếp tục",
    onContinue: advance,
    secondaryLabel: last ? secondaryLabel : undefined,
    onSecondary: last ? onSecondary : undefined,
  };

  if (loading) return <XpLoader />;

  if (stage === "streak" && streakStep) {
    return <StreakStepView step={streakStep} {...shared} />;
  }

  if (stage === "notify" && streakStep) {
    return <NotifyStepView streakDays={streakStep.to} onDone={advance} />;
  }

  if (stage === "quests" && questUpdate) {
    return <QuestStepView update={questUpdate} totalXp={totalXp ?? null} {...shared} />;
  }

  if (stage === "classmates") {
    if (!classmatesShow || !classmates) return <XpLoader label="Đang xem lớp" />;
    return <ClassmateFinishStepView finish={classmates} youFinished={sideFinished} {...shared} />;
  }

  if (stage === "ranking") {
    if (!climb || !board) return <XpLoader label="Đang tải bảng xếp hạng" />;
    // The last ranking step ends the part on the lesson. "Phần tiếp theo"
    // stays on the earlier steps; this one only offers the blue return button.
    const backToLesson = !classAhead && secondaryLabel === "Về bài học" && onSecondary;
    return (
      <RankClimbStepView
        climb={climb}
        className={board.className}
        countdown={board.countdown}
        continueLabel={backToLesson ? "Về bài học" : shared.continueLabel}
        onContinue={backToLesson ? onSecondary : shared.onContinue}
      />
    );
  }

  if (stage === "classes") {
    if (!classClimb || !classesBoard?.classes) return <XpLoader label="Đang tải xếp hạng các lớp" />;
    const backToLesson = secondaryLabel === "Về bài học" && onSecondary;
    const contributionAfter = classesBoard.classes.yourContribution;
    return (
      <ClassRankClimbStepView
        climb={classClimb}
        countdown={classesBoard.countdown}
        contributionBefore={Math.max(0, contributionAfter - earnedXp)}
        contributionAfter={contributionAfter}
        continueLabel={backToLesson ? "Về bài học" : shared.continueLabel}
        onContinue={backToLesson ? onSecondary : shared.onContinue}
      />
    );
  }

  return (
    <CompleteView
      {...props}
      questUpdate={questsAhead ? null : (questUpdate ?? null)}
      totalXp={
        totalXp == null || partXp <= 0
          ? null
          : { from: totalXp - questXp - partXp, to: totalXp - questXp }
      }
      {...shared}
    />
  );
}
