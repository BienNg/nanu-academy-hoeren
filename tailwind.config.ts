import type { Config } from "tailwindcss";
import {
  borderRadius,
  colors,
  fontFamily,
  fontSize,
  spacing,
} from "./src/lib/tokens";

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
