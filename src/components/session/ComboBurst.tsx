"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Burst strength per stage: 5 in a row, 10, 15 and on, then a flawless part.
 * Each stage draws more and wider bolts, more confetti and taller smoke.
 */
const LEVELS = [
  { word: "SUPER!", bolts: 2, boltScale: 0.55, boltOpacity: 0.55, confetti: 4, smoke: 26, wisps: 0, flash: 0, shake: false, ms: 1500 },
  { word: "KLASSE!", bolts: 3, boltScale: 0.75, boltOpacity: 0.68, confetti: 7, smoke: 40, wisps: 3, flash: 0, shake: false, ms: 1600 },
  { word: "KLASSE!", bolts: 5, boltScale: 1, boltOpacity: 0.8, confetti: 10, smoke: 56, wisps: 5, flash: 0.18, shake: false, ms: 1700 },
  { word: "PERFEKT!", bolts: 7, boltScale: 1.25, boltOpacity: 0.9, confetti: 14, smoke: 80, wisps: 8, flash: 0.4, shake: true, ms: 2100 },
] as const;

type Level = (typeof LEVELS)[number];

/** Zigzag lightning bands as [x, y] points in percent of the screen, most central first. */
const BOLTS: { points: [number, number][]; delay: number }[] = [
  { points: [[46, 14], [34, 33], [-4, 37]], delay: 0 },
  { points: [[56, 40], [86, 37], [104, 66]], delay: 0.06 },
  { points: [[-4, 56], [20, 60], [30, 82], [56, 74]], delay: 0.1 },
  { points: [[74, 104], [58, 80], [40, 92]], delay: 0.14 },
  { points: [[62, 4], [76, 20], [104, 15]], delay: 0.18 },
  { points: [[-4, 8], [14, 18], [8, 30]], delay: 0.22 },
  { points: [[104, 84], [84, 90], [92, 104]], delay: 0.26 },
];

/** Confetti flung out from the word: direction, distance in vmin, size, color. Spread out first. */
const CONFETTI = [
  { angle: -120, dist: 40, size: 18, color: "#ffd900", spin: -120 },
  { angle: 25, dist: 38, size: 12, color: "#58cc02", spin: 160 },
  { angle: 140, dist: 32, size: 20, color: "#ffe680", spin: -100 },
  { angle: -40, dist: 42, size: 16, color: "#89e219", spin: -180 },
  { angle: -160, dist: 34, size: 14, color: "#89e219", spin: 140 },
  { angle: 60, dist: 34, size: 18, color: "#ffd900", spin: -140 },
  { angle: -80, dist: 30, size: 12, color: "#58cc02", spin: 200 },
  { angle: -10, dist: 30, size: 22, color: "#ffe680", spin: 90 },
  { angle: 100, dist: 40, size: 14, color: "#89e219", spin: 220 },
  { angle: 175, dist: 40, size: 12, color: "#58cc02", spin: 120 },
  { angle: -140, dist: 46, size: 10, color: "#ffd900", spin: 260 },
  { angle: -60, dist: 48, size: 13, color: "#58cc02", spin: -220 },
  { angle: 80, dist: 46, size: 11, color: "#ffe680", spin: 180 },
  { angle: 160, dist: 48, size: 15, color: "#89e219", spin: -160 },
];

/** Smoke puffs along the sheet edge: center in percent of the width, share of the rise, delay. */
const PUFFS = [
  { x: 0, rise: 0.8, delay: 0.04 },
  { x: 12, rise: 1, delay: 0 },
  { x: 25, rise: 0.7, delay: 0.08 },
  { x: 37, rise: 0.95, delay: 0.03 },
  { x: 50, rise: 0.75, delay: 0.1 },
  { x: 62, rise: 1, delay: 0.02 },
  { x: 75, rise: 0.8, delay: 0.07 },
  { x: 88, rise: 0.95, delay: 0.01 },
  { x: 100, rise: 0.75, delay: 0.09 },
];

