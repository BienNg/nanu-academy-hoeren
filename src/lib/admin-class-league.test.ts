import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminClassLeague,
  buildAdminWeekResults,
  dateInWeek,
  finishedWeeks,
  leagueCardFileName,
  leagueCardUrl,
  limitAdminClassLeague,
  parseResultWeek,
  resultWeekLabel,
  weekDaysSoFar,
} from "./admin-class-league.js";
import { classClaimId, pickClassDailyQuests, type ClassActivity } from "./class-quests.js";
import { dayKey, weekKey, type BoardPerson } from "./xp.js";

// Wednesday 2026-10-07, 10:00 in Vietnam.
const NOW = new Date("2026-10-07T03:00:00.000Z");

function person(userId: string, xp: number, classKey: string, extras: Partial<BoardPerson> = {}): BoardPerson {
  return { userId, name: userId.toUpperCase(), classKey, className: classKey.toUpperCase(), isAdmin: false, xp, reachedAt: null, ...extras };
}

test("week days run from Monday to today in Vietnam time", () => {
  assert.deepEqual(weekDaysSoFar(NOW), ["2026-10-05", "2026-10-06", "2026-10-07"]);
  assert.deepEqual(weekDaysSoFar(new Date("2026-10-04T18:00:00.000Z")), ["2026-10-05"]);
  assert.equal(dayKey(NOW), "2026-10-07");
});

test("the admin league ranks classes like the board and lists every class", () => {
  const league = buildAdminClassLeague({
    people: [
      person("a1", 100, "a"),
      person("a2", 0, "a"),
      person("b1", 300, "b"),
      person("c1", 0, "c"),
      person("teacher", 500, "a", { isAdmin: true }),
      person("staff", 500, "b", { isStaff: true }),
    ],
    activity: [],
    claims: [],
    podiums: [],
    now: NOW,
  });
  assert.deepEqual(
    league.classes.map((row) => [row.name, row.rank, row.learners, row.weekXp]),
    [
      ["B", 1, 1, 300],
      ["A", 2, 2, 100],
      ["C", null, 1, 0],
    ],
  );
  assert.equal(league.totals.classes, 3);
  assert.equal(league.totals.rankedClasses, 2);
  assert.equal(league.classes[0]!.days.length, 3);
});

test("the admin league shows quest progress, contributors and claims per class", () => {
  const today = "2026-10-07";
  const roster = ["a1", "a2", "a3", "a4", "a5"];
  const activity: ClassActivity[] = roster.flatMap((userId) => [
    { userId, day: today, kind: "listening", accuracy: 95 },
    { userId, day: today, kind: "study" },
    { userId, day: today, kind: "duel" },
    { userId, day: today, kind: "duel" },
  ]);
  const [first] = pickClassDailyQuests("a", today);
  const league = buildAdminClassLeague({
    people: roster.map((userId) => person(userId, 50, "a")),
    activity,
    claims: [
      { userId: "a1", questId: classClaimId(first!), xp: 25, day: today },
      { userId: "outsider", questId: classClaimId(first!), xp: 25, day: today },
      { userId: "a2", questId: "listen-1", xp: 10, day: today },
    ],
    podiums: [],
    now: NOW,
  });
  const row = league.classes[0]!;
  assert.equal(row.activeLearners, 5);
  assert.ok(row.today.every((quest) => quest.done));
  assert.deepEqual(row.today[0]!.contributors, ["A1", "A2", "A3", "A4", "A5"]);
  assert.equal(row.today[0]!.claimed, 1);
  assert.deepEqual(row.days.at(-1), { day: today, done: 2, total: 2 });
  assert.equal(row.claims, 1);
  assert.equal(league.totals.claimXp, 25);
});

test("podium history groups learners per class, newest week first", () => {
  const league = buildAdminClassLeague({
    people: [person("a1", 0, "a"), person("b1", 0, "b")],
    activity: [],
    claims: [],
    podiums: [
      { week: "2026-09-21", userId: "a1", classKey: "a", rank: 1, classXp: 900 },
      { week: "2026-09-28", userId: "b1", classKey: "b", rank: 2, classXp: 400 },
      { week: "2026-09-28", userId: "a1", classKey: "a", rank: 1, classXp: 500 },
      { week: "2026-09-28", userId: "a2", classKey: "a", rank: 1, classXp: 500 },
    ],
    now: NOW,
  });
  assert.deepEqual(league.podiums, [
    {
      week: "2026-09-28",
      places: [
        { rank: 1, name: "A", classXp: 500, learners: 2 },
        { rank: 2, name: "B", classXp: 400, learners: 1 },
      ],
    },
    { week: "2026-09-21", places: [{ rank: 1, name: "A", classXp: 900, learners: 1 }] },
  ]);
});

