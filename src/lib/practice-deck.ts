/**
 * Layers multiple-choice and pairing cards onto a deck already built by
 * buildPracticeDeck (listening + order cards). Kept in its own file, rather
 * than inside sentence-order.ts, so that file (imported by multiple-choice.ts
 * for tokenizeSentence) never has to import back from multiple-choice.ts or
 * pairing.ts — that would make the three files a dependency cycle.
 */

import { buildPracticeDeck, isAnchorKind, type OrderSourceClip, type PracticeCard } from "./sentence-order";
import { buildDeMcOptions, buildMcOptions, isGermanChoiceEligible, isMultipleChoiceEligible } from "./multiple-choice";
import { buildPairingSet, isPairingItemEligible } from "./pairing";

/** A practice run never deals more cards than this, including after a shuffle. */
export const MAX_PRACTICE_CARDS = 15;

function zeroRandom(): number {
  return 0;
}

/** How many cards `partClips` become inside a lesson. Placement randomness does not change the count. */
export function practiceCardCount<C extends OrderSourceClip>(
  partClips: readonly C[],
  lessonClips: readonly C[],
): number {
  return insertDiscreteCards(
    buildPracticeDeck(partClips, lessonClips, zeroRandom),
    partClips,
    lessonClips,
    [],
    zeroRandom,
  ).length;
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
    const germanChoice = hasTranslation && isGermanChoiceEligible(clip, lessonClips);
    // Must mirror the cards buildPracticeDeck and insertDiscreteCards deal per clip.
    const base = clip.answer
      ? 1 + (multipleChoice ? 1 : 0)
      : 1 +
        (clip.sentenceOrder && hasTranslation ? 1 : 0) +
        (multipleChoice ? 1 : 0) +
        (hasTranslation ? 1 : 0) +
        (germanChoice ? 1 : 0) +
        (hasReplyChoice(clip) ? 1 : 0);
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
 * Adds one multiple-choice card per eligible clip in `partClips`, one
 * Vietnamese-prompt typing card per translated clip, one Vietnamese-to-German
 * multiple-choice card when enough German distractors exist, and as many
 * 5-clip pairing cards as `partClips` has eligible clips for, to a deck that
 * already has a listening (and possibly order) card for every part clip.
 *
 * Pairing groups are built first and only from `partClips` — every clip in a
 * pairing set must already have a listening card in this deck, since the
 * pairing card is inserted right after the last of its 5 anchors' listening
 * cards. MC distractor text, by contrast, doesn't need its own listening
 * card (it's just wrong-answer text), so it can be drawn from the wider
 * `lessonClips` (and optionally `levelClips`) — the same precedent
 * `buildWordBank` already uses for order-card distractor words.
 */
export function insertDiscreteCards<C extends OrderSourceClip>(
  deck: readonly PracticeCard<C>[],
  partClips: readonly C[],
  lessonClips: readonly C[],
  levelClips: readonly C[] = [],
  random: () => number = Math.random,
): PracticeCard<C>[] {
  const next = [...deck];
  const usedForPairing = new Set<string>();

  function listeningIndexOf(clipId: string): number {
    return next.findIndex((card) => isAnchorKind(card.kind) && card.clip.id === clipId);
  }

  function insertAfter(anchorIndex: number, card: PracticeCard<C>): void {
    const earliest = Math.min(anchorIndex + 2, next.length);
    const span = next.length - earliest + 1;
    const at = earliest + Math.min(span - 1, Math.floor(random() * span));
    next.splice(at, 0, card);
  }

  for (;;) {
    const set = buildPairingSet(partClips, [], usedForPairing, random);
    if (!set) break;
    for (const clip of set) usedForPairing.add(clip.id);
    const anchorIndex = Math.max(...set.map((clip) => listeningIndexOf(clip.id)));
    insertAfter(anchorIndex, {
      key: `pairing:${set.map((clip) => clip.id).join("+")}`,
      kind: "pairing",
      clip: set[0],
      pairItems: set,
    });
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

  for (const clip of partClips) {
    // A number clip's script is spelled out; typing it from Vietnamese is not the skill.
    if (!clip.translationVi?.trim() || clip.answer) continue;
    const anchorIndex = listeningIndexOf(clip.id);
    if (anchorIndex === -1) continue;
    insertAfter(anchorIndex, {
      key: `${clip.id}:vi-input`,
      kind: "vi-input",
      clip,
    });
  }

  for (const clip of partClips) {
    if (!clip.translationVi?.trim() || !clip.script.trim() || clip.answer) continue;
    const options = buildDeMcOptions(clip, lessonClips, levelClips, random);
    if (!options) continue;
    const anchorIndex = listeningIndexOf(clip.id);
    if (anchorIndex === -1) continue;
    insertAfter(anchorIndex, {
      key: `${clip.id}:vi-choice`,
      kind: "vi-choice",
      clip,
      options,
    });
  }

  for (const clip of partClips) {
    const translationVi = clip.translationVi;
    if (!translationVi || !translationVi.trim()) continue;
    const options = buildMcOptions({ ...clip, translationVi }, lessonClips, levelClips, random);
    if (!options) continue;
    const anchorIndex = listeningIndexOf(clip.id);
    if (anchorIndex === -1) continue;
    insertAfter(anchorIndex, {
      key: `${clip.id}:mc`,
      kind: "multiple-choice",
      clip,
      options,
    });
  }

  return next;
}
