/**
 * Writes src/data/clip-index/<level>.md: every script, word and verb card a
 * level already teaches, so a new Lektion can be checked against it.
 * Run after adding or changing a Lektion: `npm run index:clips`.
 * The content check fails while an index is out of date.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { clipIndexDir, loadLessons, renderAllIndexes, repoRoot } from "./lib/clip-index.mjs";

const indexes = renderAllIndexes(loadLessons());
mkdirSync(clipIndexDir, { recursive: true });

const wanted = new Set(indexes.map((entry) => entry.path));
for (const name of readdirSync(clipIndexDir)) {
  const path = join(clipIndexDir, name);
  if (name.endsWith(".md") && !wanted.has(path)) {
    rmSync(path);
    console.log(`Removed ${relative(repoRoot, path)} (no clips in that level)`);
  }
}

for (const { path, content } of indexes) {
  writeFileSync(path, content);
  console.log(`Wrote ${relative(repoRoot, path)} (${Buffer.byteLength(content)} bytes)`);
}
