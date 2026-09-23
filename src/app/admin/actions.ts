"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { getCefrLevels } from "@/lib/levels";
import {
  CLASS_NAME_MAX_LENGTH,
  normalizeClassName,
} from "@/lib/admin-overview";
import {
  INTERVIEW_ACCESS_SLUG,
  deleteUserAccount,
  getStoredUserEmail,
  getUserLevelAccess,
  hasInterviewAccess,
  isProgressStoreConfigured,
  setUserClass,
  setUserLevelAccess,
  withoutInterviewAccess,
} from "@/lib/progress-store";

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

  revalidatePath("/admin");
  revalidatePath("/admin/classes");
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

  revalidatePath("/admin");
  revalidatePath("/admin/classes");
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

  revalidatePath("/admin");
  revalidatePath("/admin/classes");
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

  revalidatePath("/admin");
  revalidatePath("/admin/classes");
  return { ok: true, className: normalized || null };
}
