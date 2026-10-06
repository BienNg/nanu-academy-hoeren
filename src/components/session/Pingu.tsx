"use client";

import { motion, useReducedMotion } from "framer-motion";

type PinguMood = "cheering" | "oops";

/** Poses that can stand beside a Lektion on the path. */
export const PATH_POSES = [
  "tea",
  "balloon",
  "pickleball",
  "pingpong",
  "cups",
  "pen",
  "cube",
] as const;

export type PathPose = (typeof PATH_POSES)[number];

export type ChillPose = PathPose;

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
        {cheering ? <CheeringPingu /> : <Oops />}
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

/** One pose for the empty side of a Lektion. Locked trails are drained of color. */
export function ChillPingu({ pose, locked = false }: { pose: PathPose; locked?: boolean }) {
  const art =
    pose === "tea" ? (
      <BubbleTea />
    ) : pose === "balloon" ? (
      <Balloon />
    ) : pose === "pickleball" ? (
      <Pickleball />
    ) : pose === "pingpong" ? (
      <TableTennis />
    ) : pose === "cups" ? (
      <CupStack />
    ) : pose === "pen" ? (
      <PenSpin />
    ) : (
      <PuzzleCube />
    );
  return <div className={locked ? "pingu-locked" : undefined}>{art}</div>;
}

/** Glasses-and-book pose from the chill sheet, for the vocabulary sheet. */
export function ReadingPingu({ size = 168 }: { size?: number }) {
  const height = Math.round(size * (250 / 240));
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width={size}
      height={height}
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Pingu đang đọc sách"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-chill-breathe">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path
          d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32"
          stroke="#232F4B"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="72" cy="142" rx="9" ry="6" fill="#FF8FA3" opacity="0.5" />
        <ellipse cx="168" cy="142" rx="9" ry="6" fill="#FF8FA3" opacity="0.5" />
        <g className="pingu-blink">
          <g className="pingu-chill-scan">
            <ellipse cx="92" cy="122" rx="8" ry="10" fill="#141B2E" />
            <ellipse cx="148" cy="122" rx="8" ry="10" fill="#141B2E" />
            <circle cx="93" cy="125" r="3" fill="#FFFFFF" />
            <circle cx="149" cy="125" r="3" fill="#FFFFFF" />
          </g>
        </g>
        <circle cx="92" cy="121" r="17" stroke="#FF9500" strokeWidth="3.5" fill="none" />
        <circle cx="148" cy="121" r="17" stroke="#FF9500" strokeWidth="3.5" fill="none" />
        <path
          d="M109 119 Q120 113 131 119"
          stroke="#FF9500"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M107 138 Q120 128 133 138 Q131 152 120 154 Q109 152 107 138 Z" fill="#FF9500" />
        <path d="M113 140 Q120 135 127 140" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <g className="pingu-chill-book">
          <rect x="68" y="162" width="104" height="8" rx="3" fill="#DCE5F2" />
          <rect x="64" y="166" width="112" height="50" rx="7" fill="#0071E3" />
          <path d="M120 166 V216" stroke="#0A4FA0" strokeWidth="4" />
          <rect x="130" y="178" width="36" height="24" rx="6" fill="#FFFFFF" />
          <text
            x="148"
            y="196"
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="#0059B5"
            style={{ fontFamily: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif" }}
          >
            A1
          </text>
          <path d="M76 180 H108 M76 190 H100" stroke="#6DB2F7" strokeWidth="3.5" strokeLinecap="round" />
        </g>
        <g className="pingu-fl-l" style={{ transform: "rotate(-30deg)" }}>
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <g className="pingu-fl-r" style={{ transform: "rotate(30deg)" }}>
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
      </g>
    </svg>
  );
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

function Pickleball() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin in a headband swinging a pickleball paddle"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-hobby-lean">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <g className="pingu-fl-l pingu-hobby-sway" style={{ transform: "rotate(8deg)" }}>
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M46 92 Q120 56 194 92" stroke="#FFFFFF" strokeWidth="10" fill="none" />
        <path d="M46 92 Q120 56 194 92" stroke="#FF8FA3" strokeWidth="3" fill="none" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.6" />
        <ellipse cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.6" />
        <g className="pingu-blink">
          <ellipse cx="94" cy="117" rx="9" ry="11" fill="#141B2E" />
          <ellipse cx="150" cy="117" rx="9" ry="11" fill="#141B2E" />
          <circle cx="98" cy="112" r="3.4" fill="#FFFFFF" />
          <circle cx="154" cy="112" r="3.4" fill="#FFFFFF" />
          <circle cx="92" cy="122" r="1.6" fill="#FFFFFF" />
          <circle cx="148" cy="122" r="1.6" fill="#FFFFFF" />
        </g>
        <ellipse cx="120" cy="150" rx="7" ry="5.5" fill="#D9423A" />
        <path d="M107 132 Q120 122 133 132 Q131 145 120 146 Q109 145 107 132 Z" fill="#FF9500" />
        <path d="M113 134 Q120 129 127 134" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <g className="pingu-fl-r pingu-hobby-swing" style={{ transform: "rotate(-120deg)" }}>
          <path d="M210 180 L217 197" stroke="#FF9500" strokeWidth="9" strokeLinecap="round" />
          <rect x="201" y="192" width="54" height="64" rx="20" fill="#0071E3" stroke="#FFFFFF" strokeWidth="3" transform="rotate(-22.7 228 224)" />
          <rect x="213" y="204" width="30" height="40" rx="11" fill="#3F92EC" transform="rotate(-22.7 228 224)" />
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
      </g>
      <g className="pingu-hobby-pball">
        <circle cx="246" cy="40" r="10" fill="#D9E63A" />
        <circle cx="242" cy="37" r="1.8" fill="#9AA61F" />
        <circle cx="249" cy="36" r="1.8" fill="#9AA61F" />
        <circle cx="245" cy="43" r="1.8" fill="#9AA61F" />
        <circle cx="251" cy="43" r="1.8" fill="#9AA61F" />
      </g>
    </svg>
  );
}

