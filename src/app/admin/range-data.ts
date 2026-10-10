"use server";

import { listCachedUserProgress } from "@/lib/admin-list-cache";
import {
  adminActivityGrain,
  adminRangeVietnamDayKeys,
  adminRangeVietnamInterval,
  bucketPartStamps,
  parseAdminRange,
  partsByUser,
  rowsForClassScope,
  toAdminUserRow,
  withSessionIdentity,
  DEFAULT_ADMIN_RANGE,
  OVERVIEW_ADMIN_RANGE,
  type AdminPartBuckets,
  type AdminRange,
} from "@/lib/admin-overview";
import type { AdminQuestClaimRow } from "@/lib/admin-quests";
import {
  LEARNING_PRACTICE_FAILED,
  LEARNING_PRACTICE_PASSED,
  LEARNING_STUDY_FINISHED,
  type LearningWindow,
} from "@/lib/admin-learning";
import { requireAdmin, requireDashboard } from "@/lib/auth-guard";
import {
  countAdminPracticeParts,
  isProgressStoreConfigured,
  listAdminMissedClipIds,
  listAdminPracticePartEvents,
  listAdminPracticePartStamps,
} from "@/lib/progress-store";
import { listAdminQuestClaims } from "@/lib/quest-store";
import {
  countAdminStudyParts,
  listAdminDuelXp,
  listAdminListeningXp,
  listAdminStudyPartEvents,
  listAdminStudyPartStamps,
  sumAdminRangeXp,
  type AdminDuelXpRow,
  type AdminListeningXpRow,
} from "@/lib/xp-store";

export type OverviewWindow = {
  rangeXp: Record<string, number>;
  rangeXpReady: boolean;
  studyParts: number | null;
  studyPartsByUser: Record<string, number> | null;
  practiceParts: number | null;
  practicePartsByUser: Record<string, number> | null;
  cardUserIds: string[];
};

export type ActivityWindow = {
  studyPartsByUser: Record<string, number>;
  practicePartsByUser: Record<string, number>;
  studyPartBuckets: AdminPartBuckets;
  practicePartBuckets: AdminPartBuckets;
};

export type XpWindow = {
  listening: AdminListeningXpRow[];
  duelXp: AdminDuelXpRow[];
  questClaims: AdminQuestClaimRow[];
  xpReady: boolean;
  questsReady: boolean;
};

function learnerIds(
  rows: readonly { userId: string; isAdmin: boolean; staff: boolean; teacher: boolean }[],
) {
  return new Set(
    rows.filter((row) => !row.isAdmin && !row.staff && !row.teacher).map((row) => row.userId),
  );
}

async function activityLearnerIds() {
  const access = await requireDashboard();
  if (!isProgressStoreConfigured()) {
    return { configured: false as const, ids: new Set<string>(), teacher: false };
  }
  const items = await listCachedUserProgress("activity");
  const rows = rowsForClassScope(
    items.map((item) => toAdminUserRow(withSessionIdentity(item, access.session.user))),
    access.teacherClassKeys,
  );
  return { configured: true as const, ids: learnerIds(rows), teacher: access.role === "teacher" };
}

function cardIds(
  study: { ready: boolean; byUser: Record<string, number> } | null,
  practice: { ready: boolean; partsByUser: Record<string, number> } | null,
): string[] {
  const ids = new Set<string>();
  if (study?.ready) {
    for (const [userId, count] of Object.entries(study.byUser)) {
      if (count > 0) ids.add(userId);
    }
  }
  if (practice?.ready) {
    for (const [userId, count] of Object.entries(practice.partsByUser)) {
      if (count > 0) ids.add(userId);
    }
  }
  return [...ids];
}

/** XP and finished-part counts for the overview tab. The learner list stays cached. */
export async function loadOverviewWindow(range: AdminRange): Promise<OverviewWindow> {
  const parsed = parseAdminRange(range, OVERVIEW_ADMIN_RANGE);
  const learners = await activityLearnerIds();
  if (!learners.configured) {
    return {
      rangeXp: {},
      rangeXpReady: false,
      studyParts: 0,
      studyPartsByUser: null,
      practiceParts: 0,
      practicePartsByUser: null,
      cardUserIds: [],
    };
  }

  const days = adminRangeVietnamDayKeys(parsed);
  const fromDay = days[days.length - 1] ?? days[0];
  const toDay = days[0];
  const partWindow = adminRangeVietnamInterval(parsed);
  const [xpReads, study, practice] = await Promise.all([
    sumAdminRangeXp(fromDay, toDay),
    countAdminStudyParts(fromDay, toDay, learners.ids),
    countAdminPracticeParts(partWindow.from, partWindow.to, learners.ids),
  ]);

  return {
    rangeXp: xpReads.byUser,
    rangeXpReady: xpReads.ready,
    studyParts: study.ready ? study.count : null,
    studyPartsByUser: study.ready ? study.byUser : null,
    practiceParts: practice.ready ? practice.parts : null,
    practicePartsByUser: practice.ready ? practice.passedByUser : null,
    cardUserIds: cardIds(study, practice),
  };
}

