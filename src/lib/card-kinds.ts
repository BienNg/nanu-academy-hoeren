/**
 * The kinds of practice cards a clip can become, shared by regular practice
 * decks (sentence-order.ts), duels (duels.ts), and Blitzrunde. No imports so
 * the node tests can compile this file on its own.
 */

export type CardKind = "listening" | "order" | "multiple-choice" | "pairing";
