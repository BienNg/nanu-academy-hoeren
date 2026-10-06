/**
 * Practice on a CEFR trail node. The cards of every study part in the node are
 * dealt from one seed, then cut into the fewest even parts of at most
 * MAX_PRACTICE_CARDS, without splitting a study part's order cards.
 * The browser, the server and the admin catalog all build the same parts from
 * the lesson's clips, so a part number names the same cards everywhere.
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { seedToRandom } from "./blitzrunde";
import { capOrderCards, dealPracticePart, MAX_PRACTICE_CARDS } from "./practice-deck";
import { lessonNodeParts, type PracticeNodePart } from "./progress";
import type { OrderSourceClip, PracticeCard } from "./sentence-order";

function nodeSeed(lessonKey: string, node: number): string {
  return `practice:${lessonKey}:${node}`;
}

/**
 * Cuts `cards` into the fewest contiguous parts of at most `max` cards, as
 * even as that allows. Each entry of `blocks` is a run of cards that stays in
 * one part; every other card may sit on either side of a cut. Blocks longer
 * than `max` are cut like any other cards.
 */
export function cutPracticeCards<T>(
  cards: readonly T[],
  blocks: readonly { start: number; length: number }[] = [],
  max: number = MAX_PRACTICE_CARDS,
): T[][] {
  if (cards.length === 0) return [];
  const limit = Math.max(1, max);
  const kept = blocks.filter((block) => block.length > 1 && block.length <= limit);
  const cuttable = (at: number) =>
    !kept.some((block) => at > block.start && at < block.start + block.length);
  const cuts = [0];
  for (let at = 1; at < cards.length; at += 1) if (cuttable(at)) cuts.push(at);
  cuts.push(cards.length);

  // best[j][i]: the smallest largest part when cuts[0..i] is split into j parts.
  const n = cuts.length - 1;
  for (let count = Math.ceil(cards.length / limit); count <= n; count += 1) {
    const best = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(Infinity));
    const from = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(-1));
    best[0]![0] = 0;
    for (let j = 1; j <= count; j += 1) {
      for (let i = 1; i <= n; i += 1) {
        for (let p = i - 1; p >= 0; p -= 1) {
          const size = cuts[i]! - cuts[p]!;
          if (size > limit) break;
          const value = Math.max(best[j - 1]![p]!, size);
          if (value < best[j]![i]!) {
            best[j]![i] = value;
            from[j]![i] = p;
          }
        }
      }
    }
    if (best[count]![n] === Infinity) continue;
    const parts: T[][] = [];
    let i = n;
    for (let j = count; j > 0; j -= 1) {
      const p = from[j]![i]!;
      parts.unshift(cards.slice(cuts[p], cuts[i]));
      i = p;
    }
    return parts;
  }
  return [cards.slice()];
}

/**
 * Cards of each practice node, cut into parts. Each study part is dealt by
 * dealPracticePart, in order, from one seed per node. The order cards at the
 * end of a study part are never split across two parts, and each part keeps
 * at most MAX_ORDER_CARDS of them.
 */
export function practiceNodeDecks<C extends OrderSourceClip>(
  lessonKey: string,
  clips: readonly C[],
): PracticeCard<C>[][][] {
  return lessonNodeParts(clips).map((studyParts, index) => {
    const random = seedToRandom(nodeSeed(lessonKey, index + 1));
    const cards: PracticeCard<C>[] = [];
    const blocks: { start: number; length: number }[] = [];
    for (const part of studyParts) {
      const dealt = dealPracticePart(part, clips, [], random);
      const orders = dealt.filter((card) => card.kind === "order").length;
      blocks.push({ start: cards.length + dealt.length - orders, length: orders });
      cards.push(...dealt);
    }
    return cutPracticeCards(cards, blocks).map((part) => capOrderCards(part, random));
  });
}

/** FNV-1a, so a part key is short and changes with its cards. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** What progress and XP need from each part: its key, clips and the clips it completes. */
export function practicePartLayout<C extends OrderSourceClip>(
  decks: readonly (readonly (readonly PracticeCard<C>[])[])[],
): PracticeNodePart[][] {
  return decks.map((parts) => {
    const lastPart = new Map<string, number>();
    parts.forEach((cards, index) => {
      for (const card of cards) lastPart.set(card.clip.id, index);
    });
    return parts.map((cards, index) => {
      const clipIds = [...new Set(cards.map((card) => card.clip.id))];
      return {
        key: `p${hashText(cards.map((card) => card.key).join(","))}`,
        clipIds,
        completes: clipIds.filter((id) => lastPart.get(id) === index),
        cardCount: cards.length,
      };
    });
  });
}

export function practiceNodeLayout<C extends OrderSourceClip>(
  lessonKey: string,
  clips: readonly C[],
): PracticeNodePart[][] {
  return practicePartLayout(practiceNodeDecks(lessonKey, clips));
}
