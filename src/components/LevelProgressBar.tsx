"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { CountUp } from "@/components/QuestParts";

/** Seconds before the fill starts, so the screen settles first. */
export const LEVEL_FILL_DELAY = 0.35;
export const LEVEL_FILL_DURATION = 1.1;
const FILL_EASE = [0.22, 1, 0.36, 1] as const;

/** Specks thrown off the tip when the level fills up. */
const BURST = [
  { x: 34, y: -30, size: 9, color: "#ffe14d" },
  { x: 44, y: 4, size: 7, color: "#ffffff" },
  { x: 30, y: 34, size: 8, color: "#ffd60a" },
  { x: -4, y: -42, size: 6, color: "#ffffff" },
  { x: -8, y: 40, size: 7, color: "#ffe14d" },
  { x: -38, y: -24, size: 6, color: "#b7e34e" },
  { x: -40, y: 22, size: 6, color: "#ffd60a" },
  { x: 54, y: -12, size: 5, color: "#ffe14d" },
] as const;

const SPARKLE_PATH =
  "M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z";

/**
 * Lektionen finished in a level: the count on the left, the level's total on
 * the right. The fill grows from `from` to `to` with a sparkle riding its tip.
 */
export function LevelProgressBar({
  from,
  to,
  total,
  still,
  onFilled,
}: {
  from: number;
  to: number;
  total: number;
  still: boolean;
  onFilled?: () => void;
}) {
  const [filled, setFilled] = useState(still);
  const percent = (count: number) => `${(Math.min(total, Math.max(0, count)) / Math.max(1, total)) * 100}%`;
  const complete = total > 0 && to >= total;

  return (
    <div
      className="flex w-full items-center gap-4"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={to}
      aria-label={`${to} / ${total} Lektion`}
    >
      <span className="min-w-8 shrink-0 text-right text-[26px] font-bold tabular-nums text-[#3a3a3c]">
        {still ? to : <CountUp from={from} to={to} delay={LEVEL_FILL_DELAY + LEVEL_FILL_DURATION * 0.6} duration={0.3} />}
      </span>

      <div className="relative h-[22px] min-w-0 flex-1 rounded-full bg-[#e5e5e5]">
        <motion.div
          className="absolute inset-y-0 left-0 min-w-[22px] rounded-full"
          style={{
            background: "linear-gradient(90deg, #6cc644 0%, #8fd13f 30%, #d3ec55 75%, #f6f466 100%)",
          }}
          initial={still ? false : { width: percent(from) }}
          animate={{ width: percent(to) }}
          transition={{ delay: LEVEL_FILL_DELAY, duration: LEVEL_FILL_DURATION, ease: FILL_EASE }}
          onAnimationComplete={() => {
            if (filled) return;
            setFilled(true);
            onFilled?.();
          }}
        >
          {/* The streak: a light line that brightens toward the tip. */}
          <span
            className="absolute top-1/2 right-5 left-4 h-[4px] -translate-y-1/2 rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 100%)" }}
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute top-1/2 right-[11px] h-0 w-0"
            aria-hidden="true"
          >
            <motion.span
              className="absolute -top-8 -left-8 h-16 w-16 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,236,77,0.85) 0%, rgba(255,236,77,0.35) 40%, rgba(255,236,77,0) 70%)",
              }}
              initial={false}
              animate={still ? { scale: 1, opacity: 1 } : { scale: [0.9, 1.15, 0.9], opacity: [0.8, 1, 0.8] }}
              transition={still ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.svg
              viewBox="0 0 24 24"
              className="absolute -top-[11px] -left-[11px] h-[22px] w-[22px] drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]"
              initial={false}
              animate={
                still
                  ? { scale: 1, rotate: 0 }
                  : filled
                    ? { scale: [1, 1.5, 1], rotate: [0, 45, 90] }
                    : { scale: [0.85, 1.1, 0.85], rotate: 0 }
              }
              transition={
                still
                  ? { duration: 0 }
                  : filled
                    ? { duration: 0.5, ease: "easeOut" }
                    : { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <path d={SPARKLE_PATH} fill="#ffffff" />
            </motion.svg>
            {complete && filled && !still
              ? BURST.map((speck, index) => (
                  <motion.svg
                    key={index}
                    viewBox="0 0 24 24"
                    className="absolute"
                    style={{
                      width: speck.size * 2,
                      height: speck.size * 2,
                      left: -speck.size,
                      top: -speck.size,
                    }}
                    initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
                    animate={{ x: speck.x, y: speck.y, scale: [0.4, 1.1, 0], opacity: [1, 1, 0], rotate: 90 }}
                    transition={{ duration: 0.75, ease: "easeOut", delay: index * 0.02 }}
                  >
                    <path d={SPARKLE_PATH} fill={speck.color} />
                  </motion.svg>
                ))
              : null}
          </span>
        </motion.div>
      </div>

      <motion.span
        className="min-w-8 shrink-0 text-[26px] font-bold tabular-nums"
        initial={false}
        animate={
          complete && filled
            ? {
                color: "#e0a800",
                scale: still ? 1 : [1, 1.45, 1],
                textShadow: "0 0 14px rgba(255,214,10,0.85)",
              }
            : { color: "#3a3a3c", scale: 1, textShadow: "0 0 0px rgba(255,214,10,0)" }
        }
        transition={still ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
      >
        {total}
      </motion.span>
    </div>
  );
}
