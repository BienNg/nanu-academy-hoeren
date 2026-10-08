import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_USER_TIMELINE_CAP,
  OUTREACH_HEAVY_SECONDS,
  activeSecondsInRange,
  activityBucketKey,
  bucketPartStamps,
  buildActiveUserTimeline,
  buildAdminActivityStats,
  buildAdminClientUsage,
  buildOutreachPeople,
  filterOutreachPeople,
  formatRelativeLastSeen,
  listAdminClasses,
  partsByUser,
  rowsForClassScope,
  type AdminUserRow,
} from "./admin-overview.js";
import {
  DEFAULT_PROGRESS,
  type AppUseRecord,
  type LearnProgress,
  type StoredProgress,
  type Visit,
} from "./progress.js";

const NOW = new Date("2026-10-02T06:30:00.000Z");

function row(userId: string, lastLoginAt: string | null, displayName = userId): AdminUserRow {
  const lastLoginMs = lastLoginAt ? Date.parse(lastLoginAt) : 0;
  return {
    userId,
    displayName,
    image: null,
    lastLoginAt,
    lastLoginMs: Number.isNaN(lastLoginMs) ? 0 : lastLoginMs,
    isAdmin: false,
    staff: false,
  } as AdminUserRow;
}

test("today places each student once, from midnight through the current hour", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("early", "2026-10-02T02:15:00.000Z", "Early"),
      row("late", "2026-10-02T07:05:00.000Z", "Late"),
      row("noon", "2026-10-02T05:10:00.000Z", "Noon"),
      row("yesterday", "2026-10-01T06:00:00.000Z", "Yesterday"),
      row("missing", null, "Missing"),
    ],
    "today",
    NOW,
  );

  assert.equal(timeline.grain, "hour");
  assert.deepEqual(
    timeline.columns.map((column) => column.label),
    Array.from({ length: 14 }, (_, hour) => String(hour)),
  );

  const placed = timeline.columns.flatMap((column) =>
    column.students.map((student) => `${column.label}:${student.userId}`),
  );
  assert.deepEqual(placed, ["9:early", "12:noon"]);
  assert.equal(timeline.unplaced, 3);
  // 2 Oct 2026 is still CEST: Vietnam is five hours ahead of Berlin.
  assert.equal(timeline.columns[0]?.marker, "19");
  assert.equal(timeline.columns[13]?.marker, "8");
});

test("seen students who were not active stack beside the active ones", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("active", "2026-10-02T06:10:00.000Z", "Active"),
      row("seen", "2026-10-02T06:40:00.000Z", "Seen"),
      row("older-seen", "2026-10-02T06:05:00.000Z", "Older seen"),
      row("missing-active", null, "Missing active"),
      row("old-seen", "2026-09-01T06:00:00.000Z", "Old seen"),
    ],
    "today",
    NOW,
    new Set(["active", "missing-active"]),
  );

  const hour = timeline.columns.find((column) => column.label === "13");
  assert.deepEqual(
    hour?.students.map((student) => student.userId),
    ["active"],
  );
  assert.deepEqual(
    hour?.seen.map((student) => student.userId),
    ["seen", "older-seen"],
  );
  assert.equal(
    timeline.columns.reduce((sum, column) => sum + column.seen.length, 0),
    2,
  );
  // Only active rows outside the axis count as unplaced.
  assert.equal(timeline.unplaced, 1);
});

test("students who share an hour stack newest first", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("mid", "2026-10-02T06:10:00.000Z", "Mid"),
      row("newest", "2026-10-02T06:40:00.000Z", "Newest"),
      row("older", "2026-10-02T06:05:00.000Z", "Older"),
    ],
    "today",
    NOW,
  );
  const hour = timeline.columns.find((column) => column.label === "13");
  assert.deepEqual(
    hour?.students.map((student) => student.userId),
    ["newest", "mid", "older"],
  );
});

test("a busy column keeps every student and the avatar cap stays at 20", () => {
  const rows = Array.from({ length: 22 }, (_, index) =>
    row(
      `user-${index}`,
      new Date(Date.parse("2026-10-02T06:00:00.000Z") + index * 60_000).toISOString(),
      `User ${String(index).padStart(2, "0")}`,
    ),
  );
  const timeline = buildActiveUserTimeline(rows, "today", NOW);
  const hour = timeline.columns.find((column) => column.label === "13");
  assert.equal(ACTIVE_USER_TIMELINE_CAP, 20);
  assert.equal(hour?.students.length, 22);
  assert.deepEqual(
    hour?.students.slice(0, ACTIVE_USER_TIMELINE_CAP).map((student) => student.userId),
    Array.from({ length: 20 }, (_, index) => `user-${21 - index}`),
  );
  assert.equal(timeline.unplaced, 0);
});

