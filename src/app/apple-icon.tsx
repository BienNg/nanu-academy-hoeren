import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { nanuAppIcon } from "./icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Fredoka-Bold.ttf"));
  return nanuAppIcon(size.width, font);
}
