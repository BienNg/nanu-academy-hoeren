import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { nanuMaskableIcon } from "./icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function IconMaskable() {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Fredoka-Bold.ttf"));
  return nanuMaskableIcon(size.width, font);
}