test("a last-seen day outside the window is unplaced", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("inside", "2026-09-26T02:00:00.000Z", "Inside"),
      row("outside", "2026-09-25T02:00:00.000Z", "Outside"),
    ],
    "7d",
    NOW,
  );

  assert.equal(timeline.grain, "day");
  assert.equal(timeline.columns.length, 7);
  assert.equal(timeline.columns[0]?.key, "2026-09-26");
  assert.equal(timeline.columns.at(-1)?.key, "2026-10-02");
  assert.equal(timeline.columns[0]?.label, "Sat 26");
  assert.equal(timeline.columns.at(-1)?.label, "Fri 2");
  assert.deepEqual(
    timeline.columns.flatMap((column) => column.students.map((student) => student.userId)),
    ["inside"],
  );
  assert.equal(timeline.unplaced, 1);
});

test("longer ranges mark the month on the first column and on the 1st", () => {
  const timeline = buildActiveUserTimeline([], "30d", NOW);
  assert.equal(timeline.columns[0]?.marker, "Sept");
  const first = timeline.columns.find((column) => column.key === "2026-10-01");
  assert.equal(first?.marker, "Oct");
  assert.equal(first?.label, "1");
  const second = timeline.columns.find((column) => column.key === "2026-10-02");
  assert.equal(second?.marker, null);
});

test("last seen is hours today, yesterday, or calendar days ago", () => {
  // 2026-10-02 13:30 in Asia/Ho_Chi_Minh.
  assert.equal(formatRelativeLastSeen("2026-10-02T06:00:00.000Z", NOW), "less than an hour ago");
  assert.equal(formatRelativeLastSeen("2026-10-02T05:30:00.000Z", NOW), "1 hour ago");
  assert.equal(formatRelativeLastSeen("2026-10-02T03:30:00.000Z", NOW), "3 hours ago");
  assert.equal(formatRelativeLastSeen("2026-10-01T16:30:00.000Z", NOW), "yesterday");
  assert.equal(formatRelativeLastSeen("2026-09-29T06:30:00.000Z", NOW), "3 days ago");
  assert.equal(formatRelativeLastSeen(null, NOW), null);

  // 00:30 on 3 Oct still calls 23:00 on 2 Oct yesterday.
  const afterMidnight = new Date("2026-10-02T17:30:00.000Z");
  assert.equal(formatRelativeLastSeen("2026-10-02T16:00:00.000Z", afterMidnight), "yesterday");
});

test("part stamps land in the Vietnam hour or day the activity board charts", () => {
  // 17:30 UTC on 1 Oct is 00:30 on 2 Oct in Asia/Ho_Chi_Minh.
  assert.equal(activityBucketKey("2026-10-01T17:30:00.000Z", "hour"), "2026-10-02T00");
  assert.equal(activityBucketKey("2026-10-02T06:59:00.000Z", "hour"), "2026-10-02T13");
  assert.equal(activityBucketKey("2026-10-01T17:30:00.000Z", "day"), "2026-10-02");
  assert.equal(activityBucketKey("not a time", "day"), null);

  const stamps = [
    { userId: "a", at: "2026-10-02T06:10:00.000Z" },
    { userId: "a", at: "2026-10-02T06:50:00.000Z" },
    { userId: "b", at: "2026-10-02T07:05:00.000Z" },
    // A study part's own day key wins on the daily board.
    { userId: "b", at: "2026-10-01T16:59:00.000Z", dayKey: "2026-10-02" },
  ];
  assert.deepEqual(bucketPartStamps(stamps, "hour"), {
    "2026-10-02T13": { a: 2 },
    "2026-10-02T14": { b: 1 },
    "2026-10-01T23": { b: 1 },
  });
  const daily = bucketPartStamps(stamps, "day");
  assert.deepEqual(daily, { "2026-10-02": { a: 2, b: 2 } });
  assert.deepEqual(partsByUser(daily), { a: 2, b: 2 });
});

