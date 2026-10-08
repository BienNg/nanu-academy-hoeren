import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  emptyOutreachCase,
  isOutreachGroup,
  isOutreachReason,
  isOutreachStatus,
  type OutreachCase,
} from "@/lib/outreach";

const TABLE = "outreach_cases";

const COLUMNS =
  "email, greeting_name, group_override, status, sent_at, owner_user_id, owner_name, follow_up, follow_up_on, reason, feedback, feature_request, notes, had_account_at_contact, parts_at_contact, updated_at";

type OutreachCaseRow = {
  email?: unknown;
  greeting_name?: unknown;
  group_override?: unknown;
  status?: unknown;
  sent_at?: unknown;
  owner_user_id?: unknown;
  owner_name?: unknown;
  follow_up?: unknown;
  follow_up_on?: unknown;
  reason?: unknown;
  feedback?: unknown;
  feature_request?: unknown;
  notes?: unknown;
  had_account_at_contact?: unknown;
  parts_at_contact?: unknown;
  updated_at?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function day(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

export function outreachCaseFromRow(row: OutreachCaseRow): OutreachCase | null {
  const email = text(row.email)?.toLowerCase() ?? "";
  if (!email) return null;
  const status = text(row.status);
  return {
    email,
    greetingName: text(row.greeting_name),
    groupOverride: (() => {
      const group = text(row.group_override);
      return group && isOutreachGroup(group) ? group : null;
    })(),
    status: status && isOutreachStatus(status) ? status : "chua_gui",
    sentAt: text(row.sent_at),
    ownerUserId: text(row.owner_user_id),
    ownerName: text(row.owner_name),
    followUp: row.follow_up === true,
    followUpOn: day(row.follow_up_on),
    reason: (() => {
      const reason = text(row.reason);
      return reason && isOutreachReason(reason) ? reason : null;
    })(),
    feedback: typeof row.feedback === "string" ? row.feedback : "",
    featureRequest: typeof row.feature_request === "string" ? row.feature_request : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    hadAccountAtContact:
      typeof row.had_account_at_contact === "boolean" ? row.had_account_at_contact : null,
    partsAtContact: typeof row.parts_at_contact === "number" ? row.parts_at_contact : null,
    updatedAt: text(row.updated_at),
  };
}

function rowFromCase(outreachCase: OutreachCase): Record<string, unknown> {
  return {
    email: outreachCase.email,
    greeting_name: outreachCase.greetingName,
    group_override: outreachCase.groupOverride,
    status: outreachCase.status,
    sent_at: outreachCase.sentAt,
    owner_user_id: outreachCase.ownerUserId,
    owner_name: outreachCase.ownerName,
    follow_up: outreachCase.followUp,
    follow_up_on: outreachCase.followUpOn,
    reason: outreachCase.reason,
    feedback: outreachCase.feedback,
    feature_request: outreachCase.featureRequest,
    notes: outreachCase.notes,
    had_account_at_contact: outreachCase.hadAccountAtContact,
    parts_at_contact: outreachCase.partsAtContact,
    updated_at: outreachCase.updatedAt ?? new Date().toISOString(),
  };
}

function missingTable(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

/** `null` means the table could not be read. */
export async function listOutreachCases(): Promise<OutreachCase[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .order("email", { ascending: true })
    .limit(5000);

  if (error) {
    if (!missingTable(error.message)) console.error("Supabase listOutreachCases", error.message);
    return null;
  }

  const cases: OutreachCase[] = [];
  for (const row of data ?? []) {
    const outreachCase = outreachCaseFromRow(row);
    if (outreachCase) cases.push(outreachCase);
  }
  return cases;
}

export async function getOutreachCase(email: string): Promise<OutreachCase | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("email", email)
    .maybeSingle();
  if (error) {
    if (missingTable(error.message)) {
      throw new Error("Outreach storage is not ready. Run supabase/outreach_cases.sql once.");
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return outreachCaseFromRow(data) ?? emptyOutreachCase(email);
}

export async function upsertOutreachCase(outreachCase: OutreachCase): Promise<OutreachCase> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress is not configured.");
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rowFromCase(outreachCase), { onConflict: "email" })
    .select(COLUMNS)
    .single();
  if (error) {
    if (missingTable(error.message)) {
      throw new Error("Outreach storage is not ready. Run supabase/outreach_cases.sql once.");
    }
    throw new Error(error.message);
  }
  return outreachCaseFromRow(data) ?? outreachCase;
}
