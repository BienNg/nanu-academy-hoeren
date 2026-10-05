import type { Config } from "tailwindcss";
import {
  borderRadius,
  colors,
  fontFamily as tokenFontFamily,
  fontSize,
  spacing,
} from "./src/lib/tokens";
import {
  adminBorderRadius,
  adminBoxShadow,
  adminColors,
  adminFontFamily,
  adminFontSize,
} from "./src/lib/admin-tokens";

const plusJakarta = "var(--font-plus-jakarta-sans)";
const beVietnam = "var(--font-be-vietnam-pro)";

const fontFamily = Object.fromEntries(
  Object.entries(tokenFontFamily).map(([key, stack]) => [
    key,
    stack[0] === "Be Vietnam Pro"
      ? [beVietnam, ...stack]
      : [plusJakarta, ...stack],
  ]),
);

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { ...colors, ...adminColors },
      fontFamily: { ...fontFamily, ...adminFontFamily },
      fontSize: { ...fontSize, ...adminFontSize },
      borderRadius: { ...borderRadius, ...adminBorderRadius },
      boxShadow: adminBoxShadow,
      spacing,
    },
  },
  plugins: [],
};

export default config;
