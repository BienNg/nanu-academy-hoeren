/** Quest completions over an admin window. Pure, so it can be tested without Supabase. */

import { dayKey } from "./xp";
import { QUEST_BONUS_ID, QUEST_KINDS, QUEST_POOL, type QuestKind } from "./quests";

export type AdminQuestClaimRow = {
  userId: string;
  questId: string;
  xp: number;
  createdAt: string;
};

export type AdminQuestPoint = {
  key: string;
  quests: number;
  /** Learners who finished all three quests that day. */
  perfect: number;
};

export type AdminQuestKindRow = {
  kind: QuestKind;
  completions: number;
  xp: number;
};

export type AdminQuestBoard = {
  /** Quests finished, bonus not counted. */
  completed: number;
  /** Learner-days where all three quests were finished. */
  perfectDays: number;
  /** Learners with at least one finished quest. */
  learners: number;
  /** Quest XP paid, bonus included. */
  xp: number;
  byKind: AdminQuestKindRow[];
  /** Oldest day first. */
  points: AdminQuestPoint[];
};

const KIND_BY_ID = new Map(QUEST_POOL.map((quest) => [quest.id, quest.kind]));

/**
 * `daysNewestFirst` are Vietnam calendar days, the same window the other admin
 * XP numbers use. A claim lands on the Vietnam day of its timestamp, because a
 * learner's own quest day can be any time zone.
 */
export function buildAdminQuestBoard(
  claims: readonly AdminQuestClaimRow[],
  daysNewestFirst: readonly string[],
): AdminQuestBoard {
  const points = [...daysNewestFirst].reverse().map((key) => ({ key, quests: 0, perfect: 0 }));
  const indexByDay = new Map(points.map((point, index) => [point.key, index]));
  const byKind = new Map<QuestKind, AdminQuestKindRow>(
    QUEST_KINDS.map((kind) => [kind, { kind, completions: 0, xp: 0 }]),
  );
  const learners = new Set<string>();
  let completed = 0;
  let perfectDays = 0;
  let xp = 0;

  for (const claim of claims) {
    const time = Date.parse(claim.createdAt);
    if (!Number.isFinite(time)) continue;
    const point = points[indexByDay.get(dayKey(new Date(time))) ?? -1];
    if (!point) continue;

    xp += claim.xp;
    if (claim.questId === QUEST_BONUS_ID) {
      perfectDays += 1;
      point.perfect += 1;
      continue;
    }
    completed += 1;
    point.quests += 1;
    learners.add(claim.userId);
    const kind = KIND_BY_ID.get(claim.questId);
    const row = kind ? byKind.get(kind) : undefined;
    if (row) {
      row.completions += 1;
      row.xp += claim.xp;
    }
  }

  return {
    completed,
    perfectDays,
    learners: learners.size,
    xp,
    byKind: [...byKind.values()],
    points,
  };
}
