/**
 * The weekly boards before and after a finished part, for the climbing
 * animations at the end of a part.
 *
 * The server boards already count the part's XP. The "before" board takes
 * that XP back off the learner, and off their class. Everyone else keeps
 * their place in the order. On the class board, equal XP puts the learner
 * below, since they reached it last. On the classes board, ties follow the
 * live ranking: XP per learner, then name.
 */

import type { ClassBoardRow, LeaderboardRow } from "./xp";

/** Rows the climbing board shows at once. */
export const RANK_CLIMB_VISIBLE = 5;

export type ClimbRow = {
  /** Stable across both boards. */
  key: string;
  name: string;
  image: string | null;
  isYou: boolean;
  xpBefore: number;
  xpAfter: number;
  /** 0-based place on the board before the part. */
  before: number;
  /** 0-based place on the board after the part. */
  after: number;
};

export type RankClimb = {
  /** Only the rows the window passes over, in board order after the part. */
  rows: ClimbRow[];
  /** Everyone ranked in the class. */
  size: number;
  visible: number;
  /** 0-based first place in the window, before and after. */
  windowBefore: number;
  windowAfter: number;
  rankBefore: number;
  rankAfter: number;
  xpBefore: number;
  xpAfter: number;
};

/** First place in a window of `visible` rows that keeps `place` near the middle. */
export function climbWindowStart(place: number, size: number, visible: number): number {
  const lead = Math.floor((visible - 1) / 2);
  return Math.max(0, Math.min(place - lead, size - visible));
}

/**
 * Null when there is nothing to show: no XP gained, or the learner is not
 * on this board (no class, or an admin).
 */
export function planRankClimb(
  boardRows: readonly LeaderboardRow[],
  gained: number,
  visible = RANK_CLIMB_VISIBLE,
): RankClimb | null {
  if (!(gained > 0)) return null;
  const ranked = boardRows.filter((row) => row.rank != null);
  const youAfter = ranked.findIndex((row) => row.isYou);
  if (youAfter < 0) return null;

  const you = ranked[youAfter]!;
  const xpBefore = Math.max(0, you.xp - gained);
  const others = ranked.filter((row) => !row.isYou);
  const youBefore = others.filter((row) => row.xp >= xpBefore).length;

  const size = ranked.length;
  const windowBefore = climbWindowStart(youBefore, size, visible);
  const windowAfter = climbWindowStart(youAfter, size, visible);
  const from = Math.min(windowBefore, windowAfter);
  const to = Math.max(windowBefore, windowAfter) + visible;

  let otherIndex = 0;
  const all: ClimbRow[] = ranked.map((row, after) => {
    if (row.isYou) {
      return {
        key: "you",
        name: row.name,
        image: row.image,
        isYou: true,
        xpBefore,
        xpAfter: row.xp,
        before: youBefore,
        after,
      };
    }
    const index = otherIndex;
    otherIndex += 1;
    return {
      key: `${index}-${row.name}`,
      name: row.name,
      image: row.image,
      isYou: false,
      xpBefore: row.xp,
      xpAfter: row.xp,
      before: index >= youBefore ? index + 1 : index,
      after,
    };
  });

  return {
    rows: all.filter(
      (row) => (row.before >= from && row.before < to) || (row.after >= from && row.after < to),
    ),
    size,
    visible: Math.min(visible, size),
    windowBefore,
    windowAfter,
    rankBefore: youBefore + 1,
    rankAfter: youAfter + 1,
    xpBefore,
    xpAfter: you.xp,
  };
}

export type ClassClimbRow = {
  key: string;
  name: string;
  isYours: boolean;
  members: number;
  xpPerMemberBefore: number;
  xpPerMemberAfter: number;
  xpBefore: number;
  xpAfter: number;
  /** 0-based place before the part. */
  before: number;
  /** 0-based place after the part. */
  after: number;
};

export type ClassRankClimb = {
  /** Only the rows the window passes over, in board order after the part. */
  rows: ClassClimbRow[];
  /** Classes ranked this week. */
  size: number;
  visible: number;
  windowBefore: number;
  windowAfter: number;
  rankBefore: number;
  rankAfter: number;
  xpBefore: number;
  xpAfter: number;
};

/** True when `other` ranks above `yours`, using the classes board's tie-break. */
function classRanksAbove(
  other: { xp: number; xpPerMember: number; name: string },
  yours: { xp: number; xpPerMember: number; name: string },
): boolean {
  if (other.xp !== yours.xp) return other.xp > yours.xp;
  if (other.xpPerMember !== yours.xpPerMember) return other.xpPerMember > yours.xpPerMember;
  return other.name.localeCompare(yours.name, "vi", { sensitivity: "base" }) < 0;
}

/**
 * The classes board with this part's XP taken back off the viewer's class.
 * Null when no XP was gained, or the viewer's class is not ranked (no real
 * class, a workplace group, or an admin). A class that had 0 XP before this
 * part starts below every class already on the board.
 */
export function planClassRankClimb(
  boardRows: readonly ClassBoardRow[],
  gained: number,
  visible = RANK_CLIMB_VISIBLE,
): ClassRankClimb | null {
  if (!(gained > 0)) return null;
  const youAfter = boardRows.findIndex((row) => row.isYours);
  if (youAfter < 0) return null;

  const yours = boardRows[youAfter]!;
  const members = Math.max(1, yours.members);
  const xpBefore = Math.max(0, yours.xp - gained);
  const perBefore = Math.round(xpBefore / members);
  const others = boardRows.filter((row) => !row.isYours);
  const youBefore = others.filter((row) =>
    classRanksAbove(row, { xp: xpBefore, xpPerMember: perBefore, name: yours.name }),
  ).length;

  const size = boardRows.length;
  const windowBefore = climbWindowStart(youBefore, size, visible);
  const windowAfter = climbWindowStart(youAfter, size, visible);
  const from = Math.min(windowBefore, windowAfter);
  const to = Math.max(windowBefore, windowAfter) + visible;

  let otherIndex = 0;
  const all: ClassClimbRow[] = boardRows.map((row, after) => {
    if (row.isYours) {
      return {
        key: "you",
        name: row.name,
        isYours: true,
        members: row.members,
        xpPerMemberBefore: perBefore,
        xpPerMemberAfter: row.xpPerMember,
        xpBefore,
        xpAfter: row.xp,
        before: youBefore,
        after,
      };
    }
    const index = otherIndex;
    otherIndex += 1;
    return {
      key: row.name,
      name: row.name,
      isYours: false,
      members: row.members,
      xpPerMemberBefore: row.xpPerMember,
      xpPerMemberAfter: row.xpPerMember,
      xpBefore: row.xp,
      xpAfter: row.xp,
      before: index >= youBefore ? index + 1 : index,
      after,
    };
  });

  return {
    rows: all.filter(
      (row) => (row.before >= from && row.before < to) || (row.after >= from && row.after < to),
    ),
    size,
    visible: Math.min(visible, size),
    windowBefore,
    windowAfter,
    rankBefore: youBefore + 1,
    rankAfter: youAfter + 1,
    xpBefore,
    xpAfter: yours.xp,
  };
}
