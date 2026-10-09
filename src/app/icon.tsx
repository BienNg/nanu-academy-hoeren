import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { AppMark } from "@/components/Logo";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

const FREDOKA = { name: "Fredoka", weight: 700 as const, style: "normal" as const };

export function nanuAppIcon(pixels: number, font: Buffer) {
  return new ImageResponse(<AppMark size={pixels} shadow={false} rounded={false} />, {
    width: pixels,
    height: pixels,
    fonts: [{ ...FREDOKA, data: font }],
  });
}

/** Full-bleed blue with the mark inside the Android safe zone (center 80%). */
export function nanuMaskableIcon(pixels: number, font: Buffer) {
  const mark = Math.round(pixels * 0.64);
  return new ImageResponse(
    <div
      style={{
        width: pixels,
        height: pixels,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#129BE0",
      }}
    >
      <AppMark size={mark} shadow={false} rounded={false} />
    </div>,
    {
      width: pixels,
      height: pixels,
      fonts: [{ ...FREDOKA, data: font }],
    },
  );
}

export default async function Icon() {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Fredoka-Bold.ttf"));
  return nanuAppIcon(size.width, font);
}
