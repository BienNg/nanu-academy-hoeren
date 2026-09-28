/**
 * Pairing cards: 5 Vietnamese words/phrases on one side, 5 German words on
 * the other, matched by tapping one chip from each side. Items are drawn
 * directly from clips whose own script is already short (a single word or
 * short phrase), never by splitting a longer sentence into sub-words —
 * aligning word order between Vietnamese and German that way is unreliable.
 */

import { tokenizeSentence } from "./sentence-order.js";

export const PAIRING_SET_SIZE = 5;
export const MAX_PAIRING_WORDS = 3;

type PairingSourceClip = { id: string; script: string; translationVi?: string };

function normalizeScript(script: string): string {
  return script.trim().toLowerCase().replace(/\s+/g, " ");
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/** A short, already-atomic clip (word or short phrase) with a translation. */
export function isPairingItemEligible(clip: { script: string; translationVi?: string }): boolean {
  if (!clip.translationVi || !clip.translationVi.trim()) return false;
  const wordCount = tokenizeSentence(clip.script).length;
  return wordCount > 0 && wordCount <= MAX_PAIRING_WORDS;
}

function collectEligible<C extends PairingSourceClip>(
  pool: readonly C[],
  usedClipIds: ReadonlySet<string>,
  seenScripts: Set<string>,
): C[] {
  const found: C[] = [];
  for (const clip of pool) {
    if (usedClipIds.has(clip.id)) continue;
    if (!isPairingItemEligible(clip)) continue;
    const key = normalizeScript(clip.script);
    if (seenScripts.has(key)) continue;
    seenScripts.add(key);
    found.push(clip);
  }
  return found;
}

/**
 * Exactly PAIRING_SET_SIZE eligible clips: same lektion first, topped up from
 * the rest of the level if that isn't enough. Null when there still aren't
 * enough eligible clips for one round. Clips already spent on another
 * pairing set (or elsewhere) can be excluded via `usedClipIds`, and clips
 * that share the same German word/phrase are deduped so a set never has two
 * chips that would be ambiguous to pair.
 */
export function buildPairingSet<C extends PairingSourceClip>(
  lektionClips: readonly C[],
  levelClips: readonly C[] = [],
  usedClipIds: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): C[] | null {
  const seenScripts = new Set<string>();
  let candidates = collectEligible(lektionClips, usedClipIds, seenScripts);
  if (candidates.length < PAIRING_SET_SIZE) {
    candidates = [...candidates, ...collectEligible(levelClips, usedClipIds, seenScripts)];
  }
  if (candidates.length < PAIRING_SET_SIZE) return null;
  return shuffle(candidates, random).slice(0, PAIRING_SET_SIZE);
}

export type PairingPairAttempt = { viClipId: string; deClipId: string };
export type PairingAnswer = readonly PairingPairAttempt[];

export type PairingResult = {
  accuracy: number;
  correctCount: number;
  total: number;
  pairs: { viClipId: string; deClipId: string; correct: boolean }[];
};

/**
 * A pair is correct iff the Vietnamese chip and German chip came from the
 * same clip — this needs no text comparison at all, only matching ids.
 * Unpaired items (a partial submission) simply don't contribute a pair.
 */
export function checkPairing<C extends { id: string }>(
  items: readonly C[],
  answer: PairingAnswer,
): PairingResult {
  const validIds = new Set(items.map((item) => item.id));
  const pairs = answer
    .filter((pair) => validIds.has(pair.viClipId) && validIds.has(pair.deClipId))
    .map((pair) => ({ ...pair, correct: pair.viClipId === pair.deClipId }));
  const correctCount = pairs.filter((pair) => pair.correct).length;
  const total = items.length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  return { accuracy, correctCount, total, pairs };
}