/** Wisps that break off the smoke and drift up: x in percent, size in px. */
const WISPS = [
  { x: 18, size: 22, delay: 0.25 },
  { x: 71, size: 18, delay: 0.3 },
  { x: 44, size: 26, delay: 0.38 },
  { x: 90, size: 16, delay: 0.34 },
  { x: 6, size: 18, delay: 0.42 },
  { x: 57, size: 14, delay: 0.46 },
  { x: 31, size: 16, delay: 0.5 },
  { x: 82, size: 24, delay: 0.4 },
];

/** SUPER! at 5 in a row, KLASSE! at 10 and stronger from 15, PERFEKT! for a flawless part. */
export function burstLevel(count: number, perfect: boolean): Level {
  if (perfect) return LEVELS[3];
  return LEVELS[Math.min(Math.max(1, Math.floor(count / 5)), 3) - 1] as Level;
}

/** A bolt in screen pixels. A stretched viewBox would skew the band width and break the draw-in dash. */
function boltPath(points: [number, number][], width: number, height: number): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${(x / 100) * width} ${(y / 100) * height}`)
    .join(" ");
}

/**
 * Smoke rising off the top edge of the bottom sheet, in the sheet's own color.
 * Follows the sheet while it springs in, and clears when the sheet leaves.
 */
function SheetSmoke({ level }: { level: Level }) {
  const edgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const edge = edgeRef.current;
      const sheet =
        document.querySelector<HTMLElement>('[data-session-dock][role="status"]') ??
        document.querySelector<HTMLElement>("[data-session-dock]");
      if (edge) {
        if (sheet) {
          edge.style.bottom = `${window.innerHeight - sheet.getBoundingClientRect().top}px`;
          edge.style.color = getComputedStyle(sheet).backgroundColor;
          edge.style.visibility = "visible";
        } else {
          edge.style.visibility = "hidden";
        }
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, []);

  const puff = level.smoke * 2.4;
  const hold = (level.ms - 450) / level.ms;

  return (
    // Clipped at the sheet edge, so the smoke never covers the sheet's own text.
    <div ref={edgeRef} className="invisible absolute inset-x-0 bottom-0 h-[50vh] overflow-hidden">
      {PUFFS.map((spot) => (
        <motion.span
          key={spot.x}
          className="absolute rounded-full bg-current"
          style={{
            left: `${spot.x}%`,
            bottom: -puff,
            width: puff,
            height: puff,
            marginLeft: -puff / 2,
          }}
          initial={{ y: 0 }}
          animate={{ y: [0, -level.smoke * spot.rise, -level.smoke * spot.rise * 0.9, 0] }}
          transition={{
            duration: level.ms / 1000,
            delay: spot.delay,
            times: [0, 0.22, hold, 1],
            ease: "easeOut",
          }}
        />
      ))}
      {WISPS.slice(0, level.wisps).map((wisp) => (
        <motion.span
          key={wisp.x}
          className="absolute rounded-full bg-current"
          style={{
            left: `${wisp.x}%`,
            bottom: -wisp.size,
            width: wisp.size,
            height: wisp.size,
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{
            y: -(level.smoke + wisp.size * 3),
            scale: [0.6, 1.3],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 1, delay: wisp.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/**
 * Full-screen word flash for an in-a-row milestone or a flawless part. It sits
 * above the feedback sheet but never takes clicks, and calls `onDone` when it
 * has played. Stronger stages get more lightning, confetti and smoke.
 */
export function ComboBurst({
  count,
  perfect = false,
  onDone,
}: {
  count: number;
  /** Every card in the part right on the first try. */
  perfect?: boolean;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const level = burstLevel(count, perfect);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // One timer per burst. The session re-renders while it plays, and that must not restart it.
  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), reduceMotion ? 1200 : level.ms);
    return () => window.clearTimeout(timer);
  }, [reduceMotion, level.ms]);

  if (typeof document === "undefined") return null;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const boltWidth = Math.min(60, Math.max(26, width * 0.08)) * level.boltScale;
  const seconds = level.ms / 1000;
  const wordStyle = {
    fontFamily: "var(--font-fredoka), Fredoka, sans-serif",
    fontSize: "clamp(56px, 17vw, 120px)",
    lineHeight: 1,
    letterSpacing: "0.01em",
  } as const;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center overflow-hidden"
      aria-hidden="true"
      data-combo-burst=""
    >
      {reduceMotion ? null : (
        <>
          {level.flash > 0 ? (
            <motion.div
              className="absolute inset-0 bg-[#fff6c2]"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, level.flash, 0] }}
              transition={{ duration: 0.55, times: [0, 0.2, 1], ease: "easeOut" }}
            />
          ) : null}

          <SheetSmoke level={level} />

          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
            {BOLTS.slice(0, level.bolts).map((bolt) => (
              <motion.path
                key={bolt.delay}
                d={boltPath(bolt.points, width, height)}
                fill="none"
                stroke="#ffe066"
                strokeWidth={boltWidth}
                strokeLinejoin="miter"
                strokeLinecap="butt"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: [0, 1, 1], opacity: [0, level.boltOpacity, 0] }}
                transition={{
                  duration: seconds - 0.25,
                  delay: bolt.delay,
                  times: [0, 0.22, 1],
                  ease: "easeOut",
                }}
              />
            ))}
          </svg>

          {CONFETTI.slice(0, level.confetti).map((piece) => {
            const rad = (piece.angle * Math.PI) / 180;
            return (
              <motion.span
                key={piece.angle}
                className="absolute left-1/2 top-1/2 rounded-[3px]"
                style={{
                  width: piece.size,
                  height: piece.size,
                  marginLeft: -piece.size / 2,
                  marginTop: -piece.size / 2,
                  backgroundColor: piece.color,
                }}
                initial={{ x: 0, y: 0, scale: 0, rotate: 45, opacity: 1 }}
                animate={{
                  x: `${Math.cos(rad) * piece.dist}vmin`,
                  y: `${Math.sin(rad) * piece.dist}vmin`,
                  scale: [0, 1.15, 1],
                  rotate: 45 + piece.spin,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1.25, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              />
            );
          })}
        </>
      )}

      <motion.div
        className="relative select-none whitespace-nowrap"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: -10, skewX: -10 }}
        animate={
          reduceMotion
            ? { opacity: [0, 1, 1, 0] }
            : {
                opacity: [0, 1, 1, 0],
                scale: [0.3, 1.18, 1, 1.08],
                rotate: [-10, -5, -5, -5],
                skewX: -10,
                ...(level.shake ? { x: [0, -8, 8, -6, 6, -3, 0] } : {}),
              }
        }
        transition={{
          duration: reduceMotion ? 1.2 : seconds - 0.15,
          times: reduceMotion ? [0, 0.15, 0.8, 1] : [0, 0.18, 0.78, 1],
          ease: "easeOut",
          ...(level.shake ? { x: { duration: 0.5, delay: 0.2, ease: "easeInOut" } } : {}),
        }}
      >
        {/* Shadow, outline, then a plain white fill on top, so no browser strokes over the letters. */}
        <span
          className="absolute inset-0 block font-bold text-[#e07800]"
          style={{
            ...wordStyle,
            WebkitTextStroke: "clamp(10px, 3vw, 18px) #e07800",
            transform: "translateY(clamp(5px, 1.4vw, 9px))",
          }}
        >
          {level.word}
        </span>
        <span
          className="relative block font-bold text-[#ff9600]"
          style={{ ...wordStyle, WebkitTextStroke: "clamp(10px, 3vw, 18px) #ff9600" }}
        >
          {level.word}
        </span>
        <span className="absolute inset-0 block font-bold text-white" style={wordStyle}>
          {level.word}
        </span>
      </motion.div>
    </div>,
    document.body,
  );
}