test("result weeks are the finished Vietnam weeks, newest first", () => {
  const weeks = finishedWeeks(NOW);
  assert.equal(weeks.length, 8);
  assert.deepEqual(weeks.slice(0, 2), ["2026-09-28", "2026-09-21"]);
  assert.equal(parseResultWeek(undefined, NOW), "2026-09-28");
  assert.equal(parseResultWeek("2026-09-21", NOW), "2026-09-21");
  assert.equal(parseResultWeek("2026-10-05", NOW), "2026-09-28");
  assert.equal(weekKey(dateInWeek("2026-09-28")), "2026-09-28");
  assert.equal(resultWeekLabel("2026-09-28"), "28.09 – 04.10");
  // Monday 00:30 in Vietnam: the week that just ended is last week.
  assert.equal(finishedWeeks(new Date("2026-10-04T17:30:00.000Z"))[0], "2026-09-28");
});

const RESULT_WEEK = "2026-09-28";

function resultsFixture() {
  const people = [
    person("a1", 300, "a", { image: "https://lh3.googleusercontent.com/a/a1=s96-c" }),
    person("a2", 200, "a"),
    person("a3", 0, "a"),
    person("b1", 900, "b"),
    person("c1", 100, "c"),
    person("c2", 40, "c"),
    person("c3", 0, "c"),
    person("d1", 0, "d"),
    person("staff", 5000, "a", { isStaff: true }),
  ];
  const day = "2026-09-30";
  const busy = (userId: string): ClassActivity[] =>
    Array.from({ length: 25 }, () => ({ userId, day, kind: "listening" as const, accuracy: 95, xp: 25 }));
  const activity: ClassActivity[] = [
    ...busy("a1"),
    ...busy("a2"),
    ...Array.from({ length: 12 }, () => ({ userId: "a1", day, kind: "duel" as const, xp: 5 })),
    { userId: "b1", day, kind: "listening", accuracy: 90, xp: 900 },
    { userId: "c1", day, kind: "study", xp: 100 },
    { userId: "c2", day, kind: "study", xp: 40 },
    { userId: "c3", day, kind: "duel", xp: 0 },
    { userId: "d1", day, kind: "duel", xp: 0 },
  ];
  return { week: RESULT_WEEK, people, activity, now: NOW };
}

test("week results rank classes and name each class's top 3, without staff", () => {
  const results = buildAdminWeekResults(resultsFixture());
  assert.deepEqual(
    results.classes.map((row) => [row.name, row.rank, row.weekXp, row.activeLearners, row.learners]),
    [
      ["B", 1, 900, 1, 1],
      ["A", 2, 500, 2, 3],
      ["C", 3, 140, 2, 3],
      ["D", null, 0, 0, 1],
    ],
  );
  assert.deepEqual(results.classes[1]!.champions, [
    { name: "A1", xp: 300, image: "https://lh3.googleusercontent.com/a/a1=s96-c" },
    { name: "A2", xp: 200, image: null },
  ]);
  assert.deepEqual(results.classes[3]!.champions, []);
  // Participants are everyone with XP, best first, so a learner with 0 XP is left out.
  assert.deepEqual(results.classes[0]!.participants, [{ name: "B1", xp: 900 }]);
  assert.deepEqual(results.classes[1]!.participants, [
    { name: "A1", xp: 300 },
    { name: "A2", xp: 200 },
  ]);
  assert.deepEqual(results.classes[2]!.participants, [
    { name: "C1", xp: 100 },
    { name: "C2", xp: 40 },
  ]);
  assert.deepEqual(results.classes[3]!.participants, []);
  assert.equal(results.rankedClasses, 3);
  assert.equal(results.older, "2026-09-21");
  assert.equal(results.newer, null);
});

test("most active needs 3 learners", () => {
  const results = buildAdminWeekResults(resultsFixture());
  // B practiced 1 of 1 but is too small. A and C both had 2 of 3 practice; A ranks higher.
  assert.deepEqual(results.mostActive, { classKey: "a", name: "A", active: 2, learners: 3 });
});