function TableTennis() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin bouncing a table tennis ball on a red paddle"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-chill-breathe">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.5" />
        <ellipse cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.5" />
        <g className="pingu-blink">
          <g className="pingu-hobby-ttlook">
            <ellipse cx="89" cy="117" rx="9" ry="11" fill="#141B2E" />
            <ellipse cx="145" cy="117" rx="9" ry="11" fill="#141B2E" />
            <circle cx="85.5" cy="112" r="3.4" fill="#FFFFFF" />
            <circle cx="141.5" cy="112" r="3.4" fill="#FFFFFF" />
            <circle cx="92" cy="122" r="1.6" fill="#FFFFFF" />
            <circle cx="148" cy="122" r="1.6" fill="#FFFFFF" />
          </g>
        </g>
        <path d="M107 134 Q120 124 133 134 Q131 150 120 152 Q109 150 107 134 Z" fill="#FF9500" />
        <path d="M113 136 Q120 131 127 136" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>
      <g className="pingu-hobby-ttpad">
        <rect x="-6" y="157" width="22" height="8" rx="4" fill="#D9A873" />
        <ellipse cx="-24" cy="165" rx="25" ry="9" fill="#B93238" />
        <ellipse cx="-24" cy="160" rx="25" ry="9" fill="#E5484D" />
        <g className="pingu-fl-l" style={{ transform: "rotate(35deg)" }}>
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
      </g>
      <circle className="pingu-hobby-ttball" cx="-26" cy="144" r="7.5" fill="#FF9500" />
    </svg>
  );
}

