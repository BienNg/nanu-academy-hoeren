/**
 * Practice on a CEFR trail node. The cards of every study part in the node are
 * dealt from one seed, then cut into even parts of at most MAX_PRACTICE_CARDS.
 * The browser, the server and the admin catalog all build the same parts from
 * the lesson's clips, so a part number names the same cards everywhere.
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { seedToRandom } from "./blitzrunde";
import { insertDiscreteCards, mixListeningChoice, MAX_PRACTICE_CARDS } from "./practice-deck";
import { lessonNodeParts, type PracticeNodePart } from "./progress";
import { buildPracticeDeck, type OrderSourceClip, type PracticeCard } from "./sentence-order";

function nodeSeed(lessonKey: string, node: number): string {
  return `practice:${lessonKey}:${node}`;
}

/** Even contiguous slices of at most `max` cards. */
export function splitPracticeCards<T>(cards: readonly T[], max: number = MAX_PRACTICE_CARDS): T[][] {
  if (cards.length === 0) return [];
  const count = Math.ceil(cards.length / Math.max(1, max));
  const base = Math.floor(cards.length / count);
  const extra = cards.length % count;
  const parts: T[][] = [];
  let index = 0;
  for (let part = 0; part < count; part += 1) {
    const size = base + (part < extra ? 1 : 0);
    parts.push(cards.slice(index, index + size));
    index += size;
  }
  return parts;
}

/**
 * Cards of each practice node, cut into parts. Each study part deals its cards
 * as before, in order, so card counts match a deck built per study part.
 */
export function practiceNodeDecks<C extends OrderSourceClip>(
  lessonKey: string,
  clips: readonly C[],
): PracticeCard<C>[][][] {
  return lessonNodeParts(clips).map((studyParts, index) => {
    const random = seedToRandom(nodeSeed(lessonKey, index + 1));
    const cards = studyParts.flatMap((part) =>
      mixListeningChoice(
        insertDiscreteCards(buildPracticeDeck(part, clips, random), part, clips, [], random),
        clips,
        [],
        random,
      ),
    );
    return splitPracticeCards(cards);
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
