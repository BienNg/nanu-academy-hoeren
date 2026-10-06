"use server";

import { listCachedUserProgress } from "@/lib/admin-list-cache";
import {
  adminActivityGrain,
  adminRangeVietnamDayKeys,
  adminRangeVietnamInterval,
  bucketPartStamps,
  parseAdminRange,
  partsByUser,
  toAdminUserRow,
  withSessionIdentity,
  DEFAULT_ADMIN_RANGE,
  OVERVIEW_ADMIN_RANGE,
  type AdminPartBuckets,
  type AdminRange,
} from "@/lib/admin-overview";
import type { AdminQuestClaimRow } from "@/lib/admin-quests";
import { requireAdmin } from "@/lib/auth-guard";
import {
  countAdminPracticeParts,
  isProgressStoreConfigured,
  listAdminMissedClipIds,
  listAdminPracticePartStamps,
} from "@/lib/progress-store";
import { listAdminQuestClaims } from "@/lib/quest-store";
import {
  countAdminStudyParts,
  listAdminDuelXp,
  listAdminListeningXp,
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

function learnerIds(rows: readonly { userId: string; isAdmin: boolean; staff: boolean }[]) {
  return new Set(rows.filter((row) => !row.isAdmin && !row.staff).map((row) => row.userId));
}

async function activityLearnerIds() {
  const session = await requireAdmin();
  if (!isProgressStoreConfigured()) return { configured: false as const, ids: new Set<string>() };
  const items = await listCachedUserProgress("activity");
  const rows = items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user)));
  return { configured: true as const, ids: learnerIds(rows) };
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

/** Listening XP, duel XP, and quest claims for the XP tab. */
export async function loadXpWindow(range: AdminRange): Promise<XpWindow> {
  await requireAdmin();
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

  return {
    listening: listening.rows,
    duelXp: duels.rows,
    questClaims: quests.rows,
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
