"use server";

import { revalidatePath, updateTag } from "next/cache";
import {
  ADMIN_DUELS_TAG,
  ADMIN_LISTENING_RUNS_TAG,
  ADMIN_USER_PROGRESS_TAG,
} from "@/lib/admin-list-cache";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  studentProgressClear,
  type AdminXpEvent,
  type LessonStartSignal,
  type StudentProgressTarget,
} from "@/lib/admin-detail";
import { getCefrLevels, getChapterClips } from "@/lib/levels";
import { getLivingWorkplaces } from "@/lib/living";
import { livingAccessSlug, workplaceFromAccessSlug } from "@/lib/living-content";
import {
  CLASS_NAME_MAX_LENGTH,
  classKey,
  normalizeClassName,
  shortBerufLabel,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  deleteUserDuelXp,
  forgetStudiedClips,
  getAdminDuelDetail,
  listStudentDuelClipQuits,
  listStudentDuelMatchFailures,
  syncStudiedClips,
  type AdminDuelDetail,
} from "@/lib/duel-store";
import { isDuelId, type DuelClipQuit, type StudentDuelMatchFailuresPage } from "@/lib/duels";
import type { StudentJumpRunsPage } from "@/lib/lesson-jump";
import type { StoredListeningRun, StudentRunsPage } from "@/lib/listening-runs";
import { practiceCardCount } from "@/lib/practice-deck";
import {
  getOnboardingStatus,
  resetOnboarding,
  type OnboardingStatus,
} from "@/lib/onboarding-store";
import {
  commitAdminProgressClear,
  type AppUseRecord,
  type SignInRecord,
  type StoredProgress,
} from "@/lib/progress";
import {
  INTERVIEW_ACCESS_SLUG,
  clearUserSignInHistory,
  deleteListeningRunsForLessons,
  deletePendingLevelGrant,
  deleteStudyXpForLessons,
  deleteUserAccount,
  findActiveUserIdByEmail,
  getAdminStudentDetail,
  listLessonStartSignals,
  getCloudProgress,
  getStoredUserEmail,
  getUserClassName,
  getUserDashboardFlags,
  getUserLevelAccess,
  getUserStaff,
  hasInterviewAccess,
  isProgressStoreConfigured,
  listStudentJumpRuns,
  listStudentListeningRuns,
  listStudentUiClicks,
  livingAccessFrom,
  normalizeGrantEmail,
  setCloudProgress,
  setUserClass,
  setUserLevelAccess,
  setUserStaff,
  setUserTeacher,
  upsertPendingLevelGrant,
  withoutReservedAccess,
  type PendingLevelGrant,
} from "@/lib/progress-store";
import { deleteUserQuestClaims } from "@/lib/quest-store";
import { deleteUserBadges } from "@/lib/badge-store";
import { listUserXpEvents } from "@/lib/xp-store";
import type { UiClickGroup } from "@/lib/ui-clicks";

/**
 * Every admin page reads the same user rows, so one layout-scoped call covers
 * all of them and keeps new sections working without being listed here.
 */
function revalidateAdmin(): void {
  revalidatePath("/admin", "layout");
  updateTag(ADMIN_USER_PROGRESS_TAG);
  updateTag(ADMIN_DUELS_TAG);
  updateTag(ADMIN_LISTENING_RUNS_TAG);
}

/** Full admins and staff. Deletes stay on `isAdminUser` alone. Teachers cannot grant or delete. */
async function requireDashboardAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  if (isAdminUser(session.user)) return true;
  return getUserStaff(session.user.id);
}

/** Owner, staff, or a teacher reading a student in one of their classes. */
async function requireStudentRead(userId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  if (isAdminUser(session.user)) return true;
  const flags = await getUserDashboardFlags(session.user.id);
  if (flags.staff) return true;
  if (!flags.teacher) return false;
  const className = await getUserClassName(userId);
  const key = classKey(className);
  return key.length > 0 && flags.classes.some((name) => classKey(name) === key);
}

function adminCourseCatalog() {
  const tracks: AdminTrackColumn[] = getAvailableBerufe().map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  return buildAdminCourseCatalog(tracks);
}

