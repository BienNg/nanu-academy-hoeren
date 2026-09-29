import assert from "node:assert/strict";
import test from "node:test";
import {
  BLITZRUNDE_DURATION_MS,
  MAX_QUESTION_POINTS,
  buildBlitzrundeDeck,
  canStartRanked,
  compareParticipants,
  deckKindCounts,
  formatRemaining,
  isBlitzrundeSchemaMissing,
  nextStreak,
  pairingAccuracy,
  parseHeartbeatIndex,
  parseSubmitBundle,
  participantStatus,
  questionPoints,
  rankParticipants,
  remainingMs,
  seedToRandom,
  speedFactor,
  summarizeAnswers,
  type AnswerRecord,
} from "./blitzrunde";

const lektion = [
  { id: "hallo", script: "Hallo", translationVi: "Xin chào" },
  { id: "danke", script: "Danke", translationVi: "Cảm ơn" },
  { id: "tschuess", script: "Tschüss", translationVi: "Tạm biệt" },
  { id: "bitte", script: "Bitte", translationVi: "Làm ơn" },
  { id: "morgen", script: "Guten Morgen", translationVi: "Chào buổi sáng" },
  { id: "ja", script: "Ja", translationVi: "Vâng" },
  { id: "name", script: "Wie heißen Sie?", translationVi: "Bạn tên là gì?" },
  { id: "komme", script: "Ich komme aus Vietnam.", translationVi: "Tôi đến từ Việt Nam." },
  { id: "wohne", script: "Ich wohne in Berlin.", translationVi: "Tôi sống ở Berlin." },
  { id: "lerne", script: "Ich lerne jetzt Deutsch.", translationVi: "Tôi học tiếng Đức." },
];

const level = [
  ...lektion,
  { id: "nein", script: "Nein", translationVi: "Không" },
  { id: "abend", script: "Guten Abend", translationVi: "Chào buổi tối" },
  { id: "arbeite", script: "Ich arbeite hier.", translationVi: "Tôi làm việc ở đây." },
];

test("the same seed always builds the same deck, a different seed shuffles it", () => {
  const first = buildBlitzrundeDeck({ lektionClips: lektion, levelClips: level, seed: "abc" });
  const again = buildBlitzrundeDeck({ lektionClips: lektion, levelClips: level, seed: "abc" });
  const other = buildBlitzrundeDeck({ lektionClips: lektion, levelClips: level, seed: "xyz" });
  assert.deepEqual(first, again);
  assert.equal(other.length, first.length);
  assert.notDeepEqual(
    other.map((card) => card.kind),
    first.map((card) => card.kind),
  );
});

test("the deck never has listening cards and positions run 0..n-1", () => {
  const deck = buildBlitzrundeDeck({ lektionClips: lektion, levelClips: level, seed: "pos" });
  assert.ok(deck.length > 0);
  deck.forEach((card, index) => assert.equal(card.position, index));
  for (const card of deck) {
    assert.ok(["order", "multiple-choice", "pairing"].includes(card.kind));
  }
});

test("each clip is paired at most once, and pairing sets are mostly this Lektion", () => {
  const deck = buildBlitzrundeDeck({ lektionClips: lektion, levelClips: level, seed: "pair" });
  const lektionIds = new Set(lektion.map((clip) => clip.id));
  const paired = new Set<string>();
  for (const card of deck) {
    if (card.kind !== "pairing") continue;
    assert.equal(card.items.length, 5);
    assert.ok(card.clipIds.filter((id) => lektionIds.has(id)).length >= 3);
    for (const id of card.clipIds) {
      assert.ok(!paired.has(id), `${id} paired twice`);
      paired.add(id);
    }
  }
  assert.ok(deckKindCounts(deck).pairing >= 1);
});

test("order cards carry the script and a word bank, MC cards exactly one correct option", () => {
  const deck = buildBlitzrundeDeck({ lektionClips: lektion, levelClips: level, seed: "shape" });
  const counts = deckKindCounts(deck);
  assert.ok(counts.order >= 1);
  assert.ok(counts["multiple-choice"] >= 1);
  for (const card of deck) {
    if (card.kind === "order") {
      assert.ok(card.script.length > 0);
      assert.ok(card.bank.length >= card.script.split(/\s+/).length);
    }
    if (card.kind === "multiple-choice") {
      assert.equal(card.options.filter((option) => option.correct).length, 1);
    }
  }
});

test("an empty Lektion gives an empty deck", () => {
  assert.deepEqual(buildBlitzrundeDeck({ lektionClips: [], levelClips: level, seed: "x" }), []);
});