function CupStack() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin stacking a pyramid of cups"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <ellipse cx="88" cy="228" rx="22" ry="10" fill="#FF9500" />
      <ellipse cx="152" cy="228" rx="22" ry="10" fill="#FF9500" />
      <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
      <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
      <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
      <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="72" cy="140" rx="9" ry="6" fill="#FF8FA3" opacity="0.5" />
      <ellipse cx="168" cy="140" rx="9" ry="6" fill="#FF8FA3" opacity="0.5" />
      <g className="pingu-blink">
        <ellipse cx="92" cy="120" rx="8.5" ry="10.5" fill="#141B2E" />
        <ellipse cx="148" cy="120" rx="8.5" ry="10.5" fill="#141B2E" />
        <circle cx="94" cy="124" r="3.2" fill="#FFFFFF" />
        <circle cx="146" cy="124" r="3.2" fill="#FFFFFF" />
      </g>
      <path d="M80 101 Q91 99 103 104 M137 104 Q149 99 160 101" stroke="#232F4B" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M107 134 Q120 124 133 134 Q131 148 120 150 Q109 148 107 134 Z" fill="#FF9500" />
      <path d="M113 136 Q120 131 127 136" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M82 210 H98 L102 236 H78 Z" fill="#0071E3" stroke="#0071E3" strokeWidth="4" strokeLinejoin="round" />
      <path d="M112 210 H128 L132 236 H108 Z" fill="#FF9500" stroke="#FF9500" strokeWidth="4" strokeLinejoin="round" />
      <path d="M142 210 H158 L162 236 H138 Z" fill="#FF8FA3" stroke="#FF8FA3" strokeWidth="4" strokeLinejoin="round" />
      <path d="M78 232 H102 M108 232 H132 M138 232 H162" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
      <path d="M97 184 H113 L117 208 H93 Z" fill="#FF8FA3" stroke="#FF8FA3" strokeWidth="4" strokeLinejoin="round" />
      <path d="M127 184 H143 L147 208 H123 Z" fill="#0071E3" stroke="#0071E3" strokeWidth="4" strokeLinejoin="round" />
      <path d="M93 204 H117 M123 204 H147" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
      <g className="pingu-hobby-cuplift">
        <path d="M112 158 H128 L132 182 H108 Z" fill="#FF9500" stroke="#FF9500" strokeWidth="4" strokeLinejoin="round" />
        <path d="M108 178 H132" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
      </g>
      <g className="pingu-fl-l pingu-hobby-hold-l" style={{ transform: "rotate(-70deg)" }}>
        <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
      </g>
      <g className="pingu-fl-r pingu-hobby-hold-r" style={{ transform: "rotate(70deg)" }}>
        <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
      </g>
    </svg>
  );
}

function PenSpin() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin with a cool look spinning a pen on its flipper"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-chill-breathe">
        <ellipse cx="92" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="148" cy="228" rx="22" ry="10" fill="#FF9500" />
        <g className="pingu-fl-l" style={{ transform: "rotate(-22deg)" }}>
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <g className="pingu-fl-r" style={{ transform: "rotate(-110deg)" }}>
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="76" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.5" />
        <ellipse cx="164" cy="138" rx="10" ry="7" fill="#FF8FA3" opacity="0.5" />
        <path d="M82 113 H102 Q103 129 92 129 Q81 129 82 113 Z" fill="#141B2E" />
        <path d="M138 113 H158 Q159 129 148 129 Q137 129 138 113 Z" fill="#141B2E" />
        <circle cx="96" cy="118" r="2.8" fill="#FFFFFF" />
        <circle cx="152" cy="118" r="2.8" fill="#FFFFFF" />
        <path d="M80 110 H104 M136 110 H160" stroke="#232F4B" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M107 134 Q120 124 133 134 Q131 150 120 152 Q109 150 107 134 Z" fill="#FF9500" />
        <path d="M113 136 Q120 131 127 136" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <g className="pingu-hobby-spin">
          <rect x="205" y="75.5" width="54" height="7" rx="3.5" fill="#0071E3" />
          <rect x="205" y="75.5" width="13" height="7" rx="3.5" fill="#FF9500" />
          <path d="M258 75.5 L266 79 L258 82.5 Z" fill="#232F4B" stroke="#232F4B" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}

