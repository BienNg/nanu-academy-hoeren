"use server";

import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  PACE_PARTS_PER_DAY,
  buildLearningBoard,
  buildLearningCourseMap,
  encodeLearningWindow,
  learningLearner,
} from "@/lib/admin-learning";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import {
  classKey,
  listAdminClasses,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  buildPartDifficultyBoard,
  cohortMembers,
  parseCohortInput,
  parsePartChangeInput,
  type ClipBehaviorData,
  type DifficultyCohort,
  type PartChange,
} from "@/lib/part-difficulty";
import {
  PartDifficultySchemaError,
  PART_DIFFICULTY_SCHEMA_HINT,
  deleteDifficultyCohortRow,
  deletePartChangeRow,
  insertPartChangeRow,
  listDifficultyCohorts,
  listDifficultyRuns,
  listPartChanges,
  listPartClipOutcomes,
  listPartStarts,
  saveDifficultyCohortRow,
} from "@/lib/part-difficulty-store";
import { getUserStaff, isProgressStoreConfigured } from "@/lib/progress-store";
import { listAdminStudyPartEvents } from "@/lib/xp-store";

type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owners and staff, like the page itself. */
async function requireEditor(): Promise<{ userId: string; label: string } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (!isAdminUser(session.user) && !(await getUserStaff(userId))) return null;
  return { userId, label: session.user.email ?? session.user.name ?? userId };
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof PartDifficultySchemaError) return PART_DIFFICULTY_SCHEMA_HINT;
  return error instanceof Error ? error.message : fallback;
}

function courseMap() {
  const tracks: AdminTrackColumn[] = getAvailableBerufe().map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  return buildLearningCourseMap(buildAdminCourseCatalog(tracks));
}

/**
 * The Behavior tab for one cohort, or every student when `cohortId` is null.
 * Pace still reads every student, so a class's schedule start does not move.
 */
export async function loadClipBehavior(cohortId: string | null): Promise<ClipBehaviorData> {
  const session = await requireAdmin();
  const loadedAt = new Date().toISOString();
  const empty: ClipBehaviorData = {
    status: "unconfigured",
    setup: { starts: "error", cohorts: "error", changes: "error", clips: "error" },
    cohorts: [],
    classes: [],
    cohortId: null,
    cohortSize: 0,
    allLearners: 0,
    board: null,
    loadedAt,
  };
  if (!isProgressStoreConfigured()) return empty;

  const items = await listCachedUserProgress("activity");
  const learners = items
    .map((item) => toAdminUserRow(withSessionIdentity(item, session.user)))
    .filter((row) => !row.isAdmin && !row.staff && !row.teacher);
  const allIds = new Set(learners.map((row) => row.userId));

  const cohortRead = await listDifficultyCohorts();
  const cohort: DifficultyCohort | null =
    cohortId == null ? null : (cohortRead.cohorts.find((entry) => entry.id === cohortId) ?? null);
  const scopeIds = cohort ? cohortMembers(cohort, learners, classKey) : allIds;

  const [runRead, startRead, clipRead, changeRead, study] = await Promise.all([
    listDifficultyRuns(allIds),
    listPartStarts(scopeIds),
    listPartClipOutcomes(scopeIds),
    listPartChanges(),
    listAdminStudyPartEvents(allIds),
  ]);

  const base = {
    setup: {
      starts: startRead.status,
      cohorts: cohortRead.status,
      changes: changeRead.status,
      clips: clipRead.status,
    },
    cohorts: cohortRead.cohorts,
    classes: listAdminClasses(learners),
    cohortId: cohort?.id ?? null,
    cohortSize: scopeIds.size,
    allLearners: allIds.size,
    loadedAt,
  };
  if (runRead.status !== "ready") return { ...base, status: runRead.status, board: null };

  const course = courseMap();
  const now = Date.now();
  const pace = buildLearningBoard({
    learners: learners
      .filter((row) => scopeIds.has(row.userId))
      .map((row) => learningLearner(row, classKey(row.className))),
    allLearners: learners.map((row) => learningLearner(row, classKey(row.className))),
    window: encodeLearningWindow(
      study.ready ? study.events : [],
      runRead.runs.map((run) => ({
        userId: run.userId,
        lessonKey: run.lessonKey,
        partNumber: run.partNumber,
        passed: run.passed,
        at: new Date(run.at).toISOString(),
      })),
    ),
    course,
    windowDays: 30,
    now,
  }).pace;
  const behind = new Set(
    pace.students
      .filter((student) => !student.courseComplete && student.behind >= PACE_PARTS_PER_DAY)
      .map((student) => student.userId),
  );

  const studyAt = new Map<string, number[]>();
  if (study.ready) {
    for (const event of study.events) {
      if (!scopeIds.has(event.userId)) continue;
      const ms = Date.parse(event.at);
      if (Number.isNaN(ms)) continue;
      const list = studyAt.get(event.userId) ?? [];
      list.push(ms);
      studyAt.set(event.userId, list);
    }
  }

  const board = buildPartDifficultyBoard({
    runs: runRead.runs.filter((run) => scopeIds.has(run.userId)),
    starts: startRead.starts,
    clips: clipRead.clips,
    studyAt,
    changes: changeRead.changes,
    course,
    behind,
    now,
  });
  return { ...base, status: "ready", board };
}

export async function saveDifficultyCohort(input: unknown): Promise<ActionResult<DifficultyCohort>> {
  const actor = await requireEditor();
  if (!actor) return { ok: false, error: "Only owners and staff can edit cohorts." };
  const parsed = parseCohortInput(input);
  if (!parsed) return { ok: false, error: "Give the cohort a name and at least one class." };
  try {
    return { ok: true, value: await saveDifficultyCohortRow(parsed, actor.label) };
  } catch (error) {
    return { ok: false, error: errorText(error, "Could not save this cohort.") };
  }
}

export async function deleteDifficultyCohort(id: unknown): Promise<ActionResult<string>> {
  const actor = await requireEditor();
  if (!actor) return { ok: false, error: "Only owners and staff can edit cohorts." };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "Unknown cohort." };
  try {
    await deleteDifficultyCohortRow(id);
    return { ok: true, value: id };
  } catch (error) {
    return { ok: false, error: errorText(error, "Could not delete this cohort.") };
  }
}

export async function savePartChange(input: unknown): Promise<ActionResult<PartChange>> {
  const actor = await requireEditor();
  if (!actor) return { ok: false, error: "Only owners and staff can log content changes." };
  const parsed = parsePartChangeInput(input);
  if (!parsed) return { ok: false, error: "Pick a part and a date. Notes stay under 500 characters." };
  try {
    return { ok: true, value: await insertPartChangeRow(parsed, actor.label) };
  } catch (error) {
    return { ok: false, error: errorText(error, "Could not save this change.") };
  }
}

export async function deletePartChange(id: unknown): Promise<ActionResult<string>> {
  const actor = await requireEditor();
  if (!actor) return { ok: false, error: "Only owners and staff can log content changes." };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "Unknown change." };
  try {
    await deletePartChangeRow(id);
    return { ok: true, value: id };
  } catch (error) {
    return { ok: false, error: errorText(error, "Could not delete this change.") };
  }
}