test("class posts celebrate the podium and the champion, without quests", () => {
  const results = buildAdminWeekResults(resultsFixture());
  const [b, a, , d] = results.classes;
  assert.match(b!.message, /^🏆 Lớp mình VÔ ĐỊCH Giải đấu Lớp tuần 28\.09 – 04\.10 với 900 XP!/);
  assert.match(b!.message, /huy hiệu "Lớp vô địch"/);
  // Fewer than 5 classes took part, so the total is left out.
  assert.match(a!.message, /^🎉 Tuần 28\.09 – 04\.10 lớp mình về hạng 2 với 500 XP!/);
  assert.match(a!.message, /huy hiệu "Lớp trên bục"/);
  assert.match(a!.message, /🌟 Quán quân tuần của lớp: A1 – 300 XP/);
  assert.match(a!.message, /🥈 A2\n/);
  assert.match(a!.message, /Cảm ơn 2 bạn đã cùng luyện tập/);
  assert.ok(a!.message.endsWith("Tuần mới đã bắt đầu – cả lớp cùng cố gắng nhé! 💪"));
  assert.doesNotMatch(d!.message, /Quán quân|hạng/);
  assert.equal(d!.message, "Tuần mới bắt đầu rồi! 💪 Ai sẽ là quán quân đầu tiên của lớp mình?");
  for (const row of results.classes) assert.doesNotMatch(row.message, /nhiệm vụ/i);
  assert.doesNotMatch(results.announcement!, /nhiệm vụ/i);
});

test("posts name the total once 5 classes take part", () => {
  const fixture = resultsFixture();
  const results = buildAdminWeekResults({
    ...fixture,
    people: [...fixture.people, person("e1", 20, "e"), person("f1", 10, "f")],
  });
  assert.equal(results.rankedClasses, 5);
  assert.match(results.classes[1]!.message, /về hạng 2\/5 với 500 XP/);
  assert.match(results.classes[3]!.message, /^💪 Tuần 28\.09 – 04\.10 lớp mình đạt 20 XP, xếp hạng 4\/5\./);
});

test("the main group post lists the podium, champions and extras", () => {
  const results = buildAdminWeekResults(resultsFixture());
  const post = results.announcement!;
  assert.match(post, /^🏆 KẾT QUẢ GIẢI ĐẤU LỚP · Tuần 28\.09 – 04\.10\n\n🥇 Lớp B – 900 XP\n🥈 Lớp A – 500 XP\n🥉 Lớp C – 140 XP\n\n/);
  assert.match(post, /Chúc mừng cả lớp B!/);
  assert.match(post, /• Lớp A: A1 – 300 XP/);
  assert.match(post, /⚡ Lớp chăm nhất: Lớp A – 67% học viên luyện tập/);
  assert.doesNotMatch(post, /STAFF/);

  const quiet = buildAdminWeekResults({ ...resultsFixture(), people: [person("a1", 0, "a")], activity: [] });
  assert.equal(quiet.announcement, null);
});

test("podium card urls and file names", () => {
  assert.equal(leagueCardUrl("2026-09-28"), "/admin/class-league/card?week=2026-09-28");
  assert.equal(leagueCardUrl("2026-09-28", "lớp a1"), "/admin/class-league/card?week=2026-09-28&class=l%E1%BB%9Bp+a1");
  assert.equal(leagueCardFileName("2026-09-28"), "giai-dau-lop-2026-09-28.png");
  assert.equal(leagueCardFileName("2026-09-28", "Lớp Đức B1 / 07"), "giai-dau-lop-2026-09-28-lop-duc-b1-07.png");
});

test("teachers see their classes' results but not the all-classes post", () => {
  const league = buildAdminClassLeague({
    people: [],
    activity: [],
    claims: [],
    podiums: [],
    results: buildAdminWeekResults(resultsFixture()),
    now: NOW,
  });
  const limited = limitAdminClassLeague(league, new Set(["c"]));
  assert.deepEqual(limited.results!.classes.map((row) => row.classKey), ["c"]);
  assert.equal(limited.results!.mostActive, null);
  assert.equal(limited.results!.announcement, null);
  assert.ok(league.results!.announcement);
});
