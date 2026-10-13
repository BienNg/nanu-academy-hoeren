/**
 * Grammar-world practice log: a finished part, the first wrong answer on each
 * card, and a start row so a part left in the middle still shows up.
 * Relative imports only, so the node tests can compile this file.
 */

import { GRAMMAR_CARD_KINDS, type GrammarCardKind } from "./grammar-node";

export type GrammarWorldRunOutcome = "success" | "fail";

export type GrammarWorldCardInput = {
  key: string;
  kind: GrammarCardKind;
  position: number;
  missed: boolean;
  /** First wrong answer. Empty when the first try was right. */
  answer: string;
};

export type GrammarWorldRunInput = {
  id: string;
  topicId: string;
  review: boolean;
  node: number;
  part: number;
  outcome: GrammarWorldRunOutcome;
  accuracy: number;
  cardCount: number;
  elapsedMs: number;
  cards: GrammarWorldCardInput[];
};

export type GrammarWorldStartInput = {
  id: string;
  topicId: string;
  review: boolean;
  node: number;
  part: number;
  cardCount: number;
};

export type GrammarWorldLeftInput = {
  id: string;
  cardsDone: number;
};

export type GrammarWorldRunRow = {
  id: string;
  userId: string;
  topicId: string;
  node: number;
  part: number;
  review: boolean;
  outcome: GrammarWorldRunOutcome;
  accuracy: number;
  answeredCount: number;
  cardCount: number;
  elapsedMs: number;
  createdAt: string;
};

export type GrammarWorldLeftRow = {
  id: string;
  userId: string;
  topicId: string;
  node: number;
  part: number;
  review: boolean;
  cardCount: number;
  startedAt: string;
  leftAt: string | null;
  cardsDone: number | null;
};

export type GrammarWorldMissRow = {
  runId: string;
  cardKey: string;
  kind: string;
  position: number;
  answer: string;
};

export type GrammarWorldTopicLabel = {
  id: string;
  titleDe: string;
  titleVi: string;
  areaDe: string;
};

export type GrammarWorldLogStatus = "ready" | "missing" | "error";

export const GRAMMAR_WORLD_RUN_SCHEMA_HINT =
  "Run supabase/grammar_world_runs.sql once in the Supabase SQL editor.";

const RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOPIC_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARD_KINDS = new Set<string>(GRAMMAR_CARD_KINDS);

function integer(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function place(record: Record<string, unknown>): { review: boolean; node: number; part: number } | null {
  if (typeof record.review !== "boolean") return null;
  if (typeof record.topicId !== "string" || !TOPIC_ID.test(record.topicId)) return null;
  const node = integer(record.node, 0, 99);
  const part = integer(record.part, 0, 99);
  if (node == null || part == null) return null;
  if (record.review) return { review: true, node: 0, part: 0 };
  if (node < 1 || part < 1) return null;
  return { review: false, node, part };
}

function readCards(value: unknown): GrammarWorldCardInput[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const cards: GrammarWorldCardInput[] = [];
  const positions = new Set<number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const card = entry as Record<string, unknown>;
    if (typeof card.key !== "string" || card.key.length < 1 || card.key.length > 120) return null;
    if (typeof card.kind !== "string" || !CARD_KINDS.has(card.kind)) return null;
    const position = integer(card.position, 0, 39);
    if (position == null || positions.has(position)) return null;
    positions.add(position);
    if (typeof card.missed !== "boolean") return null;
    if (typeof card.answer !== "string" || card.answer.length > 160) return null;
    if (!card.missed && card.answer !== "") return null;
    cards.push({
      key: card.key,
      kind: card.kind as GrammarCardKind,
      position,
      missed: card.missed,
      answer: card.missed ? card.answer : "",
    });
  }
  cards.sort((left, right) => left.position - right.position);
  return cards;
}

/** A finished grammar-world part the browser may log. Null when the body is not one. */
export function parseGrammarWorldRunInput(value: unknown): GrammarWorldRunInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !RUN_ID.test(record.id)) return null;
  const placed = place(record);
  if (!placed) return null;
  if (record.failed !== true && record.failed !== false) return null;
  const accuracy = integer(record.accuracy, 0, 100);
  const cardCount = integer(record.cardCount, 1, 40);
  const elapsedMs = integer(record.elapsedMs, 0, 24 * 60 * 60 * 1000);
  const cards = readCards(record.cards);
  if (accuracy == null || cardCount == null || elapsedMs == null || !cards || cards.length > cardCount) return null;
  return {
    id: record.id,
    topicId: record.topicId as string,
    ...placed,
    outcome: record.failed ? "fail" : "success",
    accuracy,
    cardCount,
    elapsedMs,
    cards,
  };
}

export function parseGrammarWorldStartInput(value: unknown): GrammarWorldStartInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !RUN_ID.test(record.id)) return null;
  const placed = place(record);
  const cardCount = integer(record.cardCount, 1, 40);
  if (!placed || cardCount == null) return null;
  return { id: record.id, topicId: record.topicId as string, ...placed, cardCount };
}

export function parseGrammarWorldLeftInput(value: unknown): GrammarWorldLeftInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !RUN_ID.test(record.id)) return null;
  const cardsDone = integer(record.cardsDone, 0, 40);
  if (cardsDone == null) return null;
  return { id: record.id, cardsDone };
}

export function isGrammarWorldRunSchemaMissing(message: string): boolean {
  return (
    /grammar_world_runs|grammar_world_cards|grammar_world_starts/i.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

/** Logs that a grammar-world part opened. The finish reuses `id`. Fire and forget. */
export function submitGrammarWorldStart(input: GrammarWorldStartInput): void {
  void fetch("/api/grammar-world-runs/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {
    // A missed start only hides one drop-off from the admin page.
  });
}

/** Stamps how far into the part the learner got before leaving. */
export function submitGrammarWorldLeft(input: GrammarWorldLeftInput): void {
  void fetch("/api/grammar-world-runs/left", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {
    // The start still counts as opened when the leave never lands.
  });
}
