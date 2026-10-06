/**
 * Deals one practice part: listening cards from buildPracticeDeck, then the
 * meaning and reply cards around them, then the pairing card, then the
 * Vietnamese → German order cards. Kept in its own file, rather than inside
 * sentence-order.ts, so that file (imported by multiple-choice.ts for
 * tokenizeSentence) never has to import back from multiple-choice.ts or
 * pairing.ts — that would make the three files a dependency cycle.
 */

import {
  buildPracticeDeck,
  buildWordBank,
  hasOrderCard,
  isAnchorKind,
  isListeningOrderEligible,
  type OrderSourceClip,
  type PracticeCard,
} from "./sentence-order";
import {
  buildDeMcOptions,
  buildMcOptions,
  isGermanChoiceEligible,
  isMultipleChoiceEligible,
} from "./multiple-choice";
import { buildPairingSet, isPairingItemEligible } from "./pairing";

/**
 * Target card cap for one practice part, including after a shuffle.
 * The part split may deal more so a part is not shorter than the clip minimum.
 */
export const MAX_PRACTICE_CARDS = 20;

/** Most pairing cards one practice part holds. */
export const MAX_PAIRING_CARDS = 1;

/** Most Vietnamese → German order cards one practice part holds. */
export const MAX_ORDER_CARDS = 4;

function zeroRandom(): number {
  return 0;
}

/** How many cards `partClips` become inside a lesson. Randomness does not change the count. */
export function practiceCardCount<C extends OrderSourceClip>(
  partClips: readonly C[],
  lessonClips: readonly C[],
): number {
  return dealPracticePart(partClips, lessonClips, [], zeroRandom).length;
}

