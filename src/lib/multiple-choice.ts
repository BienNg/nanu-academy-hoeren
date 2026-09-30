/**
 * Multiple-choice cards: the German script is shown, and the student taps
 * one of four Vietnamese options (the real translation plus distractors).
 * Distractors are matched to the correct answer's word count, so an option's
 * length never gives away whether it's right.
 */

import { tokenizeSentence } from "./sentence-order";

export type McOption = {
  id: string;
  text: string;
  correct: boolean;
};

export type McResult = {
  accuracy: number;
  selectedId: string | null;
  correctId: string;
};

export const MC_OPTION_COUNT = 4;

type ViSource = { id: string; script?: string; translationVi?: string };

function normalizeVi(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/** Other clips' texts with the same word count as the correct answer, deduped. */
function collectCandidates(
  wordCount: number,
  excludeClipId: string,
  seen: Set<string>,
  pool: readonly ViSource[],
  textOf: (clip: ViSource) => string | undefined,
): string[] {
  const found: string[] = [];
  for (const other of pool) {
    if (other.id === excludeClipId) continue;
    const text = textOf(other);
    if (!text || !text.trim()) continue;
    const normalized = normalizeVi(text);
    if (seen.has(normalized)) continue;
    if (tokenizeSentence(text).length !== wordCount) continue;
    seen.add(normalized);
    found.push(text.trim());
  }
  return found;
}

/**
 * Same-word-count distractors for `correctVi`, drawn from the same lektion
 * first, then topped up from the rest of the level if that isn't enough.
 * Returns null when there still aren't enough distractors (the clip is not
 * multiple-choice eligible).
 */
export function mcDistractors(
  correctVi: string,
  excludeClipId: string,
  lektionClips: readonly ViSource[],
  levelClips: readonly ViSource[] = [],
  count: number = MC_OPTION_COUNT - 1,
  random: () => number = Math.random,
): string[] | null {
  const wordCount = tokenizeSentence(correctVi).length;
  if (wordCount === 0) return null;

  const seen = new Set<string>([normalizeVi(correctVi)]);
  const textOf = (clip: ViSource) => clip.translationVi;
  let pool = collectCandidates(wordCount, excludeClipId, seen, lektionClips, textOf);
  if (pool.length < count) {
    pool = [...pool, ...collectCandidates(wordCount, excludeClipId, seen, levelClips, textOf)];
  }
  if (pool.length < count) return null;

  return shuffle(pool, random).slice(0, count);
}

export function isMultipleChoiceEligible(
  clip: { id: string; translationVi?: string },
  lektionClips: readonly ViSource[],
  levelClips: readonly ViSource[] = [],
): boolean {
  if (!clip.translationVi || !clip.translationVi.trim()) return false;
  return mcDistractors(clip.translationVi, clip.id, lektionClips, levelClips) !== null;
}

export function buildMcOptions(
  clip: { id: string; translationVi: string },
  lektionClips: readonly ViSource[],
  levelClips: readonly ViSource[] = [],
  random: () => number = Math.random,
): McOption[] | null {
  const distractors = mcDistractors(
    clip.translationVi,
    clip.id,
    lektionClips,
    levelClips,
    MC_OPTION_COUNT - 1,
    random,
  );
  if (!distractors) return null;

  const options: McOption[] = [
    { id: "correct", text: clip.translationVi.trim(), correct: true },
    ...distractors.map((text, index) => ({ id: `d${index}`, text, correct: false })),
  ];
  return shuffle(options, random);
}

/**
 * Vietnamese prompt, four German options. Distractors match the correct
 * script's word count and are drawn from the lektion, then the rest of the level.
 */
export function deMcDistractors(
  correctDe: string,
  excludeClipId: string,
  lektionClips: readonly ViSource[],
  levelClips: readonly ViSource[] = [],
  count: number = MC_OPTION_COUNT - 1,
  random: () => number = Math.random,
): string[] | null {
  const wordCount = tokenizeSentence(correctDe).length;
  if (wordCount === 0) return null;

  const seen = new Set<string>([normalizeVi(correctDe)]);
  const textOf = (clip: ViSource) => (clip.translationVi?.trim() ? clip.script : undefined);
  let pool = collectCandidates(wordCount, excludeClipId, seen, lektionClips, textOf);
  if (pool.length < count) {
    pool = [...pool, ...collectCandidates(wordCount, excludeClipId, seen, levelClips, textOf)];
  }
  if (pool.length < count) return null;

  return shuffle(pool, random).slice(0, count);
}

export function isGermanChoiceEligible(
  clip: { id: string; script?: string; translationVi?: string },
  lektionClips: readonly ViSource[],
  levelClips: readonly ViSource[] = [],
): boolean {
  if (!clip.translationVi?.trim() || !clip.script?.trim()) return false;
  return deMcDistractors(clip.script, clip.id, lektionClips, levelClips) !== null;
}

export function buildDeMcOptions(
  clip: { id: string; script: string },
  lektionClips: readonly ViSource[],
  levelClips: readonly ViSource[] = [],
  random: () => number = Math.random,
): McOption[] | null {
  const distractors = deMcDistractors(
    clip.script,
    clip.id,
    lektionClips,
    levelClips,
    MC_OPTION_COUNT - 1,
    random,
  );
  if (!distractors) return null;

  const options: McOption[] = [
    { id: "correct", text: clip.script.trim(), correct: true },
    ...distractors.map((text, index) => ({ id: `d${index}`, text, correct: false })),
  ];
  return shuffle(options, random);
}

export function checkMc(selectedId: string, options: readonly McOption[]): McResult {
  const correct = options.find((option) => option.correct);
  const correctId = correct?.id ?? "";
  const accuracy = selectedId === correctId ? 100 : 0;
  return { accuracy, selectedId, correctId };
}