/** Finished study and practice parts for the activity tab, totalled and by chart bucket. */
export async function loadActivityWindow(range: AdminRange): Promise<ActivityWindow> {
  const parsed = parseAdminRange(range, OVERVIEW_ADMIN_RANGE);
  const learners = await activityLearnerIds();
  if (!learners.configured) {
    return {
      studyPartsByUser: {},
      practicePartsByUser: {},
      studyPartBuckets: {},
      practicePartBuckets: {},
    };
  }

  const days = adminRangeVietnamDayKeys(parsed);
  const fromDay = days[days.length - 1] ?? days[0];
  const toDay = days[0];
  const partWindow = adminRangeVietnamInterval(parsed);
  const grain = adminActivityGrain(parsed);
  const [study, practice] = await Promise.all([
    listAdminStudyPartStamps(fromDay, toDay, learners.ids),
    listAdminPracticePartStamps(partWindow.from, partWindow.to, learners.ids),
  ]);
  const studyPartBuckets = study.ready ? bucketPartStamps(study.stamps, grain) : {};
  const practicePartBuckets = practice.ready ? bucketPartStamps(practice.stamps, grain) : {};

  return {
    studyPartsByUser: partsByUser(studyPartBuckets),
    practicePartsByUser: partsByUser(practicePartBuckets),
    studyPartBuckets,
    practicePartBuckets,
  };
}

/**
 * Every finished study part and every ended practice part of the students in
 * scope, for the learning and pace tab. Not windowed: retention cohorts and the
 * course schedule look back further than any date tab. Users and lessons are
 * sent once each and events point at them, so the payload stays small.
 */
export async function loadLearningWindow(): Promise<LearningWindow> {
  const learners = await activityLearnerIds();
  const empty: LearningWindow = {
    ready: false,
    users: [],
    lessons: [],
    events: [],
    loadedAt: new Date().toISOString(),
  };
  if (!learners.configured) return empty;

  const [study, practice] = await Promise.all([
    listAdminStudyPartEvents(learners.ids),
    listAdminPracticePartEvents(learners.ids),
  ]);
  if (!study.ready && !practice.ready) return empty;

  const users: string[] = [];
  const userIndex = new Map<string, number>();
  const lessons: string[] = [];
  const lessonIndex = new Map<string, number>();
  const indexOf = (list: string[], index: Map<string, number>, value: string) => {
    let found = index.get(value);
    if (found === undefined) {
      found = list.length;
      list.push(value);
      index.set(value, found);
    }
    return found;
  };
  const events: number[] = [];
  const push = (
    userId: string,
    lessonKey: string,
    partNumber: number,
    at: string,
    code: number,
  ) => {
    const ms = Date.parse(at);
    if (Number.isNaN(ms)) return;
    events.push(
      indexOf(users, userIndex, userId),
      Math.floor(ms / 60_000),
      indexOf(lessons, lessonIndex, lessonKey),
      partNumber,
      code,
    );
  };
  for (const event of study.events) {
    push(event.userId, event.lessonKey, event.partNumber, event.at, LEARNING_STUDY_FINISHED);
  }
  for (const event of practice.events) {
    push(
      event.userId,
      event.lessonKey,
      event.partNumber,
      event.at,
      event.passed ? LEARNING_PRACTICE_PASSED : LEARNING_PRACTICE_FAILED,
    );
  }

  return { ready: true, users, lessons, events, loadedAt: new Date().toISOString() };
}

/** Listening XP, duel XP, and quest claims for the XP tab. */
export async function loadXpWindow(range: AdminRange): Promise<XpWindow> {
  const learners = await activityLearnerIds();
  const parsed = parseAdminRange(range, DEFAULT_ADMIN_RANGE);
  const days = adminRangeVietnamDayKeys(parsed);
  const fromDay = days[days.length - 1] ?? days[0];
  const toDay = days[0];
  if (!isProgressStoreConfigured()) {
    return { listening: [], duelXp: [], questClaims: [], xpReady: false, questsReady: false };
  }

  const [listening, duels, quests] = await Promise.all([
    listAdminListeningXp(fromDay, toDay),
    listAdminDuelXp(fromDay, toDay),
    listAdminQuestClaims(fromDay, toDay),
  ]);

  const allowed = learners.configured && learners.teacher ? learners.ids : null;
  return {
    listening: allowed ? listening.rows.filter((row) => allowed.has(row.userId)) : listening.rows,
    duelXp: allowed ? duels.rows.filter((row) => allowed.has(row.userId)) : duels.rows,
    questClaims: allowed ? quests.rows.filter((row) => allowed.has(row.userId)) : quests.rows,
    xpReady: listening.ready,
    questsReady: quests.ready,
  };
}

/** Missed clips for the practice runs visible in the selected window. */
export async function loadPracticeMissedClips(
  runIds: readonly string[],
): Promise<Record<string, string[]>> {
  await requireAdmin();
  if (!isProgressStoreConfigured()) return {};
  const ids = runIds.filter((id): id is string => typeof id === "string").slice(0, 5000);
  return listAdminMissedClipIds(ids);
}
