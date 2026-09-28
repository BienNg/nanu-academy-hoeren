import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import type { ListeningRunInput } from "@/lib/listening-runs";
import { getChapterClips } from "@/lib/levels";
import { listeningPartSize } from "@/lib/progress";
import { getSupabaseAdmin, readClassName } from "@/lib/progress-store";
import { isDuelSchemaMissing } from "@/lib/duels";
import {
  assembleLeaderboard,
  dayKey,
  decidePartXp,
  emptyLeaderboard,
  googleProfileImage,
  isXpSchemaMissing,
  leaderboardClassKey,
  leaderboardDisplayName,
  weekKey,
  type BoardPerson,
  type LeaderboardPayload,
  type LeaderboardRange,
  type LeaderboardScope,
} from "@/lib/xp";

const XP_TABLE = "xp_awards";
const DUEL_XP_TABLE = "duel_xp_awards";
const PROFILES_TABLE = "user_progress";
const PAGE_SIZE = 1000;

export type XpGrant = {
  ready: boolean;
  xp: number | null;
  kind: string | null;
};

function lessonClipsForXp(lessonKey: string): { id: string; script: string }[] {
  const slash = lessonKey.indexOf("/");
  if (slash <= 0) return [];
  try {
    return getChapterClips(lessonKey.slice(0, slash), lessonKey.slice(slash + 1)).map(
      (clip) => ({ id: clip.id, script: clip.script }),
    );
  } catch {
    return [];
  }
}

/**
 * Score one saved listening run and store ranked XP.
 * A missing xp_awards table leaves the run saved and reports ready: false.
 */
export async function grantXpForListeningRun(
  userId: string,
  input: ListeningRunInput,
  now = new Date(),
): Promise<XpGrant> {
  if (input.outcome === "fail") return { ready: true, xp: 0, kind: "fail" };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, xp: null, kind: null };

  const existing = await supabase
    .from(XP_TABLE)
    .select("xp, kind")
    .eq("run_id", input.id)
    .maybeSingle();
  if (existing.error) {
    if (!isXpSchemaMissing(existing.error.message)) {
      console.error("Supabase grantXp lookup", existing.error.message);
    }
    return { ready: false, xp: null, kind: null };
  }
  if (existing.data) {
    const row = existing.data as { xp?: unknown; kind?: unknown };
    return {
      ready: true,
      xp: typeof row.xp === "number" ? row.xp : 0,
      kind: typeof row.kind === "string" ? row.kind : null,
    };
  }

  const prior = await supabase
    .from(XP_TABLE)
    .select("day_key")
    .eq("user_id", userId)
    .eq("lesson_key", input.lessonKey)
    .eq("part_number", input.partNumber);
  if (prior.error) {
    if (!isXpSchemaMissing(prior.error.message)) {
      console.error("Supabase grantXp prior", prior.error.message);
    }
    return { ready: false, xp: null, kind: null };
  }

  const priorDayKeys = ((prior.data ?? []) as { day_key?: unknown }[]).flatMap((row) =>
    typeof row.day_key === "string" ? [row.day_key] : [],
  );
  const today = dayKey(now);
  let reviewXpToday = 0;
  if (!priorDayKeys.includes(today)) {
    const reviews = await supabase
      .from(XP_TABLE)
      .select("xp")
      .eq("user_id", userId)
      .eq("day_key", today)
      .eq("kind", "review");
    if (reviews.error) {
      if (!isXpSchemaMissing(reviews.error.message)) {
        console.error("Supabase grantXp reviews", reviews.error.message);
      }
      return { ready: false, xp: null, kind: null };
    }
    reviewXpToday = ((reviews.data ?? []) as { xp?: unknown }[]).reduce(
      (sum, row) => sum + (typeof row.xp === "number" ? row.xp : 0),
      0,
    );
  }

  const lessonClips = lessonClipsForXp(input.lessonKey);
  const slash = input.lessonKey.indexOf("/");
  const decision = decidePartXp({
    levelSlug: slash > 0 ? input.lessonKey.slice(0, slash) : "",
    outcome: input.outcome,
    elapsedMs: input.elapsedMs,
    expectedCount: listeningPartSize(lessonClips.length, input.partNumber, input.partCount),
    results: input.clips,
    lessonClips,
    priorDayKeys,
    reviewXpToday,
    now,
  });
  if (!decision.store) return { ready: true, xp: decision.xp, kind: decision.kind };

  const { error } = await supabase.from(XP_TABLE).insert({
    run_id: input.id,
    user_id: userId,
    lesson_key: input.lessonKey,
    part_number: input.partNumber,
    xp: decision.xp,
    kind: decision.kind,
    week_key: decision.weekKey,
    day_key: decision.dayKey,
  });
  if (!error) return { ready: true, xp: decision.xp, kind: decision.kind };

  if (error.code === "23505") {
    const raced = await supabase
      .from(XP_TABLE)
      .select("xp, kind")
      .eq("run_id", input.id)
      .maybeSingle();
    if (raced.data) {
      const row = raced.data as { xp?: unknown; kind?: unknown };
      return {
        ready: true,
        xp: typeof row.xp === "number" ? row.xp : 0,
        kind: typeof row.kind === "string" ? row.kind : "repeat",
      };
    }
    return { ready: true, xp: 0, kind: "repeat" };
  }
  if (!isXpSchemaMissing(error.message)) {
    console.error("Supabase grantXp insert", error.message);
  }
  return { ready: false, xp: null, kind: null };
}

