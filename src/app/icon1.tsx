import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { nanuAppIcon } from "./icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon512() {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Fredoka-Bold.ttf"));
  return nanuAppIcon(size.width, font);
}
