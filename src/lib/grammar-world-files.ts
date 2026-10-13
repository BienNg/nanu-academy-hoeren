/**
 * Reads the grammar-world tab files from disk. Tests and scripts use this.
 * The app imports `@/data/grammar/world` instead, so the browser bundle
 * never touches the filesystem.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredWorldArea } from "./grammar-world";

const worldDir = join(process.cwd(), "src/data/grammar/world");

/** Tabs in the authored left-to-right order. */
export function readWorldAreas(): StoredWorldArea[] {
  const order = JSON.parse(readFileSync(join(worldDir, "order.json"), "utf8")) as string[];
  return order.map((id) => JSON.parse(readFileSync(join(worldDir, `${id}.json`), "utf8")) as StoredWorldArea);
}
