"use client";

import { motion, useReducedMotion } from "framer-motion";

type PinguMood = "cheering" | "oops";

export type ChillPose = "tea" | "balloon";

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
      className="relative h-[148px] w-full"
      initial={reduceMotion ? false : { y: 220, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : POP}
    >
      <div className="absolute bottom-0 left-1/2 flex w-[156px] -translate-x-1/2 justify-center">
        {cheering ? <Cheering /> : <Oops />}
      </div>
      <motion.div
        className="pingu-bubble absolute top-6 left-[calc(50%+82px)]"
        style={{ transformOrigin: "0% 55%" }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.45 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { ...POP, delay: 0.32 }}
      >
        <div className="relative rounded-full bg-white px-3 py-2 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.08),0_4px_12px_-2px_rgba(0,0,0,0.03)]">
          <div
            className="absolute top-1/2 -left-[7px] h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[3px] bg-white"
            aria-hidden="true"
          />
          <div className="font-headline-sm relative text-[20px] leading-6 font-bold tracking-tight text-[#1d1d1f]">
            {cheering ? "Tuyệt!" : "Ôi!"}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Quiet pose for the empty side of a lesson-path bend. */
export function ChillPingu({ pose }: { pose: ChillPose }) {
  return pose === "tea" ? <BubbleTea /> : <Balloon />;
}

function BubbleTea() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin happily sipping bubble tea"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <path
        className="pingu-chill-heart"
        d="M190 66 C190 59 199 59 199 66 C199 59 208 59 208 66 C208 73 199 77 199 80 C199 77 190 73 190 66 Z"
        fill="#FF8FA3"
      />
      <g className="pingu-chill-sip">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse className="pingu-chill-cheek" cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.5" />
        <ellipse className="pingu-chill-cheek" cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.5" />
        <path d="M82 122 Q92 110 102 122" stroke="#141B2E" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path d="M138 122 Q148 110 158 122" stroke="#141B2E" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path d="M107 134 Q120 124 133 134 Q131 150 120 152 Q109 150 107 134 Z" fill="#FF9500" />
        <path d="M113 136 Q120 131 127 136" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M128 166 L168 166 L163 210 Q162 215 157 215 L139 215 Q134 215 133 210 Z" fill="#E9C49A" />
        <path d="M130 180 L166 180 L163 210 Q162 215 157 215 L139 215 Q134 215 133 210 Z" fill="#D9A873" />
        <circle cx="141" cy="206" r="4" fill="#5A3A22" />
        <circle cx="151" cy="208" r="4" fill="#5A3A22" />
        <circle cx="146" cy="198" r="4" fill="#5A3A22" />
        <circle cx="157" cy="200" r="4" fill="#5A3A22" />
        <rect x="124" y="159" width="48" height="9" rx="4.5" fill="#0071E3" />
        <path d="M148 162 L123 148" stroke="#FF8FA3" strokeWidth="6" strokeLinecap="round" />
        <g className="pingu-fl-r" style={{ transform: "rotate(34deg)" }}>
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
      </g>
    </svg>
  );
}

function Balloon() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin holding a pink balloon"
    >
      <ellipse className="pingu-chill-shadow" cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-chill-tiptoe">
        <g className="pingu-chill-balloon">
          <path d="M24 58 Q30 72 8 84" stroke="#86868B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M18 56 L30 56 L24 48 Z" fill="#E96C87" />
          <ellipse cx="24" cy="22" rx="27" ry="31" fill="#FF8FA3" />
          <ellipse cx="14" cy="10" rx="7" ry="10" fill="#FFC2CE" />
        </g>
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <g className="pingu-fl-l" style={{ transform: "rotate(108deg)" }}>
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.55" />
        <ellipse cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.55" />
        <g className="pingu-blink">
          <ellipse cx="90" cy="116" rx="9.5" ry="11.5" fill="#141B2E" />
          <ellipse cx="146" cy="116" rx="9.5" ry="11.5" fill="#141B2E" />
          <circle cx="87" cy="110" r="3.8" fill="#FFFFFF" />
          <circle cx="143" cy="110" r="3.8" fill="#FFFFFF" />
          <circle cx="93" cy="120" r="1.7" fill="#FFFFFF" />
          <circle cx="149" cy="120" r="1.7" fill="#FFFFFF" />
        </g>
        <ellipse cx="120" cy="150" rx="7" ry="5.5" fill="#D9423A" />
        <path d="M107 132 Q120 122 133 132 Q131 145 120 146 Q109 145 107 132 Z" fill="#FF9500" />
        <path d="M113 134 Q120 129 127 134" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
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
