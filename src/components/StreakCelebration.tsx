"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, useSyncExternalStore, type Ref } from "react";
import {
  dismissStreakCelebration,
  readStreakCelebration,
  subscribeStreakCelebration,
} from "@/lib/useProgress";
import { chunkyButton } from "@/components/chunkyButton";
import { StreakPingu } from "@/components/session/Pingu";
import { FOCUS_RING } from "@/lib/keyboard";

const EMBERS = [
  { x: -54, delay: 0.15, size: 8 },
  { x: 48, delay: 0.28, size: 6 },
  { x: -22, delay: 0.4, size: 5 },
  { x: 24, delay: 0.08, size: 7 },
  { x: 6, delay: 0.5, size: 4 },
];

/** When the counter ticks from yesterday's streak to today's. */
const STREAK_TICK_MS = 720;
/** Today's circle fills just after the counter lands. */
const TODAY_CHECK_AT = 0.82;
const BUTTONS_AT = 1.05;
const WEEK_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** Monday is 0 and Sunday is 6. `today` fills in; earlier `practiced` days are already checked. */
export type StreakWeekSample = {
  today: number;
  practiced: readonly number[];
};

export function StreakCelebration() {
  const celebration = useSyncExternalStore(
    subscribeStreakCelebration,
    readStreakCelebration,
    () => null,
  );
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (!celebration) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissStreakCelebration();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [celebration]);

  if (!celebration) return null;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-celebration-title"
      className="fixed inset-0 z-[100] bg-[#ff9500] pb-safe pt-safe"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <StreakScreen
        from={celebration.from}
        to={celebration.to}
        titleId="streak-celebration-title"
        continueLabel="Tiếp tục"
        onContinue={dismissStreakCelebration}
        autoFocus
      />
    </motion.div>
  );
}

/**
 * The orange streak day: Pingu in shades inside a flame, the counter ticking
 * up, this week's circles with today filling in, then the continue button.
 */
export function StreakScreen({
  from,
  to,
  titleId,
  continueLabel,
  onContinue,
  continueRef,
  autoFocus = false,
  secondaryLabel,
  onSecondary,
  week,
}: {
  from: number;
  to: number;
  titleId?: string;
  continueLabel: string;
  onContinue: () => void;
  continueRef?: Ref<HTMLButtonElement>;
  autoFocus?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** A fixed week, used by previews. The live card uses today and the streak length. */
  week?: StreakWeekSample;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const appear = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : delay, duration: 0.25 },
  });

  return (
    <div className="flex h-full flex-col bg-[#ff9500] text-white">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.2, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 14 }}
        >
          <StreakPingu className="h-[min(28dvh,250px)]" />
        </motion.div>
        <StreakCount from={from} to={to} still={reduceMotion} />
        <p id={titleId} className="text-[26px] font-extrabold tracking-tight text-white">
          ngày liên tiếp
        </p>
        <StreakWeek days={to} still={reduceMotion} week={week} />
      </div>
      <div className="mx-auto w-full max-w-md shrink-0 px-6 pt-2 pb-6">
        <motion.button
          ref={continueRef}
          type="button"
          autoFocus={autoFocus}
          onClick={onContinue}
          className={chunkyButton("inverse", "w-full")}
          {...appear(BUTTONS_AT)}
        >
          {continueLabel}
        </motion.button>
        {secondaryLabel && onSecondary ? (
          <motion.button type="button" onClick={onSecondary} className={`${TEXT_BUTTON} mt-3`} {...appear(BUTTONS_AT)}>
            {secondaryLabel}
          </motion.button>
        ) : null}
      </div>
    </div>
  );
}

const TEXT_BUTTON = `flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-extrabold uppercase tracking-[0.08em] text-white transition-colors hover:bg-white/10 ${FOCUS_RING}`;

/**
 * Monday through Sunday of the current week. The streak runs unbroken up to
 * today, so each earlier day still inside that count is checked. A sample week
 * marks the practiced days itself, including a day before a gap.
 */
