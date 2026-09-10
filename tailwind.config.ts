import type { Config } from "tailwindcss";
import {
  borderRadius,
  colors,
  fontFamily as tokenFontFamily,
  fontSize,
  spacing,
} from "./src/lib/tokens";

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
      colors,
      fontFamily,
      fontSize,
      borderRadius,
      spacing,
    },
  },
  plugins: [],
};

export default config;
