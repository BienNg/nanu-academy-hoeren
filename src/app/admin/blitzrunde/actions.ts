"use server";

import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { CLASS_NAME_MAX_LENGTH, normalizeClassName } from "@/lib/admin-overview";
import {
  cancelSession,
  createSession,
  endSession,
  getAdminRound,
  listAdminRounds,
  previewDeck,
  startSession,
  type AdminRoundSummary,
  type AdminRoundView,
  type DeckPreview,
  type StoreError,
} from "@/lib/blitzrunde-store";
import { isBlitzrundeId } from "@/lib/blitzrunde";
import { getLevelChapters } from "@/lib/levels";
import { getUserStaff } from "@/lib/progress-store";
import { leaderboardClassKey } from "@/lib/xp";

type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Owner or staff (the teachers). Returns the acting user id. */
async function requireTeacher(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (isAdminUser(session.user)) return userId;
  return (await getUserStaff(userId)) ? userId : null;
}

const DENIED = { ok: false as const, error: "Only owners and staff can run a Blitzrunde." };
const BAD_ID = { ok: false as const, error: "Unknown round." };

/** Store messages are written for students (Vietnamese); the dashboard is English. */
function failure(
  result: { error: StoreError; message?: string },
  messages: Partial<Record<StoreError, string>> = {},
): { ok: false; error: string } {
  if (result.error === "unavailable") {
    return {
      ok: false,
      error: result.message ?? "Supabase did not answer. Check that supabase/blitzrunde.sql has been run.",
    };
  }
  return {
    ok: false,
    error:
      messages[result.error] ??
      (result.error === "not_found" ? "That round no longer exists." : "That did not work. Try again."),
  };
}

function lektionExists(levelSlug: string, chapterSlug: string): boolean {
  return getLevelChapters(levelSlug).some((chapter) => chapter.slug === chapterSlug);
}

export async function previewBlitzrundeDeck(
  levelSlug: string,
  chapterSlug: string,
): Promise<ActionResult<DeckPreview>> {
  if (!(await requireTeacher())) return DENIED;
  if (!lektionExists(levelSlug, chapterSlug)) return { ok: false, error: "Unknown Lektion." };
  return { ok: true, value: previewDeck(levelSlug, chapterSlug) };
}

export async function createBlitzrunde(input: {
  classLabel: string;
  levelSlug: string;
  chapterSlug: string;
}): Promise<ActionResult<{ id: string }>> {
  const userId = await requireTeacher();
  if (!userId) return DENIED;
  const classLabel = normalizeClassName(String(input.classLabel ?? "")).slice(0, CLASS_NAME_MAX_LENGTH);
  const classKey = leaderboardClassKey(classLabel);
  if (!classKey) return { ok: false, error: "Pick a class." };
  if (typeof input.levelSlug !== "string" || typeof input.chapterSlug !== "string") {
    return { ok: false, error: "Pick a level and a Lektion." };
  }
  if (!lektionExists(input.levelSlug, input.chapterSlug)) return { ok: false, error: "Unknown Lektion." };

  const result = await createSession({
    createdBy: userId,
    classKey,
    classLabel,
    levelSlug: input.levelSlug,
    chapterSlug: input.chapterSlug,
  });
  return result.ok
    ? result
    : failure(result, {
        conflict: "This class already has an open Blitzrunde. End or cancel it first.",
        invalid: "This Lektion has no usable cards (clips need a Vietnamese translation).",
      });
}

export async function startBlitzrunde(id: string): Promise<ActionResult<{ ranked: boolean }>> {
  if (!(await requireTeacher())) return DENIED;
  if (!isBlitzrundeId(id)) return BAD_ID;
  const result = await startSession(id);
  return result.ok
    ? result
    : failure(result, {
        conflict: "This round has already started or was closed.",
        invalid: "Nobody has joined yet.",
      });
}

export async function endBlitzrunde(id: string): Promise<ActionResult<null>> {
  if (!(await requireTeacher())) return DENIED;
  if (!isBlitzrundeId(id)) return BAD_ID;
  const result = await endSession(id);
  return result.ok ? result : failure(result);
}

export async function cancelBlitzrunde(id: string): Promise<ActionResult<null>> {
  if (!(await requireTeacher())) return DENIED;
  if (!isBlitzrundeId(id)) return BAD_ID;
  const result = await cancelSession(id);
  return result.ok ? result : failure(result);
}

export async function getBlitzrundeAdminRound(id: string): Promise<ActionResult<AdminRoundView>> {
  if (!(await requireTeacher())) return DENIED;
  if (!isBlitzrundeId(id)) return BAD_ID;
  const result = await getAdminRound(id);
  return result.ok ? result : failure(result);
}

export async function listBlitzrundeRounds(): Promise<
  ActionResult<{ ready: boolean; hint?: string; rounds: AdminRoundSummary[] }>
> {
  if (!(await requireTeacher())) return DENIED;
  return { ok: true, value: await listAdminRounds() };
}