function StreakWeek({ days, still, week }: { days: number; still: boolean; week?: StreakWeekSample }) {
  const [today] = useState(() => new Date());
  const weekday = today.getDay();
  const daysSinceMonday = week ? week.today : weekday === 0 ? 6 : weekday - 1;
  const practiced = week ? new Set(week.practiced) : null;
  const slots = WEEK_LABELS.map((label, index) => {
    const fromToday = index - daysSinceMonday;
    return {
      label,
      fromToday,
      done: practiced ? practiced.has(index) : fromToday < 0 && fromToday > -days,
    };
  });

  return (
    <ol className="mt-[clamp(16px,4dvh,32px)] flex w-full max-w-[360px] justify-between gap-1" aria-label={`Chuỗi ${days} ngày`}>
      {slots.map((slot, index) => (
        <li key={slot.label} className="flex flex-1 flex-col items-center gap-2" aria-hidden="true">
          <span className={`text-[15px] font-extrabold ${slot.fromToday === 0 ? "text-white" : "text-[#fff1c9]"}`}>
            {slot.label}
          </span>
          {slot.fromToday === 0 ? (
            <TodayCircle still={still} />
          ) : slot.done ? (
            <motion.span
              className="flex size-[min(10vw,40px)] items-center justify-center rounded-full bg-[#ffe066] text-[#ff9500]"
              initial={still ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18, delay: 0.3 + index * 0.05 }}
            >
              <Check />
            </motion.span>
          ) : (
            <span className="size-[min(10vw,40px)] rounded-full bg-[#c96f00]/45" />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Starts empty like tomorrow, then pops white with a ring once the counter lands. */
function TodayCircle({ still }: { still: boolean }) {
  const [landed, setLanded] = useState(false);
  const checked = still || landed;

  useEffect(() => {
    if (still) return;
    const tick = window.setTimeout(() => setLanded(true), TODAY_CHECK_AT * 1000);
    return () => window.clearTimeout(tick);
  }, [still]);

  return (
    <span className="relative flex size-[min(10vw,40px)] items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-[#c96f00]/45" />
      {checked ? (
        <>
          {still ? null : (
            <motion.span
              className="absolute inset-0 rounded-full border-4 border-white"
              initial={{ scale: 1, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          )}
          <motion.span
            className="absolute inset-0 flex items-center justify-center rounded-full bg-white text-[#ff9500] shadow-[0_3px_0_#e88400]"
            initial={still ? false : { scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 14 }}
          >
            <Check />
          </motion.span>
        </>
      ) : null}
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M5 12.5 L10 17 L19 7.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StreakCount({
  from,
  to,
  still,
}: {
  from: number;
  to: number;
  still: boolean;
}) {
  const [shown, setShown] = useState(still ? to : from);

  useEffect(() => {
    if (still) {
      setShown(to);
      return;
    }
    setShown(from);
    const tick = window.setTimeout(() => setShown(to), STREAK_TICK_MS);
    return () => window.clearTimeout(tick);
  }, [from, still, to]);

  return (
    <motion.p
      key={shown}
      className="mt-[min(1.5dvh,12px)] bg-gradient-to-b from-[#fffbe0] to-[#ffe066] bg-clip-text pb-1 text-[clamp(72px,12dvh,104px)] font-extrabold leading-none tracking-tight text-transparent tabular-nums"
      initial={still || shown === from ? false : { scale: 0.55, y: 16, opacity: 0.4 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      aria-label={`Chuỗi ${to} ngày`}
    >
      {shown}
    </motion.p>
  );
}

export function Flame({ still }: { still: boolean }) {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <motion.span
        className="absolute h-32 w-32 rounded-full bg-[#ff9500]/25 blur-2xl"
        animate={still ? { opacity: 0.7 } : { opacity: [0.45, 0.85, 0.55], scale: [0.9, 1.08, 0.95] }}
        transition={still ? undefined : { duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />
      {EMBERS.map((ember) => (
        <motion.span
          key={`${ember.x}-${ember.delay}`}
          className="absolute bottom-16 rounded-full bg-[#ff9f0a]"
          style={{ width: ember.size, height: ember.size, left: `calc(50% + ${ember.x}px)` }}
          initial={still ? false : { opacity: 0, y: 8 }}
          animate={still ? { opacity: 0 } : { opacity: [0, 1, 0], y: -78 }}
          transition={
            still
              ? undefined
              : { duration: 1.35, delay: ember.delay, repeat: Infinity, ease: "easeOut" }
          }
          aria-hidden="true"
        />
      ))}
      <motion.div
        initial={still ? false : { scale: 0.15, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 14 }}
      >
        <motion.svg
          viewBox="0 0 80 96"
          className="relative h-36 w-28 drop-shadow-[0_10px_18px_rgba(255,149,0,0.35)]"
          animate={still ? undefined : { scaleY: [1, 1.05, 0.98, 1.03, 1], rotate: [0, -3, 2, -1, 0] }}
          transition={still ? undefined : { duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "40px 88px" }}
          aria-hidden="true"
        >
          <path
            d="M40 6c6 16 18 24 22 40 4 18-6 36-22 42-16-6-26-24-22-42C22 30 34 22 40 6z"
            fill="#ff9500"
          />
          <path
            d="M40 18c3 10 10 16 12 26 2 12-4 22-12 26-8-4-14-14-12-26 2-10 9-16 12-26z"
            fill="#ffb340"
          />
          <motion.path
            d="M40 46c2 8 6 12 6 20 0 8-4 14-6 16-2-2-6-8-6-16 0-8 4-12 6-20z"
            fill="#ffd60a"
            style={{ transformOrigin: "40px 82px" }}
            animate={still ? undefined : { scaleY: [1, 0.86, 1.06, 0.92, 1] }}
            transition={still ? undefined : { duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>
      </motion.div>
    </div>
  );
}
