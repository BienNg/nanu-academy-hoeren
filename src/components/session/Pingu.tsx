"use client";

import { motion, useReducedMotion } from "framer-motion";

type PinguMood = "cheering" | "oops";

const POP = { type: "spring" as const, stiffness: 460, damping: 16, mass: 0.72 };

/**
 * Pingu on a finished run. He rises in from below, then holds the pose from
 * the mascot sheet: a hop for a passed study or practice run, a shake for a
 * practice run that ran out of hearts.
 */
export function Pingu({ mood }: { mood: PinguMood }) {
  const reduceMotion = useReducedMotion();
  const cheering = mood === "cheering";

  return (
    <motion.div
      className="relative h-[148px] w-[210px]"
      initial={reduceMotion ? false : { y: 220, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : POP}
    >
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        {cheering ? <Cheering /> : <Oops />}
      </div>
      <motion.div
        className="pingu-bubble absolute top-3 right-0"
        style={{ transformOrigin: "18% 100%" }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.45 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { ...POP, delay: 0.32 }}
      >
        <div className="relative rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.08),0_4px_12px_-2px_rgba(0,0,0,0.03)]">
          <div
            className="absolute bottom-[-6px] left-[18px] h-4 w-4 rotate-45 rounded-[3px] bg-white"
            aria-hidden="true"
          />
          <div className="font-headline-sm relative text-[22px] leading-7 font-bold tracking-tight text-[#1d1d1f]">
            {cheering ? "Tuyệt!" : "Ôi!"}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Cheering() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="156"
      height="162"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Pingu cheering"
    >
      <rect className="pingu-conf" x="24" y="30" width="8" height="12" rx="2" fill="#0071E3" style={{ animationDelay: "0.45s" }} />
      <rect className="pingu-conf" x="62" y="2" width="8" height="12" rx="2" fill="#34C759" style={{ animationDelay: "0.85s" }} />
      <rect className="pingu-conf" x="104" y="-14" width="8" height="12" rx="2" fill="#FF9500" style={{ animationDelay: "1.35s" }} />
      <rect className="pingu-conf" x="150" y="-6" width="8" height="12" rx="2" fill="#FF8FA3" style={{ animationDelay: "0.65s" }} />
      <rect className="pingu-conf" x="196" y="16" width="8" height="12" rx="2" fill="#0071E3" style={{ animationDelay: "1.55s" }} />
      <rect className="pingu-conf" x="224" y="46" width="8" height="12" rx="2" fill="#34C759" style={{ animationDelay: "1.05s" }} />
      <ellipse className="pingu-shadow-hop" cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-hop">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <g className="pingu-fl-l pingu-up-l">
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <g className="pingu-fl-r pingu-up-r">
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.6" />
        <ellipse cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.6" />
        <path d="M82 122 Q92 106 102 122" stroke="#141B2E" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path d="M138 122 Q148 106 158 122" stroke="#141B2E" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <ellipse cx="120" cy="150" rx="9" ry="7" fill="#D9423A" />
        <path d="M107 132 Q120 122 133 132 Q131 145 120 146 Q109 145 107 132 Z" fill="#FF9500" />
        <path d="M113 134 Q120 129 127 134" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

function Oops() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="156"
      height="162"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Pingu looking worried"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-shake">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <g className="pingu-fl-l pingu-oops-l">
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <g className="pingu-fl-r pingu-oops-r">
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.4" />
        <ellipse cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.4" />
        <g className="pingu-blink">
          <ellipse cx="92" cy="119" rx="10.5" ry="13" fill="#141B2E" />
          <ellipse cx="148" cy="119" rx="10.5" ry="13" fill="#141B2E" />
          <circle cx="96" cy="113" r="4" fill="#FFFFFF" />
          <circle cx="152" cy="113" r="4" fill="#FFFFFF" />
          <circle cx="89" cy="125" r="1.8" fill="#FFFFFF" />
          <circle cx="145" cy="125" r="1.8" fill="#FFFFFF" />
        </g>
        <path d="M78 98 Q90 92 104 88" stroke="#232F4B" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M136 88 Q150 92 162 98" stroke="#232F4B" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <ellipse cx="120" cy="152" rx="6" ry="7" fill="#D9423A" />
        <path d="M107 132 Q120 122 133 132 Q131 145 120 146 Q109 145 107 132 Z" fill="#FF9500" />
        <path d="M113 134 Q120 129 127 134" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path className="pingu-drop" d="M170 78 Q179 92 170 100 Q161 92 170 78 Z" fill="#7DB8F5" />
      </g>
    </svg>
  );
}
