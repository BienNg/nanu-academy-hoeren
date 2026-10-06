import assert from "node:assert/strict";
import test from "node:test";
import {
  BADGE_COUNT,
  BADGE_FAMILIES,
  BADGE_TIERS,
  badgeId,
  badgesToAward,
  buildBadgeBoard,
  EMPTY_BADGE_STATS,
  longestStreak,
  parseBadgeId,
  readBadgeBoard,
  readFreshBadges,
  tierFor,
} from "./badges";
import { classPodiums, type BoardPerson } from "./xp";

function person(userId: string, classKey: string, xp: number, reachedAt: string | null = null): BoardPerson {
  return { userId, name: userId, classKey, className: classKey, isAdmin: false, xp, reachedAt };
}

test("family ids are unique and targets rise", () => {
  assert.equal(new Set(BADGE_FAMILIES.map((family) => family.id)).size, BADGE_FAMILIES.length);
  for (const family of BADGE_FAMILIES) {
    assert.match(family.id, /^[a-z]+$/, family.id);
    assert.equal(family.targets.length, BADGE_TIERS.length);
    for (let index = 1; index < family.targets.length; index += 1) {
      assert.ok(family.targets[index]! > family.targets[index - 1]!, family.id);
    }
  }
  assert.equal(BADGE_COUNT, BADGE_FAMILIES.length * 4);
});

test("badge ids round-trip and reject unknown ones", () => {
  const parsed = parseBadgeId(badgeId("streak", 2));
  assert.equal(parsed?.family.id, "streak");
  assert.equal(parsed?.tier, 2);
  assert.equal(parseBadgeId("streak-5"), null);
  assert.equal(parseBadgeId("nope-1"), null);
  assert.equal(parseBadgeId("streak-1; drop"), null);
});

test("tierFor counts the targets a value reaches", () => {
  const streak = BADGE_FAMILIES.find((family) => family.id === "streak")!;
  assert.equal(tierFor(streak, 0), 0);
  assert.equal(tierFor(streak, 3), 1);
  assert.equal(tierFor(streak, 29), 2);
  assert.equal(tierFor(streak, 100), 4);
});

test("badgesToAward fills every reached tier and skips owned ones", () => {
  const stats = { ...EMPTY_BADGE_STATS, bestStreak: 8, duelWins: 1 };
  assert.deepEqual(badgesToAward(stats, new Set()), ["streak-1", "streak-2", "duel-1"]);
  assert.deepEqual(badgesToAward(stats, new Set(["streak-1", "duel-1"])), ["streak-2"]);
  assert.deepEqual(badgesToAward(EMPTY_BADGE_STATS, new Set()), []);
});

test("an earned badge stays earned after its stat drops", () => {
  const board = buildBadgeBoard(EMPTY_BADGE_STATS, [
    { id: "xp-1", earnedAt: "2026-10-01T00:00:00Z", seen: true },
  ]);
  const xp = board.families.find((family) => family.id === "xp")!;
  assert.equal(xp.tier, 1);
  assert.equal(xp.value, 0);
  assert.equal(board.earned, 1);
  assert.deepEqual(board.fresh, []);
});

test("fresh badges come oldest first and ignore unknown ids", () => {
  const board = buildBadgeBoard(EMPTY_BADGE_STATS, [
    { id: "duel-1", earnedAt: "2026-10-02T00:00:00Z", seen: false },
    { id: "streak-1", earnedAt: "2026-10-01T00:00:00Z", seen: false },
    { id: "gone-1", earnedAt: "2026-10-01T00:00:00Z", seen: false },
    { id: "xp-1", earnedAt: "2026-10-01T00:00:00Z", seen: true },
  ]);
  assert.deepEqual(
    board.fresh.map((badge) => badge.id),
    ["streak-1", "duel-1"],
  );
  assert.equal(board.fresh[0]!.goal, "Học 3 ngày liên tiếp");
});

test("longestStreak finds the longest run, across months and with gaps", () => {
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak(["2026-01-05"]), 1);
  assert.equal(
    longestStreak(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-03", "2026-02-04"]),
    3,
  );
  assert.equal(longestStreak(["2026-03-02", "2026-03-01", "2026-03-01", "bad", "2026-02-28"]), 3);
});

test("readBadgeBoard accepts the API body and rejects a board that is not ready", () => {
  const board = buildBadgeBoard({ ...EMPTY_BADGE_STATS, duelWins: 2 }, [
    { id: "duel-1", earnedAt: "2026-10-02T00:00:00Z", seen: false },
  ]);
  const read = readBadgeBoard(JSON.parse(JSON.stringify({ ready: true, ...board })));
  assert.equal(read?.earned, 1);
  assert.equal(read?.families.length, BADGE_FAMILIES.length);
  assert.deepEqual(read?.fresh.map((badge) => badge.id), ["duel-1"]);
  assert.equal(readBadgeBoard({ ready: false, families: [] }), null);
  assert.deepEqual(readFreshBadges({ fresh: [{ id: "duel-1" }, { id: "x" }, 4] }).map((b) => b.id), [
    "duel-1",
  ]);
});

test("classPodiums ranks each class like the board and skips admins and zero XP", () => {
  const places = classPodiums([
    person("a", "k1", 100, "2026-10-01T10:00:00Z"),
    person("b", "k1", 100, "2026-10-01T09:00:00Z"),
    person("c", "k1", 50),
    person("d", "k1", 40),
    person("e", "k2", 0),
    person("f", "k2", 10),
    { ...person("g", "k2", 999), isAdmin: true },
    person("h", "", 500),
  ]);
  assert.deepEqual(
    places.map((place) => [place.userId, place.classKey, place.rank]),
    [
      ["b", "k1", 1],
      ["a", "k1", 2],
      ["c", "k1", 3],
      ["f", "k2", 1],
    ],
  );
});

test("class podium badges count weeks the class placed", () => {
  const stats = { ...EMPTY_BADGE_STATS, classWeekTop3: 3, classWeekFirst: 1 };
  const ids = badgesToAward(stats, new Set());
  assert.ok(ids.includes("classpodium-1"));
  assert.ok(ids.includes("classpodium-2"));
  assert.ok(!ids.includes("classpodium-3"));
  assert.ok(ids.includes("classchamp-1"));
  assert.ok(!ids.includes("classchamp-2"));
  assert.equal(parseBadgeId("classchamp-1")?.family.title, "Lớp vô địch");
});
