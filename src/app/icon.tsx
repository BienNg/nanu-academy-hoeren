import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { AppMark } from "@/components/Logo";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export function nanuAppIcon(pixels: number, font: Buffer) {
  return new ImageResponse(<AppMark size={pixels} shadow={false} rounded={false} />, {
    width: pixels,
    height: pixels,
    fonts: [{ name: "Fredoka", data: font, weight: 700, style: "normal" }],
  });
}

export default async function Icon() {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Fredoka-Bold.ttf"));
  return nanuAppIcon(size.width, font);
}
