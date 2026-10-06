/**
 * Jump test: a learner may skip the Lektion they are on by passing a quiz
 * on its clips. The deck is dealt from a seed, so the server deals the same
 * cards to grade the answers before it pays XP. No pairing cards.
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { seedToRandom } from "./blitzrunde";
import { scoreAttempt } from "./scoring";
import { buildDeMcOptions, buildMcOptions, checkMc } from "./multiple-choice";
import {
  buildWordBank,
  checkOrder,
  isListeningOrderEligible,
  isSentenceOrderEligible,
  type OrderSourceClip,
  type PracticeCard,
} from "./sentence-order";
import { dayKey, weekKey } from "./xp";

/** Most cards in one jump test. A small Lektion gets fewer, one per clip. */
export const JUMP_CARD_COUNT = 25;
export const JUMP_HEARTS = 3;
export const JUMP_XP = 35;
/** A passed test faster than this per card is not paid. */
export const MIN_MS_PER_JUMP_CARD = 1500;

export const JUMP_XP_SCHEMA_HINT =
  "Run supabase/lesson_jump_awards.sql once in the Supabase SQL editor.";

export function isJumpXpSchemaMissing(message: string): boolean {
  return (
    /lesson_jump_awards/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

const JUMP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LESSON_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ANSWER_CHARS = 400;
const MAX_ORDER_CHIPS = 40;

/** One attempt's seed. Each try gets a new id, so each try deals new cards. */
export function jumpSeed(lessonKey: string, attemptId: string): string {
  return `jump:${lessonKey}:${attemptId}`;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/** The cards one clip can become in a jump test. */
function jumpCardsFor<C extends OrderSourceClip>(
  clip: C,
  lessonClips: readonly C[],
  random: () => number,
): PracticeCard<C>[] {
  const translationVi = clip.translationVi?.trim();
  if (!translationVi || !clip.script.trim()) return [];
  const cards: PracticeCard<C>[] = [];
  if (!clip.answer && (clip.sentenceOrder ?? isSentenceOrderEligible(clip))) {
    cards.push({
      key: `${clip.id}:order`,
      kind: "order",
      clip,
      bank: buildWordBank(clip, lessonClips, random),
    });
  }
  if (isListeningOrderEligible(clip)) {
    cards.push({
      key: `${clip.id}:listen-order`,
      kind: "listening-order",
      clip,
      bank: buildWordBank(clip, lessonClips, random),
    });
  }
  const meaning = buildMcOptions({ ...clip, translationVi }, lessonClips, [], random);
  if (meaning) cards.push({ key: `${clip.id}:mc`, kind: "multiple-choice", clip, options: meaning });
  // A number clip's script is spelled out; choosing it from Vietnamese is not the skill.
  if (!clip.answer && !clip.imageUrl) {
    const german = buildDeMcOptions(clip, lessonClips, [], random);
    if (german) cards.push({ key: `${clip.id}:vi-choice`, kind: "vi-choice", clip, options: german });
    cards.push({ key: `${clip.id}:vi-input`, kind: "vi-input", clip });
  }
  return cards;
}

/**
 * Up to JUMP_CARD_COUNT cards, one per clip, from randomly picked clips of
 * the Lektion. Each clip becomes a random one of the kinds it qualifies for:
 * sentence order, listening sentence order, German → Vietnamese choice,
 * Vietnamese → German choice, or Vietnamese → typed German.
 */
export function buildJumpDeck<C extends OrderSourceClip>(
  lessonClips: readonly C[],
  seed: string,
): PracticeCard<C>[] {
  const random = seedToRandom(seed);
  const deck: PracticeCard<C>[] = [];
  for (const clip of shuffle(lessonClips, random)) {
    if (deck.length >= JUMP_CARD_COUNT) break;
    const options = jumpCardsFor(clip, lessonClips, random);
    if (options.length === 0) continue;
    const pick = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    if (pick) deck.push(pick);
  }
  return deck;
}

/**
 * An option id on choice cards, the typed German on vi-input cards, or the
 * chip texts in tapped order on sentence-order cards.
 */
export type JumpAnswer = string | string[];

export function checkJumpAnswer(card: PracticeCard, answer: JumpAnswer): boolean {
  if (card.kind === "order" || card.kind === "listening-order") {
    return Array.isArray(answer) && checkOrder(answer, card.clip.script).accuracy === 100;
  }
  if (card.kind === "vi-input") {
    return typeof answer === "string" && scoreAttempt(answer, card.clip.script).accuracy === 100;
  }
  if (typeof answer !== "string" || !card.options) return false;
  return checkMc(answer, card.options).accuracy === 100;
}

export type JumpGrade = {
  answered: number;
  mistakes: number;
  passed: boolean;
};

/**
 * Answers in deck order. A wrong answer costs a heart and the test moves on;
 * the test ends at the last heart. Passing needs every card answered.
 */
export function gradeJumpAnswers(
  deck: readonly PracticeCard[],
  answers: readonly JumpAnswer[],
): JumpGrade {
  let mistakes = 0;
  let answered = 0;
  for (const card of deck) {
    const answer = answers[answered];
    if (answer === undefined) break;
    answered += 1;
    if (!checkJumpAnswer(card, answer)) mistakes += 1;
    if (mistakes >= JUMP_HEARTS) break;
  }
  return {
    answered,
    mistakes,
    passed:
      deck.length > 0 &&
      mistakes < JUMP_HEARTS &&
      answered === deck.length &&
      answers.length === deck.length,
  };
}

export type LessonJumpInput = {
  /** Attempt id. Also the seed of the deck and the award's primary key. */
  id: string;
  lessonKey: string;
  elapsedMs: number;
  answers: JumpAnswer[];
};

function readAnswer(value: unknown): JumpAnswer | null {
  if (typeof value === "string") {
    return value.length <= MAX_ANSWER_CHARS ? value : null;
  }
  if (!Array.isArray(value) || value.length > MAX_ORDER_CHIPS) return null;
  const chips: string[] = [];
  for (const chip of value) {
    if (typeof chip !== "string" || chip.length > MAX_ANSWER_CHARS) return null;
    chips.push(chip);
  }
  return chips;
}

export function parseLessonJumpInput(value: unknown): LessonJumpInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !JUMP_ID.test(record.id)) return null;
  if (typeof record.lessonKey !== "string" || !LESSON_KEY.test(record.lessonKey)) return null;
  const elapsedMs = record.elapsedMs;
  if (
    typeof elapsedMs !== "number" ||
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  if (!Array.isArray(record.answers) || record.answers.length > JUMP_CARD_COUNT) return null;
  const answers: JumpAnswer[] = [];
  for (const entry of record.answers) {
    const answer = readAnswer(entry);
    if (answer == null) return null;
    answers.push(answer);
  }
  return { id: record.id.toLowerCase(), lessonKey: record.lessonKey, elapsedMs, answers };
}

export type JumpXpKind = "new" | "repeat" | "rejected";

export type JumpXpDecision = {
  xp: number;
  kind: JumpXpKind;
  store: boolean;
  dayKey: string;
  weekKey: string;
};

/**
 * 35 XP once per Lektion. A Lektion that was already finished the normal way
 * pays nothing, so the test cannot farm a finished Lektion.
 */
export function decideJumpXp(input: {
  grade: JumpGrade;
  cardCount: number;
  elapsedMs: number;
  /** A jump award for this Lektion is already stored. */
  alreadyAwarded: boolean;
  /** The Lektion was completed before, and not by a jump. */
  completedWithoutJump: boolean;
  now: Date;
}): JumpXpDecision {
  const keys = { dayKey: dayKey(input.now), weekKey: weekKey(input.now) };
  if (!input.grade.passed || input.elapsedMs < input.cardCount * MIN_MS_PER_JUMP_CARD) {
    return { xp: 0, kind: "rejected", store: false, ...keys };
  }
  if (input.alreadyAwarded || input.completedWithoutJump) {
    return { xp: 0, kind: "repeat", store: false, ...keys };
  }
  return { xp: JUMP_XP, kind: "new", store: true, ...keys };
}

export type JumpChapter = {
  playable: boolean;
  done: boolean;
  /** Cards the jump test could deal. Zero hides the jump. */
  clipCount: number;
};

/**
 * Index of the Lektion a jump test skips, and of the locked Lektion it opens.
 * The skipped Lektion is the first unfinished one, so only the next locked
 * Lektion offers a jump. Null when there is nothing to jump to.
 */
export function jumpTarget(
  chapters: readonly JumpChapter[],
): { skipIndex: number; targetIndex: number } | null {
  const skipIndex = chapters.findIndex((chapter) => chapter.playable && !chapter.done);
  if (skipIndex < 0) return null;
  const skip = chapters[skipIndex];
  const target = chapters[skipIndex + 1];
  if (!skip || skip.clipCount <= 0 || !target?.playable || target.done) return null;
  return { skipIndex, targetIndex: skipIndex + 1 };
}