function readProgressTarget(value: StudentProgressTarget): StudentProgressTarget | null {
  if (!value || typeof value !== "object") return null;
  if (value.scope === "all") return { scope: "all" };
  if (typeof value.courseId !== "string" || !value.courseId.trim()) return null;
  const courseId = value.courseId.trim();
  if (value.scope === "course") return { scope: "course", courseId };
  if (typeof value.lessonId !== "string" || !value.lessonId.trim()) return null;
  const lessonId = value.lessonId.trim();
  if (value.scope === "lesson") return { scope: "lesson", courseId, lessonId };
  if (value.scope !== "part") return null;
  const part = value.part;
  if (part === "study" || part === "listening") {
    return { scope: "part", courseId, lessonId, part };
  }
  if (!part || typeof part !== "object" || typeof part.videoId !== "string") return null;
  const videoId = part.videoId.trim();
  if (!videoId) return null;
  return { scope: "part", courseId, lessonId, part: { videoId } };
}

export async function deleteAdminStudentProgress(
  userId: string,
  target: StudentProgressTarget,
): Promise<{ ok: true; progress: StoredProgress } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !isAdminUser(session.user)) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  const parsed = readProgressTarget(target);
  if (!id || !parsed) return { ok: false, error: "Missing student or progress target" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const built = studentProgressClear(
    adminCourseCatalog(),
    parsed,
    crypto.randomUUID(),
    new Date().toISOString(),
  );
  if (!built) return { ok: false, error: "That progress is not in the catalog" };

  try {
    const current = await getCloudProgress(id);
    const progress = commitAdminProgressClear(current, built.clear);
    await setCloudProgress(id, progress);
    await deleteListeningRunsForLessons(id, built.history.runs);
    await deleteStudyXpForLessons(id, built.history.studyXp);
    await forgetStudiedClips(id, built.history.studied);
    if (parsed.scope === "all") {
      // Duel XP, quest XP and badges are not tied to a Lektion, so only a full wipe removes them.
      await deleteUserDuelXp(id);
      await deleteUserQuestClaims(id);
      await deleteUserBadges(id);
    }
    await syncStudiedClips(id, progress);
    revalidateAdmin();
    return { ok: true, progress };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete progress";
    return { ok: false, error: message };
  }
}

export async function clearAdminStudentSignIns(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !isAdminUser(session.user)) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  try {
    await clearUserSignInHistory(id);
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear sign-in history";
    return { ok: false, error: message };
  }
}

export async function loadAdminStudentOnboarding(
  userId: string,
): Promise<({ ok: true } & OnboardingStatus) | { ok: false; error: string }> {
  if (!(await requireStudentRead(userId.trim()))) {
    return { ok: false, error: "Unauthorized" };
  }
  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }
  const status = await getOnboardingStatus(id);
  if (!status) return { ok: false, error: "Could not read onboarding. Run supabase/onboarding.sql." };
  return { ok: true, ...status };
}

/** The learner sees the map tour again on their next visit, whatever their XP. */
export async function resetAdminStudentOnboarding(
  userId: string,
): Promise<({ ok: true } & OnboardingStatus) | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }
  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }
  try {
    return { ok: true, ...(await resetOnboarding(id)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset onboarding";
    return { ok: false, error: message };
  }
}

/** Older runs did not store a card count. A finished part that lists every clip can be rebuilt. */
function withPartCardCount(run: StoredListeningRun): StoredListeningRun {
  if (run.cardCount != null) return run;
  if (run.clips.length !== run.clipCount) return run;
  const slash = run.lessonKey.indexOf("/");
  if (slash <= 0) return run;
  let lessonClips;
  try {
    lessonClips = getChapterClips(run.lessonKey.slice(0, slash), run.lessonKey.slice(slash + 1));
  } catch {
    return run;
  }
  const byId = new Map(lessonClips.map((clip) => [clip.id, clip]));
  const partClips = [];
  for (const result of run.clips) {
    const clip = byId.get(result.clipId);
    if (!clip) return run;
    partClips.push(clip);
  }
  return { ...run, cardCount: practiceCardCount(partClips, lessonClips) };
}

export async function loadAdminStudentDetail(userId: string): Promise<
  | {
      ok: true;
      progress: StoredProgress;
      signIns: SignInRecord[];
      appUses: AppUseRecord[];
      startSignals: LessonStartSignal[];
    }
  | { ok: false; error: string }
> {
  const idForGate = userId.trim();
  if (!(await requireStudentRead(idForGate))) {
    return { ok: false, error: "Unauthorized" };
  }
  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }
  const [detail, startSignals] = await Promise.all([
    getAdminStudentDetail(id),
    listLessonStartSignals(id),
  ]);
  if (!detail) return { ok: false, error: "Could not load this student's progress." };
  return { ok: true, ...detail, startSignals };
}

