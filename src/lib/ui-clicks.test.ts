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
  const once = addUiClick([], "nav.quests", BEFORE_MIDNIGHT);
  const twice = addUiClick(once, "nav.quests", BEFORE_MIDNIGHT);
  const nextDay = addUiClick(twice, "nav.quests", MIDNIGHT);
  assert.deepEqual(nextDay, [
    { target: "nav.quests", day: "2026-10-01", count: 2 },
    { target: "nav.quests", day: "2026-10-02", count: 1 },
  ]);
});

test("a failed flush folds the batch back onto clicks that arrived since", () => {
  const merged = mergeUiClicks(
    [{ target: "nav.learn", day: "2026-10-02", count: 2 }],
    [{ target: "nav.learn", day: "2026-10-02", count: 1 }],
  );
  assert.deepEqual(merged, [{ target: "nav.learn", day: "2026-10-02", count: 3 }]);
});

test("a flush sends at most 20 targets and 50 taps of each", () => {
  const pending = [
    { target: "nav.learn" as const, day: "2026-10-02", count: UI_CLICK_MAX_COUNT + 10 },
    ...Array.from({ length: UI_CLICK_MAX_TARGETS }, (_, index) => ({
      target: "nav.quests" as const,
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

test("the server keeps today and yesterday and drops everything else", () => {
  const accepted = acceptUiClicks(
    {
      clicks: [
        { target: "nav.duel", day: "2026-10-02", count: 2 },
        { target: "nav.learn", day: "2026-10-01", count: 1 },
        { target: "nav.badges", day: "2026-09-01", count: 4 },
        { target: "not-a-control", day: "2026-10-02", count: 9 },
        { target: "nav.quests", day: "2026-10-02", count: UI_CLICK_MAX_COUNT + 1 },
        { target: "nav.learn", day: "2026-10-01", count: 3 },
      ],
    },
    MIDNIGHT,
  );
  assert.deepEqual(accepted, [
    { target: "nav.duel", day: "2026-10-02", count: 2 },
    { target: "nav.learn", day: "2026-10-01", count: 4 },
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
        { target: "nav.badges", label: "Huy hiệu", count: 1 },
        { target: "nav.learn", label: "Học", count: 1 },
      ],
    },
    {
      loggedAt: "2026-10-07T05:56:10.000Z",
      clicks: [{ target: "nav.badges", label: "Huy hiệu", count: 1 }],
    },
    {
      loggedAt: "2026-10-07T07:00:00.000Z",
      clicks: [{ target: "nav.quests", label: "Nhiệm vụ", count: 4 }],
    },
  ]);
  assert.deepEqual(placed.byVisitId.get("early"), [
    { target: "nav.badges", label: "Huy hiệu", count: 2 },
    { target: "nav.learn", label: "Học", count: 1 },
  ]);
  assert.equal(placed.byVisitId.has("later"), false);
  assert.equal(placed.unmatched.length, 1);
  assert.equal(placed.unmatched[0]?.clicks[0]?.target, "nav.quests");
});

test("a visit describes each tab opening", () => {
  assert.equal(describeVisitClick({ target: "nav.duel", label: "Đấu", count: 1 }), "Opened the Đấu tab once");
  assert.equal(
    describeVisitClick({ target: "duel.ready", label: "Đấu", count: 1 }),
    "Opened the Đấu tab once, start available",
  );
  assert.equal(
    describeVisitClick({ target: "duel.locked.study", label: "Đấu", count: 2 }),
    "Opened the Đấu tab 2 times, start locked, study more first",
  );
  assert.equal(
    describeVisitClick({ target: "nav.learn", label: "Học", count: 3 }),
    "Opened the Học tab 3 times",
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

test("click totals sort by count", () => {
  assert.deepEqual(
    summarizeUiClicks([
      { target: "nav.learn", count: 2 },
      { target: "nav.learn", count: 1 },
      { target: "nav.quests", count: 8 },
      { target: "made-up", count: 100 },
    ]),
    [
      { target: "nav.quests", label: "Nhiệm vụ", count: 8 },
      { target: "nav.learn", label: "Học", count: 3 },
    ],
  );
});
