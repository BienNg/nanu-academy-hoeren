/**
 * Colors and drawings of the grammar world. The world is purple, so it
 * never reads as the blue Lektion path.
 */

/** Path variables, so the shared start card and rings pick up the purple. */
export const WORLD_VARS = {
  "--path-accent": "#7c3aed",
  "--path-accent-deep": "#5b21b6",
  "--path-accent-light": "#8b5cf6",
  "--path-guide": "#a78bfa",
  "--path-node": "#8b5cf6",
  "--path-node-lip": "#6d28d9",
} as const;

export const WORLD_ACCENT = "#7c3aed";
export const WORLD_ACCENT_DEEP = "#5b21b6";
export const WORLD_TRACK = "#e4dcf7";

/**
 * Practice node glyph: two puzzle pieces clicking together, the way a subject
 * and its verb ending fit. Every practice node of every stage uses it.
 */
export function GrammarPieceIcon({ onWhite, className }: { onWhite: boolean; className?: string }) {
  const back = onWhite ? "#6d28d9" : "#d8c8fb";
  const front = onWhite ? "#8b5cf6" : "#ffffff";
  const piece = onWhite ? "#ffffff" : "#7c3aed";
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <rect x="6" y="15" width="52" height="40" rx="11" fill={back} />
      <rect x="6" y="10" width="52" height="40" rx="11" fill={front} />
      <path
        d="M14 19 H25 Q25 14 29.5 14 Q34 14 34 19 V22 H31 Q27 22 27 26.5 Q27 31 31 31 H34 V41 H14 Z"
        fill={piece}
      />
      <path
        d="M37 19 H50 V41 H37 V35 H40 Q44 35 44 30.5 Q44 26 40 26 H37 Z"
        fill="#FFC83D"
      />
    </svg>
  );
}

/** Review node glyph: a looping arrow around a star. */
export function GrammarReviewIcon({ onWhite, className }: { onWhite: boolean; className?: string }) {
  const ring = onWhite ? "#7c3aed" : "#ffffff";
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <path
        d="M50 32 A18 18 0 1 1 44.7 19.3"
        stroke={ring}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M46 9 L48 22 L35 21 Z" fill={ring} />
      <path
        d="M32 22.5 L34.9 28.6 L41.5 29.4 L36.6 34 L37.9 40.6 L32 37.3 L26.1 40.6 L27.4 34 L22.5 29.4 L29.1 28.6 Z"
        fill="#FFC83D"
        stroke={onWhite ? "#b45309" : "#FFC83D"}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The portal's glyph: a peak with a star over it. */
export function PortalMountain({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <path d="M4 40 L19 15 L26 26 L31 19 L44 40 Z" fill="#ffffff" />
      <path d="M19 15 L23.5 22.5 L20.5 21 L17.5 23.5 L15.6 20.7 Z" fill="#ddd0fb" />
      <path
        d="M34 5 L35.6 9.2 L40 9.6 L36.7 12.5 L37.7 16.8 L34 14.5 L30.3 16.8 L31.3 12.5 L28 9.6 L32.4 9.2 Z"
        fill="#FFC83D"
      />
    </svg>
  );
}

/** A five-point star, for the tab counts and the flight into the portal. */
export function StarGlyph({ className, fill = "#FFC83D" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 2.6 L14.8 8.4 L21.2 9.2 L16.5 13.6 L17.7 20 L12 16.9 L6.3 20 L7.5 13.6 L2.8 9.2 L9.2 8.4 Z"
        fill={fill}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.25A4.75 4.75 0 0 0 7.25 7v2.25H6.5A2.25 2.25 0 0 0 4.25 11.5v8A2.25 2.25 0 0 0 6.5 21.75h11a2.25 2.25 0 0 0 2.25-2.25v-8A2.25 2.25 0 0 0 17.5 9.25h-.75V7A4.75 4.75 0 0 0 12 2.25Zm3.25 7V7a3.25 3.25 0 0 0-6.5 0v2.25h6.5Z"
      />
    </svg>
  );
}

/**
 * Far ridges behind the path. `grey` drains them for a locked tab.
 *
 * The viewBox is much wider than it is tall, and both ridges leave through
 * the top corners. A wide window then crops the sides and still paints
 * mountains to the left and right edges, instead of a narrow range with
 * empty gutters.
 */
export function MountainBackdrop({ grey = false }: { grey?: boolean }) {
  const far = grey ? "#e5e7eb" : "#e9defd";
  const near = grey ? "#d1d5db" : "#ddcdfb";
  const snow = grey ? "#f3f4f6" : "#f7f2ff";
  return (
    <svg
      viewBox="0 0 2000 420"
      preserveAspectRatio="xMidYMax slice"
      className="block h-full w-full"
      aria-hidden="true"
    >
      <path
        d="M0 420 L0 48 L160 18 L300 72 L440 22 L580 68 L740 16 L880 78 L1000 12 L1120 70 L1260 20 L1420 74 L1580 26 L1740 66 L1880 18 L2000 52 L2000 420 Z"
        fill={far}
      />
      <path d="M1000 12 L1022 42 L1010 38 L998 48 L986 40 L978 42 Z" fill={snow} />
      <path
        d="M0 420 L0 168 L180 128 L380 196 L560 140 L760 188 L960 132 L1160 190 L1360 138 L1560 198 L1760 146 L2000 176 L2000 420 Z"
        fill={near}
      />
    </svg>
  );
}

/** The peak at the top of a tab, with a flag once the tab is climbed. */
export function Summit({ flag, grey = false }: { flag: boolean; grey?: boolean }) {
  const rock = grey ? "#cbd5e1" : "#a78bfa";
  const shade = grey ? "#94a3b8" : "#7c3aed";
  return (
    <svg viewBox="0 -14 200 134" className="h-[134px] w-[200px]" aria-hidden="true">
      <path d="M10 118 L100 14 L190 118 Z" fill={rock} />
      <path d="M100 14 L190 118 L120 118 L112 70 Z" fill={shade} opacity="0.55" />
      <path d="M100 14 L118 35 L108 32 L100 40 L91 31 L82 35 Z" fill="#ffffff" />
      {flag ? (
        <g>
          <rect x="99" y="-6" width="3" height="24" rx="1.5" fill="#1e1b4b" />
          <path d="M102 -5 L124 1 L102 8 Z" fill="#FFC83D" />
        </g>
      ) : null}
    </svg>
  );
}
