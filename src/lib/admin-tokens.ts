/**
 * Admin-only design tokens from the Lumina Lexicon Admin guide. They live under
 * an `admin` namespace (`bg-admin-canvas`, `rounded-admin-card`, …) so the
 * learner app's tokens in ./tokens.ts stay untouched.
 */

/** Hex values for places Tailwind classes cannot reach, such as Recharts props. */
export const ADMIN_COLORS = {
  canvas: "#f8fafc",
  card: "#ffffff",
  subtle: "#f1f5f9",
  hairline: "#e2e8f0",
  border: "#cbd5e1",
  ink: "#0f172a",
  inkMuted: "#475569",
  inkSubtle: "#64748b",
  inkFaint: "#94a3b8",
  cobalt: "#1e40af",
  cobaltStrong: "#00288e",
  cobaltWash: "#eff6ff",
  /** Engagement: streaks, retention, active days. */
  ember: "#ea580c",
  emberWash: "#fff7ed",
  /** Achievement: XP, CEFR levels, badges, leaderboards. */
  amber: "#d97706",
  amberWash: "#fffbeb",
  /** Curriculum: lessons, passes, completion. */
  emerald: "#059669",
  emeraldWash: "#ecfdf5",
  /** Media: videos, listening practice, clips. */
  violet: "#7c3aed",
  violetWash: "#f5f3ff",
  /** Second media series when videos and practice share a chart. */
  violetSoft: "#a78bfa",
  /** Alerts: drop-off, failures, missing files. */
  crimson: "#dc2626",
  crimsonWash: "#fef2f2",
  crimsonBorder: "#fca5a5",
  /** Chart gridlines and axis ticks. */
  grid: "#e2e8f0",
  axis: "#64748b",
} as const;

export type AdminDomain = "cobalt" | "ember" | "amber" | "emerald" | "violet" | "crimson";

const c = ADMIN_COLORS;

export const adminColors = {
  admin: {
    canvas: c.canvas,
    card: c.card,
    subtle: c.subtle,
    hairline: c.hairline,
    border: c.border,
    ink: {
      DEFAULT: c.ink,
      muted: c.inkMuted,
      subtle: c.inkSubtle,
      faint: c.inkFaint,
    },
    /** `tint` marks selected rows; `hover` deepens a cobalt wash under the pointer. */
    cobalt: {
      DEFAULT: c.cobalt,
      strong: c.cobaltStrong,
      wash: c.cobaltWash,
      ink: c.cobalt,
      tint: "#f5f8ff",
      hover: "#dbeafe",
    },
    ember: { DEFAULT: c.ember, wash: c.emberWash, ink: "#9a3412" },
    amber: { DEFAULT: c.amber, wash: c.amberWash, ink: "#92400e" },
    emerald: { DEFAULT: c.emerald, wash: c.emeraldWash, ink: "#065f46" },
    violet: { DEFAULT: c.violet, wash: c.violetWash, ink: "#5b21b6", soft: c.violetSoft },
    crimson: {
      DEFAULT: c.crimson,
      wash: c.crimsonWash,
      ink: "#b91c1c",
      border: c.crimsonBorder,
      hover: "#fee2e2",
    },
  },
} as const;

export const adminBorderRadius = {
  /** Badges, chips, CEFR tags. */
  "admin-badge": "0.25rem",
  /** Buttons, inputs, nav rows, segmented controls. */
  "admin-control": "0.375rem",
  /** Cards, chart panels, drawers. */
  "admin-card": "0.5rem",
} as const;

export const adminBoxShadow = {
  "admin-card": "0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)",
  "admin-drawer": "-8px 0 24px -4px rgba(15, 23, 42, 0.08), -4px 0 8px -4px rgba(15, 23, 42, 0.03)",
  "admin-pop": "0 8px 24px -4px rgba(15, 23, 42, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.06)",
  "admin-focus": "0 0 0 1px #1e40af, 0 0 0 3px rgba(30, 64, 175, 0.1)",
} as const;

/** Stacks; the next/font variables are set on the admin shell root. */
export const adminFontFamily = {
  "admin-display": ["var(--font-plus-jakarta-sans)", "Plus Jakarta Sans", "sans-serif"],
  "admin-sans": ["var(--font-inter)", "Inter", "sans-serif"],
  "admin-mono": ["var(--font-jetbrains-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
} as const;

export const adminFontSize = {
  "admin-display": ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "700" }],
  "admin-display-mobile": ["28px", { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" }],
  "admin-headline-lg":["24px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "600" }],
  "admin-headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
  "admin-headline-sm": ["16px", { lineHeight: "24px", letterSpacing: "-0.005em", fontWeight: "600" }],
  "admin-body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
  "admin-body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
  "admin-body-sm": ["13px", { lineHeight: "18px", fontWeight: "400" }],
  "admin-label-md": ["13px", { lineHeight: "16px", fontWeight: "500" }],
  "admin-label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "600" }],
  "admin-metric": ["30px", { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" }],
  "admin-mono": ["12px", { lineHeight: "16px", fontWeight: "500" }],
} as const;