export type UserXpTotals = {
  ready: boolean;
  today: number;
  week: number;
  total: number;
};

export async function getUserXpTotals(userId: string, now = new Date()): Promise<UserXpTotals> {
  const empty: UserXpTotals = { ready: false, today: 0, week: 0, total: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const rows: { xp: number; day_key: string; week_key: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(XP_TABLE)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isXpSchemaMissing(error.message)) {
        console.error("Supabase getUserXpTotals", error.message);
      }
      return empty;
    }
    const page = (data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[];
    for (const row of page) {
      if (typeof row.xp !== "number" || typeof row.day_key !== "string" || typeof row.week_key !== "string") {
        continue;
      }
      rows.push({ xp: row.xp, day_key: row.day_key, week_key: row.week_key });
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const duelRows = await listUserDuelXp(supabase, userId);
  const todayKey = dayKey(now);
  const currentWeek = weekKey(now);
  let today = 0;
  let week = 0;
  let total = 0;
  for (const row of rows) {
    total += row.xp;
    if (row.day_key === todayKey) today += row.xp;
    if (row.week_key === currentWeek) week += row.xp;
  }
  for (const row of duelRows) {
    total += row.xp;
    if (row.day_key === todayKey) today += row.xp;
    if (row.week_key === currentWeek) week += row.xp;
  }
  return { ready: true, today, week, total };
}

type XpAwardSumRow = {
  user_id: string;
  xp: number;
  created_at: string;
};

type DuelAwardRow = XpAwardSumRow & {
  outcome: "win" | "loss" | "tie";
  day_key: string;
  week_key: string;
};

async function listUserDuelXp(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ xp: number; day_key: string; week_key: string }[]> {
  const rows: { xp: number; day_key: string; week_key: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(DUEL_XP_TABLE)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isDuelSchemaMissing(error.message)) {
        console.error("Supabase listUserDuelXp", error.message);
      }
      return rows;
    }
    const page = (data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[];
    for (const row of page) {
      if (typeof row.xp !== "number" || typeof row.day_key !== "string" || typeof row.week_key !== "string") {
        continue;
      }
      rows.push({ xp: row.xp, day_key: row.day_key, week_key: row.week_key });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listDuelXpRows(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<DuelAwardRow[] | "missing"> {
  const rows: DuelAwardRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(DUEL_XP_TABLE)
      .select("user_id, xp, outcome, created_at, day_key, week_key")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (isDuelSchemaMissing(error.message)) return "missing";
      console.error("Supabase listDuelXpRows", error.message);
      return rows;
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      xp?: unknown;
      outcome?: unknown;
      created_at?: unknown;
      day_key?: unknown;
      week_key?: unknown;
    }[];
    for (const row of page) {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.created_at !== "string" ||
        typeof row.day_key !== "string" ||
        typeof row.week_key !== "string" ||
        (row.outcome !== "win" && row.outcome !== "loss" && row.outcome !== "tie")
      ) {
        continue;
      }
      rows.push({
        user_id: row.user_id,
        xp: row.xp,
        outcome: row.outcome,
        created_at: row.created_at,
        day_key: row.day_key,
        week_key: row.week_key,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listXpAwardRows(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<XpAwardSumRow[] | null> {
  const rows: XpAwardSumRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(XP_TABLE)
      .select("user_id, xp, created_at")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (!isXpSchemaMissing(error.message)) {
        console.error("Supabase listXpAwardRows", error.message);
      }
      return null;
    }
    const page = (data ?? []) as { user_id?: unknown; xp?: unknown; created_at?: unknown }[];
    for (const row of page) {
      if (typeof row.user_id !== "string" || typeof row.xp !== "number" || typeof row.created_at !== "string") {
        continue;
      }
      rows.push({ user_id: row.user_id, xp: row.xp, created_at: row.created_at });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

type BoardProfileRow = {
  user_id: string;
  name?: string | null;
  email?: string | null;
  class_name?: unknown;
  deleted_at?: string | null;
  image?: string | null;
};

function boardImage(
  row: BoardProfileRow,
  viewerId: string,
  viewerImage: string | null | undefined,
): string | null {
  return (
    googleProfileImage(row.image) ??
    (row.user_id === viewerId ? googleProfileImage(viewerImage) : null)
  );
}

async function listBoardProfiles(supabase: SupabaseClient): Promise<BoardProfileRow[]> {
  const columnSets = [
    "user_id, name, email, class_name, deleted_at, image",
    "user_id, name, email, class_name, deleted_at",
    "user_id, name, email, deleted_at",
  ];
  for (const columns of columnSets) {
    const rows: BoardProfileRow[] = [];
    let from = 0;
    let failed = false;
    for (;;) {
      const { data, error } = await supabase
        .from(PROFILES_TABLE)
        .select(columns)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        failed = true;
        break;
      }
      const page = (data ?? []) as unknown as BoardProfileRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows.filter((row) => !row.deleted_at);
      from += PAGE_SIZE;
    }
    if (!failed) return rows.filter((row) => !row.deleted_at);
  }
  console.error("Supabase listBoardProfiles", "every column set failed");
  return [];
}

export async function getLeaderboard(input: {
  viewerId: string;
  viewerImage?: string | null;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now?: Date;
}): Promise<LeaderboardPayload> {
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return blank;

  const awards = await listXpAwardRows(supabase, input.range, now);
  if (!awards) return blank;

  const totals = new Map<string, { xp: number; reachedAt: string | null }>();
  for (const award of awards) {
    if (award.xp <= 0) continue;
    const current = totals.get(award.user_id) ?? { xp: 0, reachedAt: null };
    current.xp += award.xp;
    if (!current.reachedAt || award.created_at > current.reachedAt) {
      current.reachedAt = award.created_at;
    }
    totals.set(award.user_id, current);
  }

  const duelAwards = await listDuelXpRows(supabase, input.range, now);
  if (duelAwards !== "missing") {
    for (const award of duelAwards) {
      if (award.xp <= 0) continue;
      const current = totals.get(award.user_id) ?? { xp: 0, reachedAt: null };
      current.xp += award.xp;
      if (!current.reachedAt || award.created_at > current.reachedAt) {
        current.reachedAt = award.created_at;
      }
      totals.set(award.user_id, current);
    }
  }

  const profiles = await listBoardProfiles(supabase);
  const people: BoardPerson[] = profiles.map((row) => {
    const total = totals.get(row.user_id);
    const className = readClassName(row.class_name);
    return {
      userId: row.user_id,
      name: leaderboardDisplayName(row.name),
      classKey: leaderboardClassKey(className),
      className,
      isAdmin: isAdminUser({
        id: row.user_id,
        email: typeof row.email === "string" ? row.email : null,
      }),
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      image: boardImage(row, input.viewerId, input.viewerImage),
    };
  });
  if (!people.some((person) => person.userId === input.viewerId)) {
    const total = totals.get(input.viewerId);
    people.push({
      userId: input.viewerId,
      name: "Học viên",
      classKey: "",
      className: null,
      isAdmin: false,
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      image: googleProfileImage(input.viewerImage),
    });
  }

  return assembleLeaderboard({
    people,
    viewerId: input.viewerId,
    scope: input.scope,
    range: input.range,
    now,
  });
}

export async function getDuelLeaderboard(input: {
  viewerId: string;
  viewerImage?: string | null;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now?: Date;
}): Promise<LeaderboardPayload> {
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
    board: "duel",
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return blank;

  const awards = await listDuelXpRows(supabase, input.range, now);
  if (awards === "missing") return blank;

  const totals = new Map<
    string,
    { xp: number; reachedAt: string | null; won: number; tied: number; lost: number }
  >();
  for (const award of awards) {
    const current = totals.get(award.user_id) ?? {
      xp: 0,
      reachedAt: null,
      won: 0,
      tied: 0,
      lost: 0,
    };
    current.xp += award.xp;
    if (award.outcome === "win") current.won += 1;
    if (award.outcome === "tie") current.tied += 1;
    if (award.outcome === "loss") current.lost += 1;
    if (!current.reachedAt || award.created_at > current.reachedAt) {
      current.reachedAt = award.created_at;
    }
    totals.set(award.user_id, current);
  }

  const profiles = await listBoardProfiles(supabase);
  const people: BoardPerson[] = profiles.map((row) => {
    const total = totals.get(row.user_id);
    const className = readClassName(row.class_name);
    return {
      userId: row.user_id,
      name: leaderboardDisplayName(row.name),
      classKey: leaderboardClassKey(className),
      className,
      isAdmin: isAdminUser({
        id: row.user_id,
        email: typeof row.email === "string" ? row.email : null,
      }),
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      won: total?.won ?? 0,
      tied: total?.tied ?? 0,
      lost: total?.lost ?? 0,
      image: boardImage(row, input.viewerId, input.viewerImage),
    };
  });
  if (!people.some((person) => person.userId === input.viewerId)) {
    const total = totals.get(input.viewerId);
    people.push({
      userId: input.viewerId,
      name: "Học viên",
      classKey: "",
      className: null,
      isAdmin: false,
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      won: total?.won ?? 0,
      tied: total?.tied ?? 0,
      lost: total?.lost ?? 0,
      image: googleProfileImage(input.viewerImage),
    });
  }

  return assembleLeaderboard({
    people,
    viewerId: input.viewerId,
    scope: input.scope,
    range: input.range,
    now,
    board: "duel",
  });
}

export type AdminListeningXpRow = {
  userId: string;
  xp: number;
  kind: "new" | "review";
  lessonKey: string;
  dayKey: string;
};

export type AdminDuelXpRow = {
  userId: string;
  xp: number;
  dayKey: string;
};

export type AdminXpRead<T> = {
  ready: boolean;
  rows: T[];
};

async function listPagedXpRows<T>(
  table: string,
  columns: string,
  fromDay: string,
  toDay: string,
  parse: (row: Record<string, unknown>) => T | null,
  onMissing: (message: string) => boolean,
  logLabel: string,
): Promise<AdminXpRead<T>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, rows: [] };

  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte("day_key", fromDay)
      .lte("day_key", toDay)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!onMissing(error.message)) {
        console.error(logLabel, error.message);
      }
      return { ready: false, rows: [] };
    }
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of page) {
      const parsed = parse(row);
      if (parsed) rows.push(parsed);
    }
    if (page.length < PAGE_SIZE) return { ready: true, rows };
    from += PAGE_SIZE;
  }
}

/** Listening XP awarded in `[fromDay, toDay]` Vietnam calendar days. */
export function listAdminListeningXp(
  fromDay: string,
  toDay: string,
): Promise<AdminXpRead<AdminListeningXpRow>> {
  return listPagedXpRows(
    XP_TABLE,
    "user_id, xp, kind, lesson_key, day_key",
    fromDay,
    toDay,
    (row) => {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.lesson_key !== "string" ||
        typeof row.day_key !== "string" ||
        (row.kind !== "new" && row.kind !== "review")
      ) {
        return null;
      }
      return {
        userId: row.user_id,
        xp: row.xp,
        kind: row.kind,
        lessonKey: row.lesson_key,
        dayKey: row.day_key,
      };
    },
    isXpSchemaMissing,
    "Supabase listAdminListeningXp",
  );
}

/** Duel XP awarded in `[fromDay, toDay]` Vietnam calendar days. */
export function listAdminDuelXp(
  fromDay: string,
  toDay: string,
): Promise<AdminXpRead<AdminDuelXpRow>> {
  return listPagedXpRows(
    DUEL_XP_TABLE,
    "user_id, xp, day_key",
    fromDay,
    toDay,
    (row) => {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.day_key !== "string"
      ) {
        return null;
      }
      return { userId: row.user_id, xp: row.xp, dayKey: row.day_key };
    },
    isDuelSchemaMissing,
    "Supabase listAdminDuelXp",
  );
}
