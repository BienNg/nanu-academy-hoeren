"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  dismissStreakCelebration,
  readStreakCelebration,
  subscribeStreakCelebration,
} from "@/lib/useProgress";

const EMBERS = [
  { x: -54, delay: 0.15, size: 8 },
  { x: 48, delay: 0.28, size: 6 },
  { x: -22, delay: 0.4, size: 5 },
  { x: 24, delay: 0.08, size: 7 },
  { x: 6, delay: 0.5, size: 4 },
];

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
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#fbfbfd] px-6 pb-safe pt-safe"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <Flame still={reduceMotion} />
        <StreakCount
          from={celebration.from}
          to={celebration.to}
          still={reduceMotion}
        />
        <p
          id="streak-celebration-title"
          className="mt-2 text-[20px] font-semibold tracking-tight text-[#1d1d1f]"
        >
          ngày liên tiếp
        </p>
      </div>
      <div className="w-full max-w-md pb-6">
        <motion.button
          type="button"
          autoFocus
          onClick={dismissStreakCelebration}
          className="flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#0066cc] text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98]"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.85, duration: 0.25 }}
        >
          Tiếp tục
        </motion.button>
      </div>
    </motion.div>
  );
}

function StreakCount({
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
    const tick = window.setTimeout(() => setShown(to), 720);
    return () => window.clearTimeout(tick);
  }, [from, still, to]);

  return (
    <motion.p
      key={shown}
      className="mt-2 text-[88px] font-bold leading-none tracking-tight text-[#1d1d1f] tabular-nums"
      initial={still || shown === from ? false : { scale: 0.55, y: 16, opacity: 0.4 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      aria-label={`Chuỗi ${to} ngày`}
    >
      {shown}
    </motion.p>
  );
}

function Flame({ still }: { still: boolean }) {
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
