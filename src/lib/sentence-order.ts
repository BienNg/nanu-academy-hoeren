/**
 * Sentence-order cards: the Vietnamese translation is shown, the German words
 * come shuffled as chips (with a few distractors) and the student taps them in order.
 * No imports so the node tests can compile this file on its own.
 */

export type PracticeCardKind = "listening" | "order";

export type WordChip = {
  /** Stable per card, so repeated words stay distinct chips. */
  id: string;
  text: string;
};

type OrderSourceClip = {
  id: string;
  script: string;
  translationVi?: string;
  sentenceOrder?: boolean;
};

export type PracticeCard<C extends OrderSourceClip = OrderSourceClip> = {
  key: string;
  kind: PracticeCardKind;
  clip: C;
  /** Shuffled chips. Only on order cards. */
  bank?: WordChip[];
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

export function tokenizeSentence(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean);
}

/** Lowercase, punctuation removed. Only used for comparing. */
export function normalizeToken(word: string): string {
  return word.toLowerCase().replace(PUNCTUATION, "");
}

/** Two or more words, a translation to show, and not excluded in the lesson JSON. */
export function isSentenceOrderEligible(clip: {
  script: string;
  translationVi?: string;
  noSentenceOrder?: boolean;
}): boolean {
  if (clip.noSentenceOrder === true) return false;
  if (!clip.translationVi || clip.translationVi.trim().length === 0) return false;
  return tokenizeSentence(clip.script).filter((word) => normalizeToken(word)).length >= 2;
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
    for (const word of tokenizeSentence(other.script)) {
      const form = normalizeToken(word);
      if (!form || sentenceForms.has(form) || candidates.has(form)) continue;
      // Chips show words without trailing punctuation from another sentence.
      candidates.set(form, word.replace(/[.,?!:;]+$/g, ""));
    }
  }
  const distractors = shuffle([...candidates.values()], random).slice(
    0,
    distractorCount(words.length),
  );

  const chips: WordChip[] = [
    ...words.map((text, index) => ({ id: `w${index}`, text })),
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
 * One listening card per clip, plus an order card for each eligible clip.
 * Cards are drawn at random, and a clip's order card joins the draw only once
 * its listening card is placed, so the chips never give away the dictation.
 */
export function buildPracticeDeck<C extends OrderSourceClip>(
  partClips: readonly C[],
  lessonClips: readonly OrderSourceClip[],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const available: PracticeCard<C>[] = partClips.map((clip) => ({
    key: `${clip.id}:listen`,
    kind: "listening",
    clip,
  }));
  const deck: PracticeCard<C>[] = [];
  while (available.length > 0) {
    const index = Math.min(available.length - 1, Math.floor(random() * available.length));
    const [card] = available.splice(index, 1) as [PracticeCard<C>];
    deck.push(card);
    if (card.kind === "listening" && card.clip.sentenceOrder) {
      available.push({
        key: `${card.clip.id}:order`,
        kind: "order",
        clip: card.clip,
        bank: buildWordBank(card.clip, lessonClips, random),
      });
    }
  }
  return deck;
}
