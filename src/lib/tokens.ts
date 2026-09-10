/**
 * Design tokens generated from design-reference/DESIGN.md (Nordic Cupertino).
 * Source of truth for Tailwind theme mapping in tailwind.config.ts.
 */

export const colors = {
  surface: "#fcf8fb",
  "surface-dim": "#dcd9dc",
  "surface-bright": "#fcf8fb",
  "surface-container-lowest": "#ffffff",
  "surface-container-low": "#f6f3f5",
  "surface-container": "#f0edef",
  "surface-container-high": "#eae7ea",
  "surface-container-highest": "#e4e2e4",
  "on-surface": "#1b1b1d",
  "on-surface-variant": "#414753",
  "inverse-surface": "#303032",
  "inverse-on-surface": "#f3f0f2",
  outline: "#717785",
  "outline-variant": "#c1c6d6",
  "surface-tint": "#005cbb",
  primary: "#0059b5",
  "on-primary": "#ffffff",
  "primary-container": "#0071e3",
  "on-primary-container": "#fcfbff",
  "inverse-primary": "#abc7ff",
  secondary: "#5e5e63",
  "on-secondary": "#ffffff",
  "secondary-container": "#e0dfe4",
  "on-secondary-container": "#626267",
  tertiary: "#5a5b60",
  "on-tertiary": "#ffffff",
  "tertiary-container": "#737478",
  "on-tertiary-container": "#fcfbff",
  error: "#ba1a1a",
  "on-error": "#ffffff",
  "error-container": "#ffdad6",
  "on-error-container": "#93000a",
  "primary-fixed": "#d7e2ff",
  "primary-fixed-dim": "#abc7ff",
  "on-primary-fixed": "#001b3f",
  "on-primary-fixed-variant": "#00458f",
  "secondary-fixed": "#e3e2e7",
  "secondary-fixed-dim": "#c7c6cb",
  "on-secondary-fixed": "#1a1b1f",
  "on-secondary-fixed-variant": "#46464b",
  "tertiary-fixed": "#e2e2e7",
  "tertiary-fixed-dim": "#c6c6cb",
  "on-tertiary-fixed": "#1a1c1f",
  "on-tertiary-fixed-variant": "#45474b",
  background: "#fcf8fb",
  "on-background": "#1b1b1d",
  "surface-variant": "#e4e2e4",
} as const;

export const fontFamily = {
  display: ["Plus Jakarta Sans", "sans-serif"],
  "display-mobile": ["Plus Jakarta Sans", "sans-serif"],
  "headline-lg": ["Plus Jakarta Sans", "sans-serif"],
  "headline-md": ["Plus Jakarta Sans", "sans-serif"],
  "headline-sm": ["Plus Jakarta Sans", "sans-serif"],
  "body-lg": ["Be Vietnam Pro", "sans-serif"],
  "body-md": ["Be Vietnam Pro", "sans-serif"],
  "body-sm": ["Be Vietnam Pro", "sans-serif"],
  "label-lg": ["Plus Jakarta Sans", "sans-serif"],
  "label-md": ["Plus Jakarta Sans", "sans-serif"],
  "label-sm": ["Plus Jakarta Sans", "sans-serif"],
  caption: ["Be Vietnam Pro", "sans-serif"],
} as const;

export const fontSize = {
  display: [
    "40px",
    { lineHeight: "48px", letterSpacing: "-0.03em", fontWeight: "700" },
  ],
  "display-mobile": [
    "32px",
    { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" },
  ],
  "headline-lg": [
    "28px",
    { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" },
  ],
  "headline-md": [
    "22px",
    { lineHeight: "30px", letterSpacing: "-0.015em", fontWeight: "600" },
  ],
  "headline-sm": [
    "18px",
    { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "600" },
  ],
  "body-lg": [
    "17px",
    { lineHeight: "26px", letterSpacing: "-0.005em", fontWeight: "400" },
  ],
  "body-md": [
    "15px",
    { lineHeight: "24px", letterSpacing: "0em", fontWeight: "400" },
  ],
  "body-sm": [
    "13px",
    { lineHeight: "20px", letterSpacing: "0em", fontWeight: "400" },
  ],
  "label-lg": [
    "16px",
    { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "600" },
  ],
  "label-md": [
    "14px",
    { lineHeight: "18px", letterSpacing: "0em", fontWeight: "500" },
  ],
  "label-sm": [
    "12px",
    { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" },
  ],
  caption: [
    "11px",
    { lineHeight: "14px", letterSpacing: "0.02em", fontWeight: "400" },
  ],
} as const;

export const borderRadius = {
  sm: "0.25rem",
  DEFAULT: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  full: "9999px",
} as const;

export const spacing = {
  "space-2": "0.125rem",
  "space-4": "0.25rem",
  "space-8": "0.5rem",
  "space-12": "0.75rem",
  "space-16": "1rem",
  "space-20": "1.25rem",
  "space-24": "1.5rem",
  "space-32": "2rem",
  "space-40": "2.5rem",
  "space-48": "3rem",
  "space-64": "4rem",
  "gutter-mobile": "1rem",
  "gutter-tablet": "1.5rem",
  "gutter-desktop": "2rem",
  "margin-mobile": "1rem",
  "margin-tablet": "2rem",
  "margin-desktop": "auto",
} as const;

export const tokens = {
  colors,
  fontFamily,
  fontSize,
  borderRadius,
  spacing,
} as const;

export type DesignTokens = typeof tokens;