export async function loadAdminStudentXp(
  userId: string,
): Promise<{ ok: true; events: AdminXpEvent[] } | { ok: false; error: string }> {
  const idForGate = userId.trim();
  if (!(await requireStudentRead(idForGate))) {
    return { ok: false, error: "Unauthorized" };
  }
  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  const events = await listUserXpEvents(id);
  if (!events) return { ok: false, error: "Could not load this student's XP." };
  return { ok: true, events };
}

function parseRunWindow(
  window: { fromIso: string; toIso: string } | null,
): { fromIso: string; toIso: string } | null {
  if (!window) return null;
  const from = Date.parse(window.fromIso);
  const to = Date.parse(window.toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null;
  return { fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() };
}

export async function listAdminStudentRuns(
  userId: string,
  offset = 0,
  window: { fromIso: string; toIso: string } | null = null,
): Promise<({ ok: true } & StudentRunsPage) | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const start = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;
  const bounds = parseRunWindow(window);
  if (window && !bounds) return { ok: false, error: "Invalid time range" };
  const page = await listStudentListeningRuns(id, start, bounds);
  return { ok: true, ...page, runs: page.runs.map(withPartCardCount) };
}

export async function listAdminStudentJumpRuns(
  userId: string,
  offset = 0,
  window: { fromIso: string; toIso: string } | null = null,
): Promise<({ ok: true } & StudentJumpRunsPage) | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const start = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;
  const bounds = parseRunWindow(window);
  if (window && !bounds) return { ok: false, error: "Invalid time range" };
  return { ok: true, ...(await listStudentJumpRuns(id, start, bounds)) };
}

export async function listAdminStudentDuelMatchFailures(
  userId: string,
  offset = 0,
  window: { fromIso: string; toIso: string } | null = null,
): Promise<({ ok: true } & StudentDuelMatchFailuresPage) | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const start = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;
  const bounds = parseRunWindow(window);
  if (window && !bounds) return { ok: false, error: "Invalid time range" };
  return { ok: true, ...(await listStudentDuelMatchFailures(id, start, bounds)) };
}

export async function listAdminStudentDuelClipQuits(
  userId: string,
  window: { fromIso: string; toIso: string } | null = null,
): Promise<{ ok: true; quits: DuelClipQuit[] } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const bounds = parseRunWindow(window);
  if (window && !bounds) return { ok: false, error: "Invalid time range" };
  return { ok: true, quits: await listStudentDuelClipQuits(id, bounds) };
}

export async function listAdminStudentClicks(
  userId: string,
  window: { fromIso: string; toIso: string } | null = null,
): Promise<{ ok: true; groups: UiClickGroup[] } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const bounds = parseRunWindow(window);
  if (window && !bounds) return { ok: false, error: "Invalid time range" };
  const page = await listStudentUiClicks(id, bounds);
  if (!page) return { ok: false, error: "Could not load this student's clicks." };
  return { ok: true, groups: page.groups };
}

export async function deleteAdminUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !isAdminUser(session.user)) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) {
    return { ok: false, error: "Missing user id" };
  }

  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  try {
    await deleteUserAccount(id);
    await deleteUserBadges(id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete account";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  return { ok: true };
}

export async function setAdminUserLevelAccess(
  userId: string,
  levelSlugs: string[],
): Promise<{ ok: true; levelAccess: string[] } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) {
    return { ok: false, error: "Missing user id" };
  }

  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const email = await getStoredUserEmail(id);
  if (isAdminUser({ id, email })) {
    return { ok: false, error: "Admins already have access to every level." };
  }

  const catalog = getCefrLevels();
  const requested = new Set(levelSlugs);
  const levelAccess = catalog
    .map((level) => level.slug)
    .filter((slug) => requested.has(slug));
  const stored = await getUserLevelAccess(id);
  const next = [
    ...levelAccess,
    ...(hasInterviewAccess(stored) ? [INTERVIEW_ACCESS_SLUG] : []),
    ...livingGrantSlugs(livingAccessFrom(stored)),
  ];

  try {
    await setUserLevelAccess(id, next);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update level access";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  revalidatePath("/");
  return { ok: true, levelAccess };
}

