import assert from "node:assert/strict";
import test from "node:test";
import {
  UI_CLICK_MAX_COUNT,
  UI_CLICK_MAX_TARGETS,
  acceptUiClicks,
  addUiClick,
  mergeUiClicks,
  placeUiClickGroups,
  describeVisitClick,
  summarizeUiClicks,
  takeUiClickBatch,
  vietnamCalendarDay,
} from "./ui-clicks.js";

const MIDNIGHT = Date.parse("2026-10-01T17:00:00.000Z");
const BEFORE_MIDNIGHT = Date.parse("2026-10-01T16:59:59.000Z");

test("a tap just before Vietnam midnight stays on that calendar day", () => {
  assert.equal(vietnamCalendarDay(BEFORE_MIDNIGHT), "2026-10-01");
  assert.equal(vietnamCalendarDay(MIDNIGHT), "2026-10-02");
});

test("repeated taps of one control on the same day add up", () => {
  const once = addUiClick([], "duel.ready", BEFORE_MIDNIGHT);
  const twice = addUiClick(once, "duel.ready", BEFORE_MIDNIGHT);
  const nextDay = addUiClick(twice, "duel.challenge.accept", MIDNIGHT);
  assert.deepEqual(nextDay, [
    { target: "duel.ready", day: "2026-10-01", count: 2 },
    { target: "duel.challenge.accept", day: "2026-10-02", count: 1 },
  ]);
});

test("a failed flush folds the batch back onto clicks that arrived since", () => {
  const merged = mergeUiClicks(
    [{ target: "duel.ready", day: "2026-10-02", count: 2 }],
    [{ target: "duel.ready", day: "2026-10-02", count: 1 }],
  );
  assert.deepEqual(merged, [{ target: "duel.ready", day: "2026-10-02", count: 3 }]);
});

test("a flush sends at most 20 targets and 50 taps of each", () => {
  const pending = [
    { target: "duel.ready" as const, day: "2026-10-02", count: UI_CLICK_MAX_COUNT + 10 },
    ...Array.from({ length: UI_CLICK_MAX_TARGETS }, (_, index) => ({
      target: "duel.challenge.accept" as const,
      day: `2026-09-${String(index + 1).padStart(2, "0")}`,
      count: 1,
    })),
  ];
  const { batch, rest } = takeUiClickBatch(pending);
  assert.equal(batch.length, UI_CLICK_MAX_TARGETS);
  assert.equal(batch[0]?.count, UI_CLICK_MAX_COUNT);
  assert.equal(rest[0]?.count, 10);
  assert.equal(rest.length, 2);
});

test("the server keeps today and yesterday and drops tab opens", () => {
  const accepted = acceptUiClicks(
    {
      clicks: [
        { target: "duel.ready", day: "2026-10-02", count: 2 },
        { target: "nav.learn", day: "2026-10-01", count: 1 },
        { target: "nav.badges", day: "2026-09-01", count: 4 },
        { target: "not-a-control", day: "2026-10-02", count: 9 },
        { target: "nav.quests", day: "2026-10-02", count: UI_CLICK_MAX_COUNT + 1 },
        { target: "duel.challenge.accept", day: "2026-10-01", count: 3 },
        { target: "duel.ready", day: "2026-10-02", count: 1 },
      ],
    },
    MIDNIGHT,
  );
  assert.deepEqual(accepted, [
    { target: "duel.ready", day: "2026-10-02", count: 3 },
    { target: "duel.challenge.accept", day: "2026-10-01", count: 3 },
  ]);
});

test("a flush lands on the visit that was open, not on a later one", () => {
  const visits = [
    { id: "early", startedAt: "2026-10-07T05:55:00.000Z", endedAt: "2026-10-07T05:55:10.000Z" },
    { id: "later", startedAt: "2026-10-07T08:00:00.000Z", endedAt: "2026-10-07T08:10:00.000Z" },
  ];
  const placed = placeUiClickGroups(visits, [
    {
      loggedAt: "2026-10-07T05:55:40.000Z",
      clicks: [
        { target: "duel.challenge.accept", label: "Chấp nhận", count: 1 },
        { target: "duel.ready", label: "Đấu", count: 1 },
      ],
    },
    {
      loggedAt: "2026-10-07T05:56:10.000Z",
      clicks: [{ target: "duel.challenge.accept", label: "Chấp nhận", count: 1 }],
    },
    {
      loggedAt: "2026-10-07T07:00:00.000Z",
      clicks: [{ target: "duel.challenge.later", label: "Để sau", count: 4 }],
    },
  ]);
  assert.deepEqual(placed.byVisitId.get("early"), [
    { target: "duel.challenge.accept", label: "Chấp nhận", count: 2 },
    { target: "duel.ready", label: "Đấu", count: 1 },
  ]);
  assert.equal(placed.byVisitId.has("later"), false);
  assert.equal(placed.unmatched.length, 1);
  assert.equal(placed.unmatched[0]?.clicks[0]?.target, "duel.challenge.later");
});

test("a visit describes a duel open and a challenge choice", () => {
  assert.equal(
    describeVisitClick({ target: "duel.ready", label: "Đấu", count: 1 }),
    "Opened the Đấu tab once, start available",
  );
  assert.equal(
    describeVisitClick({ target: "duel.locked.study", label: "Đấu", count: 2 }),
    "Opened the Đấu tab 2 times, start locked, study more first",
  );
  assert.equal(
    describeVisitClick({ target: "duel.challenge.accept", label: "Chấp nhận", count: 1 }),
    "Accepted the challenge once",
  );
  assert.equal(
    describeVisitClick({ target: "duel.challenge.later", label: "Để sau", count: 2 }),
    "Left the challenge for later 2 times",
  );
});

test("click totals drop tab opens and sort by count", () => {
  assert.deepEqual(
    summarizeUiClicks([
      { target: "duel.ready", count: 2 },
      { target: "duel.ready", count: 1 },
      { target: "nav.quests", count: 8 },
      { target: "nav.learn", count: 3 },
      { target: "duel.challenge.accept", count: 4 },
      { target: "made-up", count: 100 },
    ]),
    [
      { target: "duel.challenge.accept", label: "Chấp nhận", count: 4 },
      { target: "duel.ready", label: "Đấu", count: 3 },
    ],
  );
});