function scriptKey(script: string): string {
  return script.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasReplyChoice(clip: OrderSourceClip): boolean {
  return (
    !clip.answer &&
    Array.isArray(clip.replies) &&
    clip.replies.length >= 2 &&
    clip.replies.filter((reply) => reply.correct).length === 1
  );
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/**
 * Largest clip count that still stays within MAX_PRACTICE_CARDS for every
 * subset of that size. One clip is at least one listening card, so the count
 * never needs to exceed the card cap.
 */
export function maxClipsPerPracticePart<C extends OrderSourceClip>(
  lessonClips: readonly C[],
): number {
  const total = lessonClips.length;
  if (total === 0) return 0;

  const scored = lessonClips.map((clip) => {
    const hasTranslation = Boolean(clip.translationVi?.trim());
    const multipleChoice = hasTranslation && isMultipleChoiceEligible(clip, lessonClips);
    // Must mirror the cards dealPracticePart deals per clip. Order cards are capped per part,
    // so counting one per clip only overestimates; the exact count below decides.
    // Practice deals no typed Vietnamese prompt, so the German choice drill needs its own distractors.
    const viDrills = !clip.answer && !clip.imageUrl && isGermanChoiceEligible(clip, lessonClips);
    // A clip with a reply-choice card gets no meaning drill: the two share one slot.
    const replyChoice = hasReplyChoice(clip);
    const listeningOrder = isListeningOrderEligible(clip);
    const meaningDrill =
      !replyChoice && (multipleChoice || (viDrills && hasTranslation) || listeningOrder) ? 1 : 0;
    const base = clip.answer
      ? 1 + meaningDrill
      : 1 +
        (clip.sentenceOrder && hasTranslation ? 1 : 0) +
        meaningDrill +
        (replyChoice ? 1 : 0);
    return {
      clip,
      base,
      pairing: isPairingItemEligible(clip),
      script: scriptKey(clip.script),
    };
  });

  let allowed = 1;
  const limit = Math.min(total, MAX_PRACTICE_CARDS);
  const remaining = [...scored];
  const chosen: C[] = [];
  const seenPairingScripts = new Set<string>();

  for (let k = 1; k <= limit; k += 1) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!candidate) continue;
      const uniquePairing = candidate.pairing && !seenPairingScripts.has(candidate.script);
      const score = candidate.base + (uniquePairing ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const next = remaining.splice(bestIndex, 1)[0];
    if (!next) break;
    chosen.push(next.clip);
    if (next.pairing) seenPairingScripts.add(next.script);
    if (practiceCardCount(chosen, lessonClips) > MAX_PRACTICE_CARDS) break;
    allowed = k;
  }

  return allowed;
}

/**
 * One practice part, in three blocks:
 * 1. A listening card per clip, with each clip's meaning or reply card at a
 *    random later slot. LISTENING_CHOICE_SHARE of the listening cards then
 *    become listening-choice cards.
 * 2. The pairing card, when the part has five short clips.
 * 3. Up to MAX_ORDER_CARDS Vietnamese → German order cards, shuffled.
 */
export function dealPracticePart<C extends OrderSourceClip>(
  partClips: readonly C[],
  lessonClips: readonly C[],
  levelClips: readonly C[] = [],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const front = mixListeningChoice(
    insertDiscreteCards(buildPracticeDeck(partClips), partClips, lessonClips, levelClips, random),
    lessonClips,
    levelClips,
    random,
  );
  const pairing = pairingCards(partClips, random);
  const orders = orderCards(partClips, lessonClips, front, pairing.length > 0, random);
  return [...front, ...pairing, ...orders];
}

/** At most MAX_PAIRING_CARDS 5-clip pairing cards, drawn only from `partClips`. */
function pairingCards<C extends OrderSourceClip>(
  partClips: readonly C[],
  random: () => number,
): PracticeCard<C>[] {
  const cards: PracticeCard<C>[] = [];
  const usedForPairing = new Set<string>();
  for (let sets = 0; sets < MAX_PAIRING_CARDS; sets += 1) {
    const set = buildPairingSet(partClips, [], usedForPairing, random);
    if (!set) break;
    for (const clip of set) usedForPairing.add(clip.id);
    cards.push({
      key: `pairing:${set.map((clip) => clip.id).join("+")}`,
      kind: "pairing",
      clip: set[0],
      pairItems: set,
    });
  }
  return cards;
}

/**
 * Clips whose order card should be cut first: their meaning card already has
 * the student build the same sentence from chips.
 */
function chipClipIds(cards: readonly PracticeCard[]): Set<string> {
  return new Set(cards.flatMap((card) => (card.kind === "listening-order" ? [card.clip.id] : [])));
}

/**
 * Picks `keep` of `candidates` at random, cutting clips in `cutFirst` before
 * the others.
 */
function pickKept<T extends { clip: { id: string } }>(
  candidates: readonly T[],
  keep: number,
  cutFirst: ReadonlySet<string>,
  random: () => number,
): T[] {
  const order = shuffled(candidates, random);
  return [
    ...order.filter((item) => !cutFirst.has(item.clip.id)),
    ...order.filter((item) => cutFirst.has(item.clip.id)),
  ].slice(0, keep);
}

/**
 * Up to MAX_ORDER_CARDS order cards for the part, shuffled. Without a pairing
 * card between them, the first one is never the clip of the card just before,
 * so a clip's chips never follow its own audio directly.
 */
function orderCards<C extends OrderSourceClip>(
  partClips: readonly C[],
  lessonClips: readonly C[],
  front: readonly PracticeCard<C>[],
  hasPairing: boolean,
  random: () => number,
): PracticeCard<C>[] {
  const kept = shuffled(
    pickKept(
      partClips.filter(hasOrderCard).map((clip) => ({ clip })),
      MAX_ORDER_CARDS,
      chipClipIds(front),
      random,
    ),
    random,
  );
  const before = front[front.length - 1];
  if (!hasPairing && kept.length > 1 && kept[0]?.clip.id === before?.clip.id) {
    [kept[0], kept[1]] = [kept[1]!, kept[0]!];
  }
  return kept.map(({ clip }) => ({
    key: `${clip.id}:order`,
    kind: "order",
    clip,
    bank: buildWordBank(clip, lessonClips, random),
  }));
}

/**
 * Drops order cards from `cards` until at most MAX_ORDER_CARDS remain. Clips
 * whose meaning card is listening-order lose theirs first; the rest are cut at
 * random. Card order is kept.
 */
export function capOrderCards<C extends OrderSourceClip>(
  cards: readonly PracticeCard<C>[],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const orders = cards.filter((card) => card.kind === "order");
  if (orders.length <= MAX_ORDER_CARDS) return [...cards];
  const kept = new Set(pickKept(orders, MAX_ORDER_CARDS, chipClipIds(cards), random));
  return cards.filter((card) => card.kind !== "order" || kept.has(card));
}

/**
 * Adds one meaning drill per clip in `partClips` (a random pick of German →
 * Vietnamese choice, Vietnamese → German choice, or listening sentence order,
 * from the ones the clip qualifies for), or one reply-choice card for a clip
 * with replies, to a deck that already has a listening card for every part clip.
 * Each card goes at a random slot at least one card after its clip's listening
 * card.
 *
 * MC distractor text doesn't need its own listening card (it's just
 * wrong-answer text), so it can be drawn from the wider `lessonClips` (and
 * optionally `levelClips`) — the same precedent `buildWordBank` already uses
 * for order-card distractor words.
 */
export function insertDiscreteCards<C extends OrderSourceClip>(
  deck: readonly PracticeCard<C>[],
  partClips: readonly C[],
  lessonClips: readonly C[],
  levelClips: readonly C[] = [],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const next = [...deck];

  function listeningIndexOf(clipId: string): number {
    return next.findIndex((card) => isAnchorKind(card.kind) && card.clip.id === clipId);
  }

  function insertAfter(anchorIndex: number, card: PracticeCard<C>): void {
    const earliest = Math.min(anchorIndex + 2, next.length);
    const span = next.length - earliest + 1;
    const at = earliest + Math.min(span - 1, Math.floor(random() * span));
    next.splice(at, 0, card);
  }

  for (const clip of partClips) {
    if (!hasReplyChoice(clip) || !clip.replies) continue;
    const anchorIndex = listeningIndexOf(clip.id);
    if (anchorIndex === -1) continue;
    insertAfter(anchorIndex, {
      key: `${clip.id}:reply`,
      kind: "reply-choice",
      clip,
      options: shuffled(
        clip.replies.map((reply, index) => ({
          id: `${clip.id}:reply:${index}`,
          text: reply.text,
          correct: reply.correct,
          ...(reply.whyVi ? { explanation: reply.whyVi } : {}),
        })),
        random,
      ),
    });
  }

  // One meaning drill per clip, picked from the kinds the clip qualifies for.
  // A clip that already got a reply-choice card skips it, so a clip never deals both.
  for (const clip of partClips) {
    if (hasReplyChoice(clip)) continue;
    const anchorIndex = listeningIndexOf(clip.id);
    if (anchorIndex === -1) continue;
    const drills = meaningDrills(clip, lessonClips, levelClips, random);
    if (drills.length === 0) continue;
    const pick = drills[Math.min(drills.length - 1, Math.floor(random() * drills.length))];
    if (pick) insertAfter(anchorIndex, pick);
  }

  return next;
}

/**
 * The meaning drills a clip qualifies for: Vietnamese → German choice,
 * German → Vietnamese multiple choice, and listening sentence order.
 * insertDiscreteCards deals one of them, so a clip adds at most one card here.
 */
function meaningDrills<C extends OrderSourceClip>(
  clip: C,
  lessonClips: readonly C[],
  levelClips: readonly C[],
  random: () => number,
): PracticeCard<C>[] {
  const drills: PracticeCard<C>[] = [];
  // Built from the audio alone, so it needs no translation.
  if (isListeningOrderEligible(clip)) {
    drills.push({
      key: `${clip.id}:listen-order`,
      kind: "listening-order",
      clip,
      bank: buildWordBank(clip, lessonClips, random),
    });
  }
  const translationVi = clip.translationVi;
  if (!translationVi?.trim()) return drills;
  // A number clip's script is spelled out; choosing it from Vietnamese is not the skill.
  // A picture word is drilled by picture pairing instead, which keeps 5 of them in one part.
  if (!clip.answer && !clip.imageUrl && clip.script.trim()) {
    const options = buildDeMcOptions(clip, lessonClips, levelClips, random);
    if (options) drills.push({ key: `${clip.id}:vi-choice`, kind: "vi-choice", clip, options });
  }
  const options = buildMcOptions({ ...clip, translationVi }, lessonClips, levelClips, random);
  if (options) drills.push({ key: `${clip.id}:mc`, kind: "multiple-choice", clip, options });
  return drills;
}

/** Share of a deck's listening cards that become listening-choice cards. */
export const LISTENING_CHOICE_SHARE = 0.75;

/**
 * Turns LISTENING_CHOICE_SHARE of the deck's listening cards into
 * listening-choice cards: the audio plays and the student picks the German
 * text they heard. The student hasn't learned the clip's meaning yet at this
 * point, so the options are German, not Vietnamese. Only clips with enough
 * German distractors can switch, so a deck short on them keeps more typing
 * cards. Each card stays in place and stays the clip's anchor, so the card
 * count never changes.
 */
export function mixListeningChoice<C extends OrderSourceClip>(
  deck: readonly PracticeCard<C>[],
  lessonClips: readonly C[],
  levelClips: readonly C[] = [],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const listeningCount = deck.filter((card) => card.kind === "listening").length;
  const target = Math.round(listeningCount * LISTENING_CHOICE_SHARE);
  if (target === 0) return [...deck];

  const choices = new Map<number, PracticeCard<C>>();
  const indexes = shuffled(
    deck.flatMap((card, index) => (card.kind === "listening" ? [index] : [])),
    random,
  );
  for (const index of indexes) {
    if (choices.size >= target) break;
    const card = deck[index];
    if (!card?.clip.script.trim()) continue;
    const options = buildDeMcOptions(card.clip, lessonClips, levelClips, random);
    if (!options) continue;
    choices.set(index, {
      key: `${card.clip.id}:listen-choice`,
      kind: "listening-choice",
      clip: card.clip,
      options,
    });
  }

  return deck.map((card, index) => choices.get(index) ?? card);
}