export async function setAdminUserInterviewAccess(
  userId: string,
  granted: boolean,
): Promise<{ ok: true; interviewAccess: boolean } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) {
    return { ok: false, error: "Missing user id" };
  }

  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const email = await getStoredUserEmail(id);
  if (isAdminUser({ id, email })) {
    return { ok: false, error: "Admins already have access to every course." };
  }

  const interviewAccess = granted === true;
  const storedAll = await getUserLevelAccess(id);
  const stored = withoutReservedAccess(storedAll);
  const catalog = new Set(getCefrLevels().map((level) => level.slug));
  const levelAccess = stored.filter((slug) => catalog.has(slug));
  const next = [
    ...levelAccess,
    ...(interviewAccess ? [INTERVIEW_ACCESS_SLUG] : []),
    ...livingGrantSlugs(livingAccessFrom(storedAll)),
  ];

  try {
    await setUserLevelAccess(id, next);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update interview access";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  revalidatePath("/");
  return { ok: true, interviewAccess };
}

/** Reserved slugs for the requested workplaces that exist in workplaces.json, in catalog order. */
function livingGrantSlugs(workplaceSlugs: readonly string[]): string[] {
  const requested = new Set(workplaceSlugs);
  return getLivingWorkplaces()
    .filter((workplace) => requested.has(workplace.slug))
    .map((workplace) => livingAccessSlug(workplace.slug));
}