function PuzzleCube() {
  return (
    <svg
      className="pingu"
      viewBox="0 0 240 250"
      width="78"
      height="81"
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Penguin concentrating on a colourful puzzle cube"
    >
      <ellipse cx="120" cy="238" rx="64" ry="8" fill="#1D1D1F" opacity="0.09" />
      <g className="pingu-chill-breathe">
        <ellipse cx="88" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="152" cy="228" rx="22" ry="10" fill="#FF9500" />
        <ellipse cx="120" cy="134" rx="84" ry="92" fill="#232F4B" />
        <ellipse cx="82" cy="78" rx="24" ry="12" fill="#3A4A72" transform="rotate(-28 82 78)" />
        <ellipse cx="120" cy="158" rx="62" ry="66" fill="#FFFFFF" />
        <path d="M110 48 Q106 34 98 30 M122 44 Q122 30 122 22 M134 48 Q140 34 148 32" stroke="#232F4B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <ellipse cx="72" cy="138" rx="9" ry="6" fill="#FF8FA3" opacity="0.5" />
        <ellipse cx="168" cy="138" rx="9" ry="6" fill="#FF8FA3" opacity="0.5" />
        <g className="pingu-blink">
          <g className="pingu-hobby-scan">
            <ellipse cx="92" cy="118" rx="8.5" ry="10.5" fill="#141B2E" />
            <ellipse cx="148" cy="118" rx="8.5" ry="10.5" fill="#141B2E" />
            <circle cx="93" cy="122" r="3.2" fill="#FFFFFF" />
            <circle cx="149" cy="122" r="3.2" fill="#FFFFFF" />
          </g>
        </g>
        <path d="M80 102 Q91 96 103 99 M137 96 Q149 94 160 99" stroke="#232F4B" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M107 131 Q120 121 133 131 Q131 145 120 147 Q109 145 107 131 Z" fill="#FF9500" />
        <path d="M113 133 Q120 128 127 133" stroke="#FFC266" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <g className="pingu-hobby-wiggle">
          <path d="M93 168 L104 157 H158 L147 168 Z" fill="#141B2E" stroke="#141B2E" strokeWidth="4" strokeLinejoin="round" />
          <path d="M147 168 L158 157 V211 L147 222 Z" fill="#141B2E" stroke="#141B2E" strokeWidth="4" strokeLinejoin="round" />
          <path d="M99 165.5 L104.5 160 H117 L111.5 165.5 Z" fill="#FFC83D" />
          <path d="M116 165.5 L121.5 160 H134 L128.5 165.5 Z" fill="#FFC83D" />
          <path d="M133 165.5 L138.5 160 H151 L145.5 165.5 Z" fill="#FFFFFF" />
          <path d="M149.5 170 L155.5 164 V176 L149.5 182 Z" fill="#E5484D" />
          <path d="M149.5 187 L155.5 181 V193 L149.5 199 Z" fill="#E5484D" />
          <path d="M149.5 204 L155.5 198 V210 L149.5 216 Z" fill="#34C759" />
          <rect x="93" y="168" width="54" height="54" rx="6" fill="#141B2E" />
          <rect x="97" y="172" width="14" height="14" rx="3" fill="#0071E3" />
          <rect x="113" y="172" width="14" height="14" rx="3" fill="#FFC83D" />
          <rect x="129" y="172" width="14" height="14" rx="3" fill="#E5484D" />
          <rect x="97" y="188" width="14" height="14" rx="3" fill="#FFFFFF" />
          <rect x="113" y="188" width="14" height="14" rx="3" fill="#0071E3" />
          <rect x="129" y="188" width="14" height="14" rx="3" fill="#FFC83D" />
          <rect x="97" y="204" width="14" height="14" rx="3" fill="#FFC83D" />
          <rect x="113" y="204" width="14" height="14" rx="3" fill="#0071E3" />
          <rect x="129" y="204" width="14" height="14" rx="3" fill="#34C759" />
        </g>
        <g className="pingu-fl-l" style={{ transform: "rotate(-50deg)" }}>
          <path d="M52 126 C26 132 14 160 26 188 C32 196 44 190 50 178 C56 160 56 140 52 126 Z" fill="#232F4B" />
        </g>
        <g className="pingu-fl-r" style={{ transform: "rotate(46deg)" }}>
          <path d="M188 126 C214 132 226 160 214 188 C208 196 196 190 190 178 C184 160 184 140 188 126 Z" fill="#232F4B" />
        </g>
      </g>
    </svg>
  );
}

/** Pingu mid-hop, arms up. The jump test intro also stands him on the jump pad. */
export function CheeringPingu() {
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