test("videos started counts each played video once per learner, from visits in the window", () => {
  const visit = (startedAt: string, videos: [string, number][]): Visit => ({
    id: startedAt,
    startedAt,
    endedAt: startedAt,
    activeSeconds: 60,
    lessons: [],
    clips: [],
    exercisesCompleted: 0,
    listeningRuns: 0,
    videos: videos.map(([key, seconds]) => ({
      key,
      title: key,
      seconds,
      leftAtSeconds: seconds,
      watched: false,
    })),
  });
  const viewer = {
    ...row("viewer", "2026-10-02T05:00:00.000Z"),
    progress: {
      ...DEFAULT_PROGRESS,
      visits: [
        // The same video across two visits today is one start; opened but never played is none.
        visit("2026-10-02T02:00:00.000Z", [["intro", 90], ["opened", 0]]),
        visit("2026-10-02T04:00:00.000Z", [["intro", 30], ["grammar", 120]]),
        // Yesterday in Vietnam: outside today's window.
        visit("2026-10-01T10:00:00.000Z", [["old", 600]]),
      ],
    },
  } as AdminUserRow;

  const stats = buildAdminActivityStats([viewer], "today", NOW);
  assert.equal(stats.videosStarted, 2);
  assert.equal(stats.startedVideoSeconds, 240);
});

test("active time in the window takes the larger of the daily total and visit time", () => {
  const progress = {
    ...DEFAULT_PROGRESS,
    activity: {
      "2026-10-02": { studyRuns: 0, practiceRuns: 0, activeSeconds: 90 },
      "2026-10-01": { studyRuns: 0, practiceRuns: 0, activeSeconds: 30 },
    },
    visits: [
      {
        id: "visit",
        startedAt: "2026-10-02T02:00:00.000Z",
        endedAt: "2026-10-02T02:10:00.000Z",
        activeSeconds: 400,
        lessons: [],
        clips: [],
        exercisesCompleted: 0,
        listeningRuns: 0,
        videos: [],
      },
    ],
  };
  assert.equal(activeSecondsInRange(progress, ["2026-10-02"]), 400);
  assert.equal(activeSecondsInRange(progress, ["2026-10-02", "2026-10-01"]), 430);
});

function learn(partial: Partial<LearnProgress> = {}): LearnProgress {
  return {
    currentClipIndex: 0,
    completedClipIds: [],
    runCount: 0,
    runCompletedClipIds: [],
    reviewedClipIds: [],
    studyRunCount: 0,
    ...partial,
  };
}

function account(
  userId: string,
  email: string,
  progress: StoredProgress,
  name = userId,
): AdminUserRow {
  return {
    ...row(userId, "2026-10-01T00:00:00.000Z", name),
    name,
    email,
    streakDays: 0,
    levelAccess: [],
    interviewAccess: false,
    livingAccess: [],
    className: "G128",
    signIns: [],
    appUses: [],
    lastSignInAt: null,
    progress,
  };
}

function withActivity(seconds: number, learnEntry?: LearnProgress): StoredProgress {
  return {
    ...DEFAULT_PROGRESS,
    learn: learnEntry ? { "lektion-1": learnEntry } : {},
    activity: seconds > 0 ? { "2026-10-01": { studyRuns: 0, practiceRuns: 0, activeSeconds: seconds } } : {},
  };
}

test("outreach splits pre-access, light use, and a recent burst", () => {
  const people = buildOutreachPeople(
    [
      account("idle", "idle@school.com", withActivity(3 * 60 * 60)),
      account(
        "light",
        "light@school.com",
        withActivity(20 * 60, learn({ practicePartKeys: ["p1"] })),
      ),
      account(
        "heavy",
        "heavy@school.com",
        withActivity(OUTREACH_HEAVY_SECONDS, learn({ grammarPartKeys: ["t:p"] })),
      ),
      account(
        "study",
        "study@school.com",
        withActivity(10 * 60, learn({ reviewedClipIds: ["c1", "c2"] })),
      ),
    ],
    [
      { email: "waiting@school.com", className: "G02", updatedAt: "2026-10-01T00:00:00.000Z" },
      { email: "Light@School.com", className: "G02", updatedAt: null },
    ],
    new Date("2026-10-01T06:00:00.000Z"),
  );

  assert.deepEqual(
    people.map((person) => [person.email, person.category]),
    [
      ["waiting@school.com", "preaccess"],
      ["light@school.com", "light"],
      ["study@school.com", "light"],
      ["heavy@school.com", "heavy"],
      ["idle@school.com", "heavy"],
    ],
  );
  assert.equal(people.find((person) => person.email === "idle@school.com")?.parts, 0);
  assert.equal(people.find((person) => person.email === "light@school.com")?.parts, 1);
  assert.equal(people.find((person) => person.email === "waiting@school.com")?.activeSeconds, null);

  const skipped = buildOutreachPeople(
    [
      { ...account("admin", "admin@school.com", withActivity(60)), isAdmin: true, className: "G128" },
      { ...account("coach", "coach@school.com", withActivity(60)), teacher: true, className: "G128" },
      { ...account("desk", "desk@school.com", withActivity(60)), staff: true, className: "G128" },
      account("g01", "g01@school.com", withActivity(60)),
      account("trade", "trade@school.com", withActivity(60)),
      account("kept", "kept@school.com", withActivity(60)),
    ].map((entry, index) =>
      index === 3 ? { ...entry, className: "G01" } : index === 4 ? { ...entry, className: "Ausbildung" } : entry,
    ),
    [
      { email: "g01-wait@school.com", className: "G01", updatedAt: null },
      { email: "trade-wait@school.com", className: "ausbildung", updatedAt: null },
      { email: "kept-wait@school.com", className: "G129", updatedAt: null },
      { email: "g01@school.com", className: "G129", updatedAt: null },
    ],
    new Date("2026-10-01T06:00:00.000Z"),
  );
  assert.deepEqual(
    skipped.map((person) => person.email),
    ["kept-wait@school.com", "kept@school.com"],
  );

  const lightOnly = filterOutreachPeople(people, "light", "study");
  assert.deepEqual(
    lightOnly.map((person) => person.email),
    ["study@school.com"],
  );
});