export async function setAdminUserLivingAccess(
  userId: string,
  workplaceSlug: string,
  granted: boolean,
): Promise<{ ok: true; livingAccess: string[] } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) {
    return { ok: false, error: "Missing user id" };
  }
  if (!getLivingWorkplaces().some((workplace) => workplace.slug === workplaceSlug)) {
    return { ok: false, error: "Unknown workplace" };
  }

  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const email = await getStoredUserEmail(id);
  if (isAdminUser({ id, email })) {
    return { ok: false, error: "Admins already have access to every course." };
  }

  const stored = await getUserLevelAccess(id);
  const current = livingAccessFrom(stored);
  const living = granted
    ? [...current.filter((slug) => slug !== workplaceSlug), workplaceSlug]
    : current.filter((slug) => slug !== workplaceSlug);
  const others = stored.filter((slug) => workplaceFromAccessSlug(slug) === null);
  const livingSlugs = livingGrantSlugs(living);

  try {
    await setUserLevelAccess(id, [...others, ...livingSlugs]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update Leben in Deutschland access";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  revalidatePath("/");
  return { ok: true, livingAccess: livingAccessFrom(livingSlugs) };
}

function catalogGrantSlugs(
  levelSlugs: readonly string[],
  interview: boolean,
  living: readonly string[] = [],
): string[] {
  const catalog = getCefrLevels();
  const requested = new Set(levelSlugs);
  const levelAccess = catalog
    .map((level) => level.slug)
    .filter((slug) => requested.has(slug));
  return [
    ...levelAccess,
    ...(interview ? [INTERVIEW_ACCESS_SLUG] : []),
    ...livingGrantSlugs(living),
  ];
}

export async function setAdminPendingAccess(
  email: string,
  levelSlugs: string[],
  interviewAccess: boolean,
  className = "",
  livingAccess: string[] = [],
): Promise<
  { ok: true; grant: PendingLevelGrant | null } | { ok: false; error: string }
> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const normalized = normalizeGrantEmail(email);
  if (!normalized) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (isAdminUser({ email: normalized })) {
    return { ok: false, error: "Admins already have access to every course." };
  }

  const slugs = catalogGrantSlugs(levelSlugs, interviewAccess === true, livingAccess);
  const storedClass = normalizeClassName(className);
  if (storedClass.length > CLASS_NAME_MAX_LENGTH) {
    return { ok: false, error: "Class names can be at most 64 characters." };
  }

  try {
    if (slugs.length === 0 && !storedClass) {
      await deletePendingLevelGrant(normalized);
      revalidateAdmin();
      return { ok: true, grant: null };
    }

    const existingId = await findActiveUserIdByEmail(normalized);
    if (existingId) {
      return {
        ok: false,
        error: "This email already has an account. Unlock courses for them in the list below.",
      };
    }

    await upsertPendingLevelGrant(normalized, slugs, storedClass || null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save pre-unlock";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  return {
    ok: true,
    grant: {
      email: normalized,
      levelAccess: withoutReservedAccess(slugs),
      interviewAccess: hasInterviewAccess(slugs),
      livingAccess: livingAccessFrom(slugs),
      className: storedClass || null,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function removeAdminPendingAccess(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const normalized = normalizeGrantEmail(email);
  if (!normalized) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    await deletePendingLevelGrant(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove pre-unlock";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  return { ok: true };
}

export async function setAdminUserClass(
  userId: string,
  className: string,
): Promise<{ ok: true; className: string | null } | { ok: false; error: string }> {
  if (!(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) {
    return { ok: false, error: "Missing user id" };
  }

  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const normalized = normalizeClassName(className);
  if (normalized.length > CLASS_NAME_MAX_LENGTH) {
    return { ok: false, error: "Class names can be at most 64 characters." };
  }

  try {
    await setUserClass(id, normalized || null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update class";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  return { ok: true, className: normalized || null };
}

export async function setAdminUserStaff(
  userId: string,
  staff: boolean,
): Promise<{ ok: true; staff: boolean } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !isAdminUser(session.user)) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) {
    return { ok: false, error: "Missing user id" };
  }

  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const email = await getStoredUserEmail(id);
  if (isAdminUser({ id, email })) {
    return { ok: false, error: "This account already has full admin access." };
  }

  const next = staff === true;
  if (next && (await getUserDashboardFlags(id)).teacher) {
    return { ok: false, error: "Remove the teacher role before making this account staff." };
  }
  try {
    await setUserStaff(id, next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update staff access";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  revalidatePath("/account");
  return { ok: true, staff: next };
}

export async function setAdminUserTeacher(
  userId: string,
  teacher: boolean,
  classes: readonly string[],
): Promise<{ ok: true; teacher: boolean; classes: string[] } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !(await requireDashboardAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const email = await getStoredUserEmail(id);
  if (isAdminUser({ id, email })) {
    return { ok: false, error: "This account already has full admin access." };
  }

  const next = teacher === true;
  if (next && (await getUserDashboardFlags(id)).staff) {
    return { ok: false, error: "Remove staff access before making this account a teacher." };
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const value of classes) {
    if (typeof value !== "string") continue;
    const normalized = normalizeClassName(value);
    if (!normalized) continue;
    if (normalized.length > CLASS_NAME_MAX_LENGTH) {
      return { ok: false, error: "Class names can be at most 64 characters." };
    }
    const key = classKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(normalized);
  }
  if (next && names.length === 0) {
    return { ok: false, error: "Choose at least one class." };
  }

  try {
    await setUserTeacher(id, next, names);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update teacher access";
    return { ok: false, error: message };
  }

  revalidateAdmin();
  revalidatePath("/account");
  return { ok: true, teacher: next, classes: next ? names : [] };
}

export type AdminDuelQuestions = Pick<AdminDuelDetail, "questions" | "answers">;

/** Questions in one challenge, and when each student answered. Teachers only see their own classes. */
export async function loadAdminDuelQuestions(
  duelId: string,
): Promise<{ ok: true; detail: AdminDuelQuestions } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in again to see this challenge." };
  if (!isDuelId(duelId)) return { ok: false, error: "Unknown challenge." };

  const detail = await getAdminDuelDetail(duelId);
  if (!detail) return { ok: false, error: "This challenge is not in the database." };

  if (!isAdminUser(session.user)) {
    const flags = await getUserDashboardFlags(session.user.id);
    if (!flags.staff) {
      if (!flags.teacher) return { ok: false, error: "You cannot open this challenge." };
      const keys = new Set(flags.classes.map((name) => classKey(name)).filter((key) => key.length > 0));
      const [challengerClass, opponentClass] = await Promise.all([
        getUserClassName(detail.challengerId),
        getUserClassName(detail.opponentId),
      ]);
      const allowed = [challengerClass, opponentClass].some((name) => keys.has(classKey(name)));
      if (!allowed) return { ok: false, error: "You cannot open this challenge." };
    }
  }

  return { ok: true, detail: { questions: detail.questions, answers: detail.answers } };
}
