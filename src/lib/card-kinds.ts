/**
 * The kinds of practice cards a clip can become, shared by regular practice
 * decks (sentence-order.ts), duels (duels.ts), and Blitzrunde. No imports so
 * the node tests can compile this file on its own.
 */

export const CARD_KINDS = [
  "listening",
  "order",
  "multiple-choice",
  "vi-choice",
  "vi-input",
  "pairing",
] as const;

export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  listening: "Listening",
  order: "Sentence order",
  "multiple-choice": "Multiple choice",
  "vi-choice": "Vietnamese → German choice",
  "vi-input": "Vietnamese → type German",
  pairing: "Pairing",
};
