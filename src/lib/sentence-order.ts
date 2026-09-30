/**
 * Sentence-order cards: the Vietnamese translation is shown, the German words
 * come shuffled as chips (with a few distractors) and the student taps them in order.
 * Only imports the shared card-kinds type, so the node tests can still compile
 * this file (plus that one dependency) on its own.
 */

import type { CardKind } from "./card-kinds";

/**
 * Duel and Blitzrunde kinds plus the Leben-in-Deutschland cards, which only
 * appear in regular practice: "reply-choice" (pick the reply that fits) and
 * "number-input" (type the price or time heard, in place of dictation).
 */
export type PracticeCardKind = CardKind | "reply-choice" | "number-input";

/** Cards that stand for "this clip was heard". Every clip in a deck has exactly one. */
export function isAnchorKind(kind: PracticeCardKind): boolean {
  return kind === "listening" || kind === "number-input";
}

export type WordChip = {
  /** Stable per card, so repeated words stay distinct chips. */
  id: string;
  text: string;
};

export type OrderSourceClip = {
  id: string;
  script: string;
  translationVi?: string;
  sentenceOrder?: boolean;
  /** Leben in Deutschland: number to type instead of the dictation. */
  answer?: string;
  /** Leben in Deutschland: replies for a "Was sagst du?" card. */
  replies?: readonly { text: string; correct: boolean; whyVi?: string }[];
};

export type PracticeCard<C extends OrderSourceClip = OrderSourceClip> = {
  key: string;
  kind: PracticeCardKind;
  clip: C;
  /** Shuffled chips. Only on order cards. */
  bank?: WordChip[];
  /** Four answer options on multiple-choice cards; the shuffled replies on reply-choice cards. */
  options?: { id: string; text: string; correct: boolean; explanation?: string }[];
  /** The 5 clips being paired. Only on pairing cards; `clip` is pairItems[0]. */
  pairItems?: C[];
};

/** Same shape as ScoreResult in scoring.ts, so the feedback card can show it. */
export type OrderResult = {
  accuracy: number;
  words: {
    word: string;
    status: "correct" | "incorrect" | "missing" | "extra";
    typed?: string;
  }[];
};

const PUNCTUATION = /[.,?!:;"'„“”‚‘’«»…()\-–—]/g;
/** Sentence marks at the edges of a word. Internal hyphens stay. */
const EDGE_PUNCTUATION = /^[.,?!:;"'„“”‚‘’«»…()]+|[.,?!:;"'„“”‚‘’«»…()]+$/g;

export function tokenizeSentence(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean);
}

/** Lowercase, punctuation removed. Only used for comparing. */
export function normalizeToken(word: string): string {
  return word.toLowerCase().replace(PUNCTUATION, "");
}

/**
 * Label shown on a chip. Periods, commas, and question marks are stripped so
 * they cannot reveal which word ends the sentence.
 */
export function chipText(word: string): string {
  return word.replace(EDGE_PUNCTUATION, "");
}

export const MIN_ORDER_WORDS = 3;

/** Three or more words, a translation to show, and not excluded in the lesson JSON. */
export function isSentenceOrderEligible(clip: {
  script: string;
  translationVi?: string;
  noSentenceOrder?: boolean;
}): boolean {
  if (clip.noSentenceOrder === true) return false;
  if (!clip.translationVi || clip.translationVi.trim().length === 0) return false;
  return tokenizeSentence(clip.script).filter((word) => normalizeToken(word)).length >= MIN_ORDER_WORDS;
}

export function distractorCount(wordCount: number): number {
  if (wordCount <= 3) return 1;
  if (wordCount <= 6) return 2;
  return 3;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/**
 * Sentence words plus 1–3 words from other clips of the same lesson,
 * shuffled so the bank never starts out as the correct answer.
 */
export function buildWordBank(
  clip: OrderSourceClip,
  lessonClips: readonly OrderSourceClip[],
  random: () => number = Math.random,
): WordChip[] {
  const words = tokenizeSentence(clip.script);
  const sentenceForms = new Set(words.map(normalizeToken));

  const candidates = new Map<string, string>();
  for (const other of lessonClips) {
    if (other.id === clip.id) continue;
    if (!other.translationVi?.trim()) continue;
    for (const word of tokenizeSentence(other.script)) {
      const form = normalizeToken(word);
      if (!form || sentenceForms.has(form) || candidates.has(form)) continue;
      const label = chipText(word);
      if (!label) continue;
      candidates.set(form, label);
    }
  }
  const distractors = shuffle([...candidates.values()], random).slice(
    0,
    distractorCount(words.length),
  );

  const chips: WordChip[] = [
    ...words.flatMap((text, index) => {
      const label = chipText(text);
      return label ? [{ id: `w${index}`, text: label }] : [];
    }),
    ...distractors.map((text, index) => ({ id: `d${index}`, text })),
  ];

  const answer = words.map(normalizeToken).join(" ");
  let bank = shuffle(chips, random);
  for (let tries = 0; tries < 5; tries += 1) {
    const start = bank
      .slice(0, words.length)
      .map((chip) => normalizeToken(chip.text))
      .join(" ");
    if (start !== answer) break;
    bank = shuffle(chips, random);
  }
  return bank;
}

/** Compares word by word, ignoring case and punctuation. */
export function checkOrder(selected: readonly string[], script: string): OrderResult {
  const expected = tokenizeSentence(script);
  const words: OrderResult["words"] = expected.map((word, index) => {
    const typed = selected[index];
    if (typed === undefined) return { word, status: "missing" };
    return {
      word,
      typed,
      status: normalizeToken(typed) === normalizeToken(word) ? "correct" : "incorrect",
    };
  });
  for (const typed of selected.slice(expected.length)) {
    words.push({ word: typed, typed, status: "extra" });
  }

  const allCorrect =
    selected.length === expected.length &&
    words.every((word) => word.status === "correct");
  const correct = words.filter((word) => word.status === "correct").length;
  const accuracy = allCorrect
    ? 100
    : Math.min(99, Math.round((correct / Math.max(expected.length, 1)) * 100));
  return { accuracy, words };
}

/**
 * One listening card per clip in the part's order, plus an order card for each
 * eligible clip. Each order card is inserted at a random later position after
 * its own listening card (with at least one card in between when possible),
 * so the chips never give away the dictation.
 */
export function buildPracticeDeck<C extends OrderSourceClip>(
  partClips: readonly C[],
  lessonClips: readonly OrderSourceClip[],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const deck: PracticeCard<C>[] = partClips.map((clip) =>
    clip.answer
      ? { key: `${clip.id}:number`, kind: "number-input", clip }
      : { key: `${clip.id}:listen`, kind: "listening", clip },
  );
  for (const clip of partClips) {
    if (!clip.sentenceOrder || clip.answer || !clip.translationVi?.trim()) continue;
    const listenAt = deck.findIndex(
      (card) => isAnchorKind(card.kind) && card.clip.id === clip.id,
    );
    const earliest = Math.min(listenAt + 2, deck.length);
    const span = deck.length - earliest + 1;
    const at = earliest + Math.min(span - 1, Math.floor(random() * span));
    deck.splice(at, 0, {
      key: `${clip.id}:order`,
      kind: "order",
      clip,
      bank: buildWordBank(clip, lessonClips, random),
    });
  }
  return deck;
}