test("class tabs list newest created class first", () => {
  assert.deepEqual(
    listAdminClasses([
      { className: "Ausbildung", lastLoginAt: "2025-01-01T00:00:00.000Z" },
      { className: "G01", lastLoginAt: "2025-06-01T00:00:00.000Z" },
      { className: "G129", lastLoginAt: "2026-10-01T00:00:00.000Z" },
      { className: "G128", lastLoginAt: "2026-09-01T00:00:00.000Z" },
      { className: "G129", lastLoginAt: "2026-10-02T00:00:00.000Z" },
    ]).map((option) => option.label),
    ["G129", "G128", "G01", "Ausbildung"],
  );
});

test("a teacher only sees students in the classes they teach", () => {
  const rows = [
    row("student", "2026-10-02T02:00:00.000Z"),
    row("other", "2026-10-02T03:00:00.000Z"),
    row("none", "2026-10-02T04:00:00.000Z"),
    row("coach", "2026-10-02T05:00:00.000Z"),
  ].map((entry, index) => ({
    ...entry,
    className: index === 0 ? "G128" : index === 1 ? "G129" : null,
    teacher: index === 3,
    teacherClasses: index === 3 ? ["G128"] : [],
  }));
  assert.deepEqual(
    rowsForClassScope(rows, new Set(["g128"])).map((entry) => entry.userId),
    ["student"],
  );
  assert.equal(rowsForClassScope(rows, null).length, 4);
});

function appUse(
  at: string,
  device: AppUseRecord["device"],
  browser: string | null,
  seenAt = at,
): AppUseRecord {
  return { at, seenAt, device, browser, location: null };
}

test("client usage counts students once per browser and device in the window", () => {
  const usage = buildAdminClientUsage(
    [
      {
        ...row("phone", null),
        appUses: [
          appUse("2026-10-02T01:00:00.000Z", "mobile", "Chrome"),
          appUse("2026-10-02T03:00:00.000Z", "mobile", "Chrome"),
          appUse("2026-10-02T04:00:00.000Z", "desktop", "Safari"),
        ],
      },
      {
        ...row("tablet", null),
        appUses: [appUse("2026-10-02T02:00:00.000Z", "tablet", "Safari")],
      },
      {
        ...row("yesterday", null),
        appUses: [appUse("2026-10-01T10:00:00.000Z", "desktop", "Firefox")],
      },
      {
        ...row("still-open", null),
        appUses: [
          appUse("2026-10-01T16:00:00.000Z", "mobile", "Chrome", "2026-10-01T18:00:00.000Z"),
        ],
      },
      {
        ...row("blank", null),
        appUses: [appUse("2026-10-02T02:30:00.000Z", null, null)],
      },
      {
        ...row("coach", null),
        isAdmin: true,
        appUses: [appUse("2026-10-02T02:00:00.000Z", "desktop", "Edge")],
      },
    ],
    "today",
    NOW,
  );

  assert.deepEqual(
    usage.devices.map((slice) => [slice.label, slice.students, slice.visits]),
    [
      ["Mobile", 2, 3],
      ["Tablet", 1, 1],
      ["Desktop", 1, 1],
      ["Unknown", 1, 1],
    ],
  );
  assert.deepEqual(
    usage.browsers.map((slice) => [slice.label, slice.students, slice.visits]),
    [
      ["Chrome", 2, 3],
      ["Safari", 2, 2],
      ["Unknown", 1, 1],
    ],
  );
  assert.equal(usage.students, 4);
  assert.equal(usage.visits, 6);
});