test("seeded random stays within [0, 1)", () => {
  const random = seedToRandom("range");
  for (let i = 0; i < 1000; i += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
});

test("speed decays to a floor and points reward accuracy, speed and streak", () => {
  assert.equal(speedFactor(0), 1);
  assert.equal(speedFactor(20_000), 0.3);
  assert.equal(speedFactor(60_000), 0.3);
  assert.equal(questionPoints(0, 0, 5), 0);
  assert.equal(questionPoints(100, 0, 0), 1000);
  assert.equal(questionPoints(100, 0, 5), 1500);
  assert.equal(questionPoints(100, 0, 99), MAX_QUESTION_POINTS);
  assert.equal(questionPoints(60, 0, 0), 600);
  assert.ok(questionPoints(100, 2_000, 0) > questionPoints(100, 10_000, 0));
});

test("only a fully correct answer extends the streak", () => {
  assert.equal(nextStreak(100, 2), 3);
  assert.equal(nextStreak(99, 2), 0);
  assert.equal(nextStreak(0, 4), 0);
});

test("pairing accuracy drops one fifth per wrong pair and bottoms out at zero", () => {
  assert.equal(pairingAccuracy(0), 100);
  assert.equal(pairingAccuracy(2), 60);
  assert.equal(pairingAccuracy(9), 0);
});

function answer(position: number, accuracy: number, timeMs: number, streak: number): AnswerRecord {
  return {
    position,
    kind: "multiple-choice",
    accuracy,
    timeMs,
    points: questionPoints(accuracy, timeMs, 0),
    streak,
    answer: "correct",
  };
}

test("summary adds points and counts correct answers and the longest streak", () => {
  const summary = summarizeAnswers([answer(0, 100, 1000, 1), answer(1, 100, 3000, 2), answer(2, 0, 2000, 0)]);
  assert.equal(summary.answered, 3);
  assert.equal(summary.correct, 2);
  assert.equal(summary.avgMs, 2000);
  assert.equal(summary.longestStreak, 2);
  assert.equal(summarizeAnswers([]).avgMs, 0);
});

const base = { finalScore: 1000, answered: 5, correct: 4, avgMs: 3000, longestStreak: 3, completedDeck: false };

test("ranking breaks ties by correct answers, finished deck, speed, then streak", () => {
  assert.ok(compareParticipants({ ...base, finalScore: 1200 }, base) < 0);
  assert.ok(compareParticipants({ ...base, correct: 5 }, base) < 0);
  assert.ok(compareParticipants({ ...base, completedDeck: true }, base) < 0);
  assert.ok(compareParticipants({ ...base, avgMs: 2000 }, base) < 0);
  assert.ok(compareParticipants({ ...base, longestStreak: 4 }, base) < 0);
});

test("exact ties share a rank", () => {
  const ranked = rankParticipants([
    { ...base, name: "B", finalScore: 500 },
    { ...base, name: "A" },
    { ...base, name: "C" },
  ]);
  assert.deepEqual(
    ranked.map((entry) => [entry.name, entry.rank]),
    [
      ["A", 1],
      ["C", 1],
      ["B", 3],
    ],
  );
});

test("a round is ranked only with two or more students", () => {
  assert.equal(canStartRanked(1), false);
  assert.equal(canStartRanked(2), true);
});

test("participant status reflects submissions and heartbeats", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  const fresh = "2026-09-29T09:59:50Z";
  const old = "2026-09-29T09:58:00Z";
  assert.equal(participantStatus({ sessionStatus: "lobby", submittedAt: null, lastSeenAt: null, now }), "waiting");
  assert.equal(participantStatus({ sessionStatus: "active", submittedAt: null, lastSeenAt: fresh, now }), "playing");
  assert.equal(participantStatus({ sessionStatus: "active", submittedAt: null, lastSeenAt: old, now }), "disconnected");
  assert.equal(participantStatus({ sessionStatus: "active", submittedAt: fresh, lastSeenAt: old, now }), "finished");
  assert.equal(participantStatus({ sessionStatus: "ended", submittedAt: null, lastSeenAt: old, now }), "disconnected");
  assert.equal(participantStatus({ sessionStatus: "ended", submittedAt: null, lastSeenAt: null, now }), "no_result");
});

test("remaining time counts down from ends_at and never goes negative", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  assert.equal(remainingMs("2026-09-29T10:01:00Z", now), 60_000);
  assert.equal(remainingMs("2026-09-29T09:59:00Z", now), 0);
  assert.equal(remainingMs(null, now), BLITZRUNDE_DURATION_MS);
  assert.equal(formatRemaining(61_000), "1:01");
  assert.equal(formatRemaining(0), "0:00");
});

test("a valid result bundle parses; out-of-order or out-of-range values are rejected", () => {
  const good = {
    finishReason: "time_up",
    answers: [
      { position: 0, kind: "order", accuracy: 100, timeMs: 1200, points: 900, streak: 1, answer: ["Ich", "komme"] },
      { position: 1, kind: "multiple-choice", accuracy: 0, timeMs: 800, points: 0, streak: 0, answer: "d1" },
      { position: 2, kind: "pairing", accuracy: 60, timeMs: 9000, points: 400, streak: 0, answer: 2 },
    ],
  };
  const parsed = parseSubmitBundle(good, 10);
  assert.equal(parsed?.answers.length, 3);
  assert.equal(parsed?.finishReason, "time_up");

  assert.equal(parseSubmitBundle({ ...good, finishReason: "nope" }, 10), null);
  assert.equal(parseSubmitBundle(good, 2), null);
  const skipped = { ...good, answers: [good.answers[0], good.answers[2]] };
  assert.equal(parseSubmitBundle(skipped, 10), null);
  const inflated = { ...good, answers: [{ ...good.answers[0], points: MAX_QUESTION_POINTS + 1 }] };
  assert.equal(parseSubmitBundle(inflated, 10), null);
  const badAnswer = { ...good, answers: [{ ...good.answers[0], answer: "not-a-list" }] };
  assert.equal(parseSubmitBundle(badAnswer, 10), null);
  assert.deepEqual(parseSubmitBundle({ finishReason: "deck_done", answers: [] }, 10)?.answers, []);
});

test("heartbeat index must be within the deck", () => {
  assert.equal(parseHeartbeatIndex({ index: 3 }, 10), 3);
  assert.equal(parseHeartbeatIndex({ index: 10 }, 10), 10);
  assert.equal(parseHeartbeatIndex({ index: 11 }, 10), null);
  assert.equal(parseHeartbeatIndex({ index: -1 }, 10), null);
});

test("schema hint only matches missing blitzrunde tables", () => {
  assert.equal(isBlitzrundeSchemaMissing("relation \"public.blitzrunde_sessions\" does not exist"), true);
  assert.equal(isBlitzrundeSchemaMissing("relation \"public.duels\" does not exist"), false);
});
