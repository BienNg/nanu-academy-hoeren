import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleLeaderboard,
  boardClassFor,
  LIVING_BOARD_CLASS_PREFIX,
  leaderboardClassOptions,
  dayKey,
  decidePartXp,
  decideStudyPartXp,
  nodePracticeRunSize,
  passesAlreadyFinished,
  formatWeekCountdown,
  googleProfileImage,
  isXpSchemaMissing,
  previewLeaderboardRows,
  rankClasses,
  classBoardPodiums,
  classChampions,
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
    outcome: "success",
    elapsedMs: lesson.length * 2000,
    expectedCount: lesson.length,
    results: results(lesson.map((clip) => clip.id)),
    lessonClips: lesson,
    finishedPasses: 0,
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

test("a listening part pays 35, then 20, then 10 after three passes", () => {
  assert.equal(decide().xp, 35);
  assert.equal(decide().kind, "new");
  const lesson = clips(10, "Ich heiße Anna und wohne in Berlin");
  const missed = decide({
    lessonClips: lesson,
    results: results(
      lesson.map((clip) => clip.id),
      2,
    ),
  });
  assert.equal(missed.xp, 35);

  const second = decide({ finishedPasses: 1 });
  assert.equal(second.xp, 20);
  assert.equal(second.kind, "review");
  assert.equal(decide({ finishedPasses: 2 }).xp, 20);

  const mastered = decide({ finishedPasses: 3 });
  assert.equal(mastered.xp, 10);
  assert.equal(mastered.kind, "review");
  assert.equal(mastered.store, true);
});

test("a rerun part uses the stored pass when run history has not caught up", () => {
  assert.equal(
    passesAlreadyFinished({
      partNumber: 2,
      partCount: 6,
      storedRunCount: 1,
      recordedFinishes: 0,
    }),
    1,
  );
  assert.equal(
    passesAlreadyFinished({
      partNumber: 6,
      partCount: 6,
      storedRunCount: 1,
      recordedFinishes: 0,
    }),
    0,
  );
  assert.equal(
    passesAlreadyFinished({
      partNumber: 6,
      partCount: 6,
      storedRunCount: 2,
      recordedFinishes: 1,
    }),
    1,
  );
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
  assert.equal(award.xp, 35);
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
  assert.equal(
    isXpSchemaMissing("Could not find the table public.study_xp_awards in the schema cache"),
    false,
  );
});

