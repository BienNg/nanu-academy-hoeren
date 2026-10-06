/**
 * The kinds of practice cards a clip can become, shared by regular practice
 * decks (sentence-order.ts), duels (duels.ts), and Blitzrunde. No imports so
 * the node tests can compile this file on its own.
 */

export const CARD_KINDS = [
  "listening",
  "listening-choice",
  "listening-order",
  "order",
  "multiple-choice",
  "vi-choice",
  "vi-input",
  "pairing",
] as const;

export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  listening: "Listening",
  "listening-choice": "Listening → meaning choice",
  "listening-order": "Listening → sentence order",
  order: "Sentence order",
  "multiple-choice": "Multiple choice",
  "vi-choice": "Vietnamese → German choice",
  "vi-input": "Vietnamese → type German",
  pairing: "Pairing",
};

/** Practice cards whose first wrong try is stored on the clip. Reply, number and grammar gap stay separate from the stats kinds they roll up into. */
export const MISSED_ATTEMPT_KINDS = [
  "listening",
  "listening-choice",
  "listening-order",
  "number-input",
  "order",
  "multiple-choice",
  "reply-choice",
  "vi-choice",
  "vi-input",
  "pairing",
  "grammar-gap",
] as const;

export type MissedAttemptKind = (typeof MISSED_ATTEMPT_KINDS)[number];

export const MISSED_ATTEMPT_LABEL: Record<MissedAttemptKind, string> = {
  listening: "Listening",
  "listening-choice": "Listening → meaning choice",
  "listening-order": "Listening → sentence order",
  "number-input": "Number",
  order: "Sentence order",
  "multiple-choice": "Multiple choice",
  "reply-choice": "Reply",
  "vi-choice": "Vietnamese → German choice",
  "vi-input": "Vietnamese → type German",
  pairing: "Pairing",
  "grammar-gap": "Grammar gap",
};
