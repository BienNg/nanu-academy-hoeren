"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  studentProgressClear,
  type StudentProgressTarget,
} from "@/lib/admin-detail";
import { getCefrLevels } from "@/lib/levels";
import {
  CLASS_NAME_MAX_LENGTH,
  normalizeClassName,
  shortBerufLabel,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import { forgetStudiedClips, syncStudiedClips } from "@/lib/duel-store";
import type { StudentRunsPage } from "@/lib/listening-runs";
import { commitAdminProgressClear, type StoredProgress } from "@/lib/progress";
import {
  INTERVIEW_ACCESS_SLUG,
  deleteListeningRunsForLessons,
  deleteUserAccount,
  getCloudProgress,
  getStoredUserEmail,
  getUserLevelAccess,
  hasInterviewAccess,
  isProgressStoreConfigured,
  listStudentListeningRuns,
  setCloudProgress,
  setUserClass,
  setUserLevelAccess,
  withoutInterviewAccess,
} from "@/lib/progress-store";

/**
 * Every admin page reads the same user rows, so one layout-scoped call covers
 * all of them and keeps new sections working without being listed here.
 */
function revalidateAdmin(): void {
  revalidatePath("/admin", "layout");
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
    await forgetStudiedClips(id, built.history.studied);
    await syncStudiedClips(id, progress);
    revalidateAdmin();
    return { ok: true, progress };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete progress";
    return { ok: false, error: message };
  }
}

export async function listAdminStudentRuns(
  userId: string,
  offset = 0,
): Promise<({ ok: true } & StudentRunsPage) | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !isAdminUser(session.user)) {
    return { ok: false, error: "Unauthorized" };
  }

  const id = userId.trim();
  if (!id) return { ok: false, error: "Missing user id" };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Cloud progress store is not configured" };
  }

  const start = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;
  const page = await listStudentListeningRuns(id, start);
  return { ok: true, ...page };
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
    return { ok: false, error: "Admins already have access to every level." };
  }

  const catalog = getCefrLevels();
  const requested = new Set(levelSlugs);
  const levelAccess = catalog
    .map((level) => level.slug)
    .filter((slug) => requested.has(slug));
  const stored = await getUserLevelAccess(id);
  const next = hasInterviewAccess(stored)
    ? [...levelAccess, INTERVIEW_ACCESS_SLUG]
    : levelAccess;

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
    return { ok: false, error: "Admins already have access to every course." };
  }

  const interviewAccess = granted === true;
  const stored = withoutInterviewAccess(await getUserLevelAccess(id));
  const catalog = new Set(getCefrLevels().map((level) => level.slug));
  const levelAccess = stored.filter((slug) => catalog.has(slug));
  const next = interviewAccess
    ? [...levelAccess, INTERVIEW_ACCESS_SLUG]
    : levelAccess;

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

export async function setAdminUserClass(
  userId: string,
  className: string,
): Promise<{ ok: true; className: string | null } | { ok: false; error: string }> {
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
