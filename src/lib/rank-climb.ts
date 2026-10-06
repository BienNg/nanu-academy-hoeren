/**
 * The weekly class board before and after a finished part, for the
 * climbing animation at the end of a part.
 *
 * The server board already counts the part's XP. The "before" board takes
 * that XP back off the learner's row. Everyone else keeps their place in the
 * order. On equal XP the learner sits below, since they reached it last.
 */

import type { LeaderboardRow } from "./xp";

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
