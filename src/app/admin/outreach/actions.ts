"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { normalizeGrantEmail } from "@/lib/progress";
import {
  applyOutreachPatch,
  isOutreachGroup,
  isOutreachReason,
  isOutreachStatus,
  type OutreachCase,
  type OutreachPatch,
} from "@/lib/outreach";
import { getUserStaff } from "@/lib/progress-store";
import { getOutreachCase, upsertOutreachCase } from "@/lib/outreach-store";

type ActionResult = { ok: true; value: OutreachCase } | { ok: false; error: string };

async function requireStaff(): Promise<{ userId: string; name: string | null } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (!isAdminUser(session.user) && !(await getUserStaff(userId))) return null;
  return { userId, name: session.user.name ?? null };
}

function optionalEnum<T extends string>(
  value: unknown,
  check: (value: string) => value is T,
): T | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !check(value)) return undefined;
  return value;
}

function readPatch(input: unknown): OutreachPatch | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const email = typeof raw.email === "string" ? normalizeGrantEmail(raw.email) : null;
  if (!email) return null;
  const groupOverride = optionalEnum(raw.groupOverride, isOutreachGroup);
  const status = optionalEnum(raw.status, isOutreachStatus);
  const reason = optionalEnum(raw.reason, isOutreachReason);
  const category = typeof raw.category === "string" && isOutreachGroup(raw.category) ? raw.category : null;
  if (groupOverride === undefined || status == null || reason === undefined || !category) {
    return null;
  }
  const markSent = raw.markSent === 1 || raw.markSent === 2 ? raw.markSent : null;
  const parts = typeof raw.parts === "number" && Number.isFinite(raw.parts) ? Math.max(0, Math.floor(raw.parts)) : null;
  return {
    email,
    greetingName: typeof raw.greetingName === "string" ? raw.greetingName : null,
    groupOverride,
    status,
    followUp: raw.followUp === true,
    followUpOn: typeof raw.followUpOn === "string" && raw.followUpOn ? raw.followUpOn : null,
    reason,
    feedback: typeof raw.feedback === "string" ? raw.feedback : "",
    featureRequest: typeof raw.featureRequest === "string" ? raw.featureRequest : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    category,
    markSent,
    claim: raw.claim === true,
    hadAccount: raw.hadAccount === true,
    parts,
  };
}

export async function saveOutreachCase(input: unknown): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Only owners and staff can update outreach." };
  const patch = readPatch(input);
  if (!patch) return { ok: false, error: "This outreach update is not valid." };

  try {
    const existing = await getOutreachCase(patch.email);
    const applied = applyOutreachPatch(existing, patch, actor, new Date());
    if (!applied.ok) return applied;
    const value = await upsertOutreachCase(applied.value);
    revalidatePath("/admin/outreach");
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this outreach case.";
    return { ok: false, error: message };
  }
}
