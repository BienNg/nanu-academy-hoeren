import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_DAILY_CAP,
  assembleLeaderboard,
  dayKey,
  decidePartXp,
  formatWeekCountdown,
  googleProfileImage,
  isXpSchemaMissing,
  previewLeaderboardRows,
  weekEndsAt,
  weekKey,
  type BoardPerson,
  type LeaderboardRow,
  type LessonClip,
} from "./xp.js";
const NOW = new Date("2026-09-27T13:00:00.000Z");

function clips(count: number, script = "Hallo"): LessonClip[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    script,
  }));
}

function results(ids: readonly string[], missedEvery = 0) {
  return ids.map((clipId, index) => ({
    clipId,
    passed: true,
    missed: missedEvery > 0 && index % missedEvery === 0,
  }));
}

function decide(
  overrides: Partial<Parameters<typeof decidePartXp>[0]> = {},
  lesson: LessonClip[] = clips(10),
) {
  return decidePartXp({
    levelSlug: "a1-1",
    outcome: "success",
    elapsedMs: lesson.length * 2000,
    expectedCount: lesson.length,
    results: results(lesson.map((clip) => clip.id)),
    lessonClips: lesson,
    priorDayKeys: [],
    reviewXpToday: 0,
    now: NOW,
    ...overrides,
  });
}

test("Vietnam week starts Monday and rolls at local midnight", () => {
  assert.equal(dayKey(NOW), "2026-09-27");
  assert.equal(weekKey(NOW), "2026-09-21");
  assert.equal(weekEndsAt(NOW), "2026-09-27T17:00:00.000Z");

  const monday = new Date("2026-09-27T17:00:00.000Z");
  assert.equal(dayKey(monday), "2026-09-28");
  assert.equal(weekKey(monday), "2026-09-28");
});

test("countdown uses days, then hours", () => {
  assert.equal(formatWeekCountdown(weekEndsAt(NOW), NOW), "Còn 4 giờ");
  const earlier = new Date("2026-09-24T13:00:00.000Z");
  assert.equal(formatWeekCountdown(weekEndsAt(earlier), earlier), "Còn 3 ngày");
});

test("a perfect short A1 part pays 30 and a retried one pays less", () => {
  assert.equal(decide().xp, 30);
  assert.equal(decide().kind, "new");
  const lesson = clips(10);
  const retried = decide({
    results: results(
      lesson.map((clip) => clip.id),
      2,
    ),
  });
  assert.equal(retried.xp, 25);
});

test("longer sentences and higher bands pay more than short A1 clips", () => {
  const sentences = clips(10, "Ich heiße Anna und wohne in Berlin");
  assert.equal(decide({}, sentences).xp, 39);
  assert.equal(decide({ levelSlug: "b1-2" }).xp, 44);
  assert.equal(decide({ levelSlug: "b2-1" }).xp, 54);
});

test("review pays 40 percent until the daily cap, then the same part pays nothing", () => {
  const reviewed = decide({ priorDayKeys: ["2026-09-26"] });
  assert.equal(reviewed.kind, "review");
  assert.equal(reviewed.xp, 12);
  assert.equal(reviewed.store, true);

  const nearCap = decide({
    priorDayKeys: ["2026-09-26"],
    reviewXpToday: REVIEW_DAILY_CAP - 5,
  });
  assert.equal(nearCap.xp, 5);

  const capped = decide({
    priorDayKeys: ["2026-09-26"],
    reviewXpToday: REVIEW_DAILY_CAP,
  });
  assert.equal(capped.xp, 0);
  assert.equal(capped.kind, "review");

  const again = decide({ priorDayKeys: ["2026-09-27"] });
  assert.equal(again.kind, "repeat");
  assert.equal(again.xp, 0);
  assert.equal(again.store, false);
});

test("failed, too-fast, and mismatched runs do not earn XP", () => {
  assert.equal(decide({ outcome: "fail" }).kind, "fail");
  assert.equal(decide({ elapsedMs: 1999 }).kind, "rejected");
  assert.equal(decide({ results: results(["missing"]) }).kind, "rejected");
  assert.equal(decide({ expectedCount: null }).kind, "rejected");
});

test("a shuffled review part is scored by size, not catalog order", () => {
  const lesson = clips(21);
  const shuffled = lesson.slice(5, 15).map((clip) => clip.id);
  const award = decide(
    {
      expectedCount: 10,
      elapsedMs: 10 * 2000,
      results: results(shuffled),
    },
    lesson,
  );
  assert.equal(award.kind, "new");
  assert.equal(award.xp, 30);
  assert.equal(
    decide(
      {
        expectedCount: 10,
        elapsedMs: 11 * 2000,
        results: results(lesson.slice(0, 11).map((clip) => clip.id)),
      },
      lesson,
    ).kind,
    "rejected",
  );
});

test("schema hint only matches a missing xp_awards table", () => {
  assert.equal(
    isXpSchemaMissing("Could not find the table public.xp_awards in the schema cache"),
    true,
  );
  assert.equal(isXpSchemaMissing("listening_runs does not exist"), false);
});