test("a study part pays 20 on the first pass and 10 after that", () => {
  const paid = decideStudyPartXp({
    elapsedMs: 12 * 2000,
    expectedCount: 12,
    clipCount: 12,
    finishedPasses: 0,
    now: NOW,
  });
  assert.equal(paid.xp, 20);
  assert.equal(paid.kind, "new");
  assert.equal(paid.store, true);

  const rerun = decideStudyPartXp({
    elapsedMs: 12 * 2000,
    expectedCount: 12,
    clipCount: 12,
    finishedPasses: 1,
    now: NOW,
  });
  assert.equal(rerun.xp, 10);
  assert.equal(rerun.kind, "review");
  assert.equal(
    decideStudyPartXp({
      elapsedMs: 12 * 2000,
      expectedCount: 12,
      clipCount: 12,
      finishedPasses: 3,
      now: NOW,
    }).xp,
    10,
  );

  const rushed = decideStudyPartXp({
    elapsedMs: 1000,
    expectedCount: 12,
    clipCount: 12,
    finishedPasses: 0,
    now: NOW,
  });
  assert.equal(rushed.kind, "rejected");
  assert.equal(rushed.store, false);

  const unknown = decideStudyPartXp({
    elapsedMs: 60_000,
    expectedCount: null,
    clipCount: 12,
    finishedPasses: 0,
    now: NOW,
  });
  assert.equal(unknown.kind, "rejected");
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
  assert.equal(classroom.classKey, "lop-a");
  assert.deepEqual(classroom.classOptions, []);

  const otherClass = assembleLeaderboard({
    people,
    viewerId: "you",
    scope: "class",
    range: "week",
    now: NOW,
    classKey: "lop-b",
    classLabel: "Lớp B",
    classOptions: [
      { key: "lop-a", label: "Lớp A" },
      { key: "lop-b", label: "Lớp B" },
    ],
  });
  assert.equal(otherClass.className, "Lớp B");
  assert.equal(otherClass.classKey, "lop-b");
  assert.deepEqual(
    otherClass.rows.map((row) => row.name),
    ["other"],
  );
  assert.equal(otherClass.rows.some((row) => row.isYou), false);

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

test("class options keep the most common spelling", () => {
  assert.deepEqual(
    leaderboardClassOptions([
      { classKey: "lop b", className: "Lop B" },
      { classKey: "lop b", className: "Lớp B" },
      { classKey: "lop b", className: "Lớp B" },
      { classKey: "a", className: "A" },
      { classKey: "", className: null },
    ]),
    [
      { key: "a", label: "A" },
      { key: "lop b", label: "Lớp B" },
    ],
  );
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

test("the blitzrunde board ranks by points, then rounds won", () => {
  const people = [
    person("low", 800, { won: 3 }),
    person("tie-more-wins", 2400, { won: 2 }),
    person("tie-fewer-wins", 2400, { won: 1 }),
    person("you", 0),
  ];
  const board = assembleLeaderboard({
    people,
    viewerId: "you",
    scope: "global",
    range: "week",
    now: NOW,
    board: "blitzrunde",
  });
  assert.equal(board.board, "blitzrunde");
  assert.deepEqual(
    board.rows.filter((row) => row.xp > 0).map((row) => row.name),
    ["tie-more-wins", "tie-fewer-wins", "low"],
  );
});

test("XP board class falls back to the first granted workplace", () => {
  const workplaces = [
    { slug: "nagelstudio", label: "Nagelstudio" },
    { slug: "restaurant", label: "Restaurant" },
  ];
  assert.deepEqual(boardClassFor("  A1 Saigon ", workplaces), {
    classKey: "a1 saigon",
    className: "  A1 Saigon ",
  });
  assert.deepEqual(boardClassFor(null, workplaces), {
    classKey: `${LIVING_BOARD_CLASS_PREFIX}nagelstudio`,
    className: "Nagelstudio",
  });
  assert.deepEqual(boardClassFor("", []), { classKey: "", className: null });
});

test("workplace learners share a class board, apart from real classes", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  const nagel = boardClassFor(null, [{ slug: "nagelstudio", label: "Nagelstudio" }]);
  const person = (userId: string, xp: number, boardClass: { classKey: string; className: string | null }) => ({
    userId,
    name: userId,
    classKey: boardClass.classKey,
    className: boardClass.className,
    isAdmin: false,
    xp,
    reachedAt: null,
    image: null,
  });
  const people = [
    person("lan", 80, nagel),
    person("minh", 120, nagel),
    person("class-kid", 500, boardClassFor("A1 Saigon", [])),
    person("self-learner", 300, boardClassFor(null, [])),
  ];
  const board = assembleLeaderboard({ people, viewerId: "lan", scope: "class", range: "week", now });
  assert.equal(board.className, "Nagelstudio");
  assert.deepEqual(
    board.rows.map((row) => row.name),
    ["minh", "lan"],
  );
  const loner = assembleLeaderboard({ people, viewerId: "self-learner", scope: "class", range: "week", now });
  assert.equal(loner.className, null);
  assert.equal(loner.rows.length, 0);
});

test("a node practice run must hold exactly the clips of its card part", () => {
  const parts = [
    { clipIds: ["c0", "c1", "c2"] },
    { clipIds: ["c2", "c3"] },
  ];
  const base = { parts, partNumber: 2, partCount: 2 };
  assert.equal(nodePracticeRunSize({ ...base, runClipIds: ["c3", "c2"] }), 2);
  assert.equal(nodePracticeRunSize({ ...base, runClipIds: ["c3"] }), null);
  assert.equal(nodePracticeRunSize({ ...base, runClipIds: ["c2", "c3", "c1"] }), null);
  assert.equal(nodePracticeRunSize({ ...base, runClipIds: ["c3", "c3"] }), null);
  assert.equal(nodePracticeRunSize({ ...base, partCount: 3, runClipIds: ["c2", "c3"] }), null);
  assert.equal(nodePracticeRunSize({ ...base, partNumber: 3, runClipIds: ["c2", "c3"] }), null);
});

test("classes board sums week XP per class and skips admins, staff, teachers and workplaces", () => {
  const b = { classKey: "lop-b", className: "Lớp B" };
  const board = rankClasses(
    [
      person("a1", 100),
      person("a2", 40),
      person("a3", 0),
      person("b1", 90, b),
      person("b2", 50, b),
      person("teacher", 500, { isAdmin: true }),
      person("staff", 300, { ...b, isStaff: true }),
      person("coach", 800, { ...b, isTeacher: true }),
      person("living", 900, { classKey: `${LIVING_BOARD_CLASS_PREFIX}cafe`, className: "Café" }),
      person("loner", 700, { classKey: "", className: null }),
    ],
    "a2",
  );
  assert.deepEqual(board.rows, [
    { rank: 1, name: "Lớp B", xp: 140, members: 2, xpPerMember: 70, isYours: false },
    { rank: 2, name: "Lớp A", xp: 140, members: 3, xpPerMember: 47, isYours: true },
  ]);
  assert.equal(board.yourClassRank, 2);
  assert.equal(board.yourClassXp, 140);
  assert.equal(board.yourContribution, 40);
});

test("classes board hides classes without XP and has no class for admins", () => {
  const board = rankClasses(
    [person("a1", 0), person("c1", 20, { classKey: "lop-c", className: "Lớp C" }), person("t", 10, { isAdmin: true })],
    "t",
  );
  assert.deepEqual(board.rows.map((row) => row.name), ["Lớp C"]);
  assert.equal(board.yourClassRank, null);
  assert.equal(board.yourContribution, 0);

  const viewerClassEmpty = rankClasses([person("a1", 0), person("c1", 20, { classKey: "lop-c" })], "a1");
  assert.equal(viewerClassEmpty.yourClassRank, null);
  assert.equal(viewerClassEmpty.yourClassXp, 0);
});

test("class podiums go to the learners of the top 3 classes who earned XP that week", () => {
  const cls = (key: string) => ({ classKey: key, className: key.toUpperCase() });
  const places = classBoardPodiums([
    person("a1", 100, cls("a")),
    person("a2", 0, cls("a")),
    person("b1", 300, cls("b")),
    person("c1", 50, cls("c")),
    person("d1", 40, cls("d")),
    person("staff", 900, { ...cls("d"), isStaff: true }),
    person("living", 999, cls(`${LIVING_BOARD_CLASS_PREFIX}x`)),
  ]);
  assert.deepEqual(places, [
    { userId: "b1", classKey: "b", rank: 1, classXp: 300 },
    { userId: "a1", classKey: "a", rank: 2, classXp: 100 },
    { userId: "c1", classKey: "c", rank: 3, classXp: 50 },
  ]);
});

test("last week's champions come from the stored podium, one row per class", () => {
  const labels = new Map([
    ["a", "A1 Abend"],
    ["b", "B1"],
  ]);
  const champions = classChampions(
    "2026-09-28",
    [
      // Stored per learner, so a class repeats.
      { classKey: "c", rank: 3, classXp: 50 },
      { classKey: "b", rank: 1, classXp: 300 },
      { classKey: "b", rank: 1, classXp: 300 },
      { classKey: "a", rank: 2, classXp: 100 },
    ],
    labels,
    "a",
    [
      { userId: "a2", name: "Minh", classKey: "a", className: "A1 Abend", isAdmin: false, xp: 0, reachedAt: null },
      { userId: "a1", name: "An", classKey: "a", className: "A1 Abend", isAdmin: false, xp: 40, reachedAt: null },
      { userId: "b1", name: "Bao", classKey: "b", className: "B1", isAdmin: false, xp: 300, reachedAt: null },
    ],
    "a2",
  );
  assert.equal(champions.week, "2026-09-28");
  assert.deepEqual(champions.places, [
    { rank: 1, name: "B1", xp: 300, isYours: false, students: [{ name: "Bao", isYou: false }] },
    {
      rank: 2,
      name: "A1 Abend",
      xp: 100,
      isYours: true,
      students: [
        { name: "An", isYou: false },
        { name: "Minh", isYou: true },
      ],
    },
    // Nobody is in class "c" today, so it shows its key and no students.
    { rank: 3, name: "c", xp: 50, isYours: false, students: [] },
  ]);
  assert.deepEqual(classChampions("2026-09-28", [], labels, null).places, []);
});
