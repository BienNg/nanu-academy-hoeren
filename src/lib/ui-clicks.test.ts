import assert from "node:assert/strict";
import test from "node:test";
import {
  UI_CLICK_MAX_COUNT,
  UI_CLICK_MAX_TARGETS,
  acceptUiClicks,
  addUiClick,
  mergeUiClicks,
  summarizeUiClicks,
  takeUiClickBatch,
  uiClickRangeDays,
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

test("the admin range is inclusive Vietnam days", () => {
  assert.deepEqual(uiClickRangeDays("today", MIDNIGHT), { from: "2026-10-02", to: "2026-10-02" });
  assert.deepEqual(uiClickRangeDays("7d", MIDNIGHT), { from: "2026-09-26", to: "2026-10-02" });
  assert.equal(uiClickRangeDays("all", MIDNIGHT), null);
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