function person(
  userId: string,
  xp: number,
  extras: Partial<BoardPerson> = {},
): BoardPerson {
  return {
    userId,
    name: userId,
    classKey: "lop-a",
    className: "Lớp A",
    isAdmin: false,
    xp,
    reachedAt: xp > 0 ? `2026-09-2${xp % 7}T01:00:00.000Z` : null,
    ...extras,
  };
}

test("class board lists the whole class and global keeps the top plus you", () => {
  const people = [
    person("you", 10, { reachedAt: "2026-09-27T08:00:00.000Z" }),
    person("tie", 10, { reachedAt: "2026-09-27T09:00:00.000Z" }),
    person("high", 40),
    person("other", 100, { classKey: "lop-b", className: "Lớp B" }),
    person("teacher", 500, { isAdmin: true, name: "Cô" }),
    person("quiet", 0, { name: "An" }),
  ];

  const classroom = assembleLeaderboard({
    people,
    viewerId: "you",
    scope: "class",
    range: "week",
    now: NOW,
  });
  assert.deepEqual(
    classroom.rows.map((row) => `${row.rank}:${row.name}:${row.xp}`),
    ["1:high:40", "2:you:10", "3:tie:10", "4:An:0"],
  );
  assert.equal(classroom.yourRank, 2);
  assert.equal(classroom.className, "Lớp A");

  const global = assembleLeaderboard({
    people,
    viewerId: "quiet",
    scope: "global",
    range: "week",
    now: NOW,
  });
  assert.equal(global.rows.some((row) => row.name === "Cô"), false);
  assert.equal(global.rows.at(-1)?.isYou, true);
  assert.equal(global.rows.at(-1)?.rank, null);
  assert.equal(global.rows.at(-1)?.gapBefore, true);
  assert.equal(global.yourRank, null);
});

function previewRow(rank: number, name: string, isYou = false): LeaderboardRow {
  return {
    rank,
    name,
    xp: 100 - rank,
    isYou,
    gapBefore: true,
    won: 0,
    tied: 0,
    lost: 0,
    image: null,
  };
}

test("home ranking preview shows the window around you", () => {
  const top = previewLeaderboardRows([
    previewRow(1, "A"),
    previewRow(2, "B", true),
    previewRow(3, "C"),
    previewRow(4, "D"),
    previewRow(5, "E"),
  ]);
  assert.deepEqual(
    top.map((row) => row.rank),
    [1, 2, 3],
  );
  assert.equal(
    top.some((row) => row.gapBefore),
    false,
  );

  const middle = previewLeaderboardRows([
    previewRow(1, "A"),
    previewRow(2, "B"),
    previewRow(3, "C"),
    previewRow(4, "D"),
    previewRow(5, "E", true),
    previewRow(6, "F"),
    previewRow(7, "G"),
  ]);
  assert.deepEqual(
    middle.map((row) => `${row.rank}${row.gapBefore ? "*" : ""}`),
    ["4*", "5", "6"],
  );

  const end = previewLeaderboardRows([
    previewRow(1, "A"),
    previewRow(2, "B"),
    previewRow(3, "C"),
    previewRow(4, "D", true),
  ]);
  assert.deepEqual(
    end.map((row) => row.rank),
    [2, 3, 4],
  );
  assert.equal(end[0]?.gapBefore, true);

  const short = previewLeaderboardRows([previewRow(1, "A", true), previewRow(2, "B")]);
  assert.deepEqual(
    short.map((row) => row.rank),
    [1, 2],
  );
  assert.equal(short[0]?.gapBefore, false);
});

test("ranking rows keep a google profile photo and drop anything else", () => {
  const photo = "https://lh3.googleusercontent.com/a/student";
  assert.equal(googleProfileImage(photo), photo);
  assert.equal(googleProfileImage("https://lh3.googleusercontent.com/a-/abc=s96-c"), "https://lh3.googleusercontent.com/a-/abc=s96-c");
  assert.equal(googleProfileImage("https://evil.example/a.png"), null);
  assert.equal(googleProfileImage("http://lh3.googleusercontent.com/a/x"), null);
  assert.equal(googleProfileImage(null), null);

  const board = assembleLeaderboard({
    people: [person("you", 12, { image: photo }), person("plain", 4)],
    viewerId: "you",
    scope: "global",
    range: "week",
    now: NOW,
  });
  assert.equal(board.rows.find((row) => row.name === "you")?.image, photo);
  assert.equal(board.rows.find((row) => row.name === "plain")?.image, null);
});

test("the duel board ranks by duel XP, then wins, and keeps losses on the global list", () => {
  const people = [
    person("wins", 50, { won: 1, tied: 0, lost: 0 }),
    person("grind", 200, { won: 0, tied: 0, lost: 10 }),
    person("same-more", 70, { won: 2, tied: 0, lost: 0 }),
    person("same-less", 70, { won: 0, tied: 2, lost: 0 }),
    person("you", 0, { won: 0, tied: 0, lost: 0 }),
  ];
  const board = assembleLeaderboard({
    people,
    viewerId: "you",
    scope: "global",
    range: "all",
    now: NOW,
    board: "duel",
  });
  assert.equal(board.board, "duel");
  assert.deepEqual(
    board.rows.filter((row) => row.xp > 0).map((row) => row.name),
    ["grind", "same-more", "same-less", "wins"],
  );
  assert.equal(board.rows.find((row) => row.name === "grind")?.lost, 10);
});
