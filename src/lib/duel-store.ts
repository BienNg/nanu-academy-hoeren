import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import { scoreAttempt } from "@/lib/scoring";
import { getCefrLevels, getChapterClips, getLevelChapters } from "@/lib/levels";
import { normalizeProgress, type StoredProgress } from "@/lib/progress";
import { getSupabaseAdmin, readClassName } from "@/lib/progress-store";
import {
  dayKey,
  leaderboardClassKey,
  leaderboardDisplayName,
  weekKey,
} from "@/lib/xp";
import {
  DUEL_SIZE,
  MAX_ANSWER_CHARS,
  MAX_OPEN_WITH_CLASSMATE,
  awardForPoints,
  clipWinner,
  elapsedMsBetween,
  emptyDuelHome,
  extractStudiedClips,
  homeBucket,
  isDuelId,
  isDuelSchemaMissing,
  isSettledState,
  isTooFast,
  matchPool,
  pointsFromPlays,
  sampleItems,
  sharedStudied,
  studiedKey,
  type CatalogClip,
  type ClipPlay,
  type DuelCard,
  type DuelClipView,
  type DuelFeedback,
  type DuelHome,
  type DuelOutcome,
  type DuelView,
  type MatchBlock,
  type PlayState,
  type StudiedClip,
} from "@/lib/duels";

const STUDIED_TABLE = "studied_clips";
const DUELS_TABLE = "duels";
const CLIPS_TABLE = "duel_clips";
const PLAYS_TABLE = "duel_plays";
const XP_TABLE = "duel_xp_awards";
const PROFILES_TABLE = "user_progress";
const PAGE_SIZE = 1000;

type Profile = {
  userId: string;
  name: string | null;
  email: string | null;
  className: string | null;
  deleted: boolean;
};

type DuelRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  created_at: string;
  completed_at: string | null;
  challenger_points: number | null;
  opponent_points: number | null;
};

type ClipRow = {
  position: number;
  lesson_key: string;
  clip_id: string;
};

type PlayRow = {
  user_id: string;
  position: number;
  state: PlayState;
  page_session: string | null;
  started_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
};

type XpRow = {
  user_id: string;
  xp: number;
  outcome: DuelOutcome;
};

export type DuelActionResult =
  | { ok: true; view: DuelView; feedback: DuelFeedback | null }
  | { ok: false; status: number; error: string };

export type DuelCreateResult =
  | { ok: true; id: string }
  | { ok: false; block: MatchBlock };

let catalogCache: CatalogClip[] | null = null;

export function listCatalogClips(): CatalogClip[] {
  if (catalogCache) return catalogCache;
  const rows: CatalogClip[] = [];
  for (const level of getCefrLevels()) {
    for (const chapter of getLevelChapters(level.slug)) {
      let clips: ReturnType<typeof getChapterClips> = [];
      try {
        clips = getChapterClips(level.slug, chapter.slug);
      } catch {
        continue;
      }
      for (const clip of clips) {
        rows.push({
          lessonKey: `${level.slug}/${chapter.slug}`,
          chapterSlug: chapter.slug,
          clipId: clip.id,
          script: clip.script,
          audioPath: clip.audioPath,
        });
      }
    }
  }
  catalogCache = rows;
  return rows;
}

function catalogIndex(clips: readonly CatalogClip[]): Map<string, CatalogClip> {
  const map = new Map<string, CatalogClip>();
  for (const clip of clips) map.set(studiedKey(clip.lessonKey, clip.clipId), clip);
  return map;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

function asPlayState(value: unknown): PlayState | null {
  return value === "active" || value === "done" || value === "forfeited" ? value : null;
}

function asOutcome(value: unknown): DuelOutcome | null {
  return value === "win" || value === "loss" || value === "tie" ? value : null;
}

function logDuel(message: string): void {
  console.error("Supabase duel", message);
}

function schemaGone(message: string): boolean {
  if (!isDuelSchemaMissing(message)) {
    logDuel(message);
    return false;
  }
  return true;
}

/** Keep the studied-clip index aligned with one saved progress document. */
export async function syncStudiedClips(userId: string, progress: StoredProgress): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const clips = extractStudiedClips(progress.learn, listCatalogClips());
  await upsertStudied(supabase, [{ userId, clips }]);
}

async function upsertStudied(
  supabase: SupabaseClient,
  groups: readonly { userId: string; clips: readonly StudiedClip[] }[],
): Promise<boolean> {
  const rows = groups.flatMap((group) =>
    group.clips.map((clip) => ({
      user_id: group.userId,
      lesson_key: clip.lessonKey,
      clip_id: clip.clipId,
    })),
  );
  for (const page of chunks(rows, 400)) {
    if (page.length === 0) continue;
    const { error } = await supabase.from(STUDIED_TABLE).upsert(page, {
      onConflict: "user_id,lesson_key,clip_id",
      ignoreDuplicates: true,
    });
    if (error) {
      schemaGone(error.message);
      return false;
    }
  }
  return true;
}

async function listProfiles(supabase: SupabaseClient): Promise<Profile[] | null> {
  const rows: Profile[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select("user_id, name, email, class_name, deleted_at")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logDuel(error.message);
      return null;
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      name?: unknown;
      email?: unknown;
      class_name?: unknown;
      deleted_at?: unknown;
    }[];
    for (const row of page) {
      if (typeof row.user_id !== "string") continue;
      rows.push({
        userId: row.user_id,
        name: typeof row.name === "string" ? row.name : null,
        email: typeof row.email === "string" ? row.email : null,
        className: readClassName(row.class_name),
        deleted: typeof row.deleted_at === "string" && row.deleted_at.length > 0,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function readProgressMaps(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, StoredProgress>> {
  const maps = new Map<string, StoredProgress>();
  for (const page of chunks(userIds, 20)) {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select("user_id, data")
      .in("user_id", [...page]);
    if (error) {
      logDuel(error.message);
      continue;
    }
    for (const row of (data ?? []) as { user_id?: unknown; data?: unknown }[]) {
      if (typeof row.user_id !== "string") continue;
      maps.set(row.user_id, normalizeProgress(row.data as Partial<StoredProgress>));
    }
  }
  return maps;
}

async function readStudied(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, StudiedClip[]> | null> {
  const maps = new Map<string, StudiedClip[]>();
  for (const id of userIds) maps.set(id, []);
  for (const page of chunks(userIds, 50)) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(STUDIED_TABLE)
        .select("user_id, lesson_key, clip_id")
        .in("user_id", [...page])
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        if (schemaGone(error.message)) return null;
        return maps;
      }
      const rows = (data ?? []) as { user_id?: unknown; lesson_key?: unknown; clip_id?: unknown }[];
      for (const row of rows) {
        if (
          typeof row.user_id !== "string" ||
          typeof row.lesson_key !== "string" ||
          typeof row.clip_id !== "string"
        ) {
          continue;
        }
        const list = maps.get(row.user_id) ?? [];
        list.push({ lessonKey: row.lesson_key, clipId: row.clip_id });
        maps.set(row.user_id, list);
      }
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return maps;
}

async function refreshStudied(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, StudiedClip[]> | null> {
  const progress = await readProgressMaps(supabase, userIds);
  const catalog = listCatalogClips();
  const groups = [...progress.entries()].map(([userId, stored]) => ({
    userId,
    clips: extractStudiedClips(stored.learn, catalog),
  }));
  await upsertStudied(supabase, groups);
  return readStudied(supabase, userIds);
}

type ClassContext = {
  ready: boolean;
  block: MatchBlock;
  viewerIsAdmin: boolean;
  studiedCount: number;
  pool: string[];
  studied: Map<string, StudiedClip[]>;
  names: Map<string, string>;
};

async function loadClassContext(user: {
  id: string;
  email?: string | null;
}): Promise<ClassContext> {
  const empty: ClassContext = {
    ready: false,
    block: "unavailable",
    viewerIsAdmin: isAdminUser(user),
    studiedCount: 0,
    pool: [],
    studied: new Map(),
    names: new Map(),
  };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const profiles = await listProfiles(supabase);
  if (!profiles) return empty;
  const viewer = profiles.find((profile) => profile.userId === user.id && !profile.deleted);
  const viewerIsAdmin = isAdminUser({
    id: user.id,
    email: user.email ?? viewer?.email,
  });
  const names = new Map(
    profiles.map((profile) => [profile.userId, leaderboardDisplayName(profile.name)]),
  );
  const classKey = leaderboardClassKey(viewer?.className);
  const classmates = profiles.filter((profile) => {
    if (profile.deleted || profile.userId === user.id) return false;
    if (isAdminUser({ id: profile.userId, email: profile.email })) return false;
    return classKey.length > 0 && leaderboardClassKey(profile.className) === classKey;
  });

  const studied = await refreshStudied(supabase, [user.id, ...classmates.map((profile) => profile.userId)]);
  if (!studied) return { ...empty, viewerIsAdmin, names };
  const studiedCount = studied.get(user.id)?.length ?? 0;
  if (viewerIsAdmin) {
    return {
      ready: true,
      block: "admin",
      viewerIsAdmin,
      studiedCount,
      pool: [],
      studied,
      names,
    };
  }

  const openCounts = await openDuelsByOpponent(supabase, user.id);
  if (openCounts == null) return { ...empty, viewerIsAdmin, names };
  const mine = studied.get(user.id) ?? [];
  const candidates = classmates.map((profile) => ({
    userId: profile.userId,
    shared: sharedStudied(mine, studied.get(profile.userId) ?? []).length,
    openDuels: openCounts.get(profile.userId) ?? 0,
  }));
  const match = matchPool({ hasClass: classKey.length > 0, candidates });
  return {
    ready: true,
    block: match.block,
    viewerIsAdmin,
    studiedCount,
    pool: match.pool,
    studied,
    names,
  };
}

async function openDuelsByOpponent(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, number> | null> {
  const counts = new Map<string, number>();
  const rows = await viewerDuels(supabase, userId);
  if (!rows) return null;
  for (const duel of rows) {
    if (duel.completed_at) continue;
    const other = duel.challenger_id === userId ? duel.opponent_id : duel.challenger_id;
    counts.set(other, (counts.get(other) ?? 0) + 1);
  }
  return counts;
}

async function viewerDuels(supabase: SupabaseClient, userId: string): Promise<DuelRow[] | null> {
  const [asChallenger, asOpponent] = await Promise.all([
    supabase
      .from(DUELS_TABLE)
      .select("id, challenger_id, opponent_id, created_at, completed_at, challenger_points, opponent_points")
      .eq("challenger_id", userId),
    supabase
      .from(DUELS_TABLE)
      .select("id, challenger_id, opponent_id, created_at, completed_at, challenger_points, opponent_points")
      .eq("opponent_id", userId),
  ]);
  if (asChallenger.error) {
    schemaGone(asChallenger.error.message);
    return null;
  }
  if (asOpponent.error) {
    schemaGone(asOpponent.error.message);
    return null;
  }
  const seen = new Set<string>();
  const rows: DuelRow[] = [];
  for (const raw of [...(asChallenger.data ?? []), ...(asOpponent.data ?? [])]) {
    const duel = duelFromRow(raw);
    if (!duel || seen.has(duel.id)) continue;
    seen.add(duel.id);
    rows.push(duel);
  }
  return rows;
}

function duelFromRow(raw: unknown): DuelRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.challenger_id !== "string" ||
    typeof row.opponent_id !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    challenger_id: row.challenger_id,
    opponent_id: row.opponent_id,
    created_at: row.created_at,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    challenger_points: typeof row.challenger_points === "number" ? row.challenger_points : null,
    opponent_points: typeof row.opponent_points === "number" ? row.opponent_points : null,
  };
}

function playFromRow(raw: unknown): PlayRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const state = asPlayState(row.state);
  if (
    typeof row.user_id !== "string" ||
    typeof row.position !== "number" ||
    !state
  ) {
    return null;
  }
  return {
    user_id: row.user_id,
    position: row.position,
    state,
    page_session: typeof row.page_session === "string" ? row.page_session : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    finished_at: typeof row.finished_at === "string" ? row.finished_at : null,
    elapsed_ms: typeof row.elapsed_ms === "number" ? row.elapsed_ms : null,
  };
}

function clipFromRow(raw: unknown): ClipRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.position !== "number" ||
    typeof row.lesson_key !== "string" ||
    typeof row.clip_id !== "string"
  ) {
    return null;
  }
  return { position: row.position, lesson_key: row.lesson_key, clip_id: row.clip_id };
}

async function countOpenPair(
  supabase: SupabaseClient,
  leftId: string,
  rightId: string,
): Promise<number | null> {
  const [forward, backward] = await Promise.all([
    supabase
      .from(DUELS_TABLE)
      .select("id", { count: "exact", head: true })
      .is("completed_at", null)
      .eq("challenger_id", leftId)
      .eq("opponent_id", rightId),
    supabase
      .from(DUELS_TABLE)
      .select("id", { count: "exact", head: true })
      .is("completed_at", null)
      .eq("challenger_id", rightId)
      .eq("opponent_id", leftId),
  ]);
  if (forward.error || backward.error) {
    schemaGone(forward.error?.message ?? backward.error?.message ?? "");
    return null;
  }
  return (forward.count ?? 0) + (backward.count ?? 0);
}

export async function getDuelHome(user: {
  id: string;
  email?: string | null;
}): Promise<DuelHome> {
  const context = await loadClassContext(user);
  if (!context.ready) {
    return { ...emptyDuelHome(false), viewerIsAdmin: context.viewerIsAdmin };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyDuelHome(false);

  const duels = await viewerDuels(supabase, user.id);
  if (!duels) return { ...emptyDuelHome(false), viewerIsAdmin: context.viewerIsAdmin };

  const plays = await playsForDuels(
    supabase,
    duels.map((duel) => duel.id),
  );
  const awards = await awardsForDuels(
    supabase,
    duels.filter((duel) => duel.completed_at).map((duel) => duel.id),
  );
  const home = emptyDuelHome(true, context.block);
  home.studiedCount = context.studiedCount;
  home.viewerIsAdmin = context.viewerIsAdmin;

  const cards = duels
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map((duel) => toCard(duel, user.id, plays, awards, context.names));

  for (const card of cards) {
    const bucket = homeBucket({
      youStarted: card.youSettled > 0 || cardBucketStarted(card, duels, plays, user.id),
      youSettled: card.youSettled,
      opponentSettled: opponentSettledCount(card.id, user.id, duels, plays),
    });
    if (bucket === "incoming") home.incoming.push(card);
    else if (bucket === "playing") home.playing.push(card);
    else if (bucket === "waiting") home.waiting.push(card);
    else home.history.push(card);
  }
  home.history.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  home.history = home.history.slice(0, 40);
  return home;
}

function cardBucketStarted(
  card: DuelCard,
  duels: readonly DuelRow[],
  plays: readonly (PlayRow & { duel_id: string })[],
  userId: string,
): boolean {
  const duel = duels.find((item) => item.id === card.id);
  if (!duel) return false;
  return plays.some((play) => play.duel_id === card.id && play.user_id === userId);
}

function opponentSettledCount(
  duelId: string,
  userId: string,
  duels: readonly DuelRow[],
  plays: readonly (PlayRow & { duel_id: string })[],
): number {
  const duel = duels.find((item) => item.id === duelId);
  if (!duel) return 0;
  const opponentId = duel.challenger_id === userId ? duel.opponent_id : duel.challenger_id;
  return plays.filter(
    (play) => play.duel_id === duelId && play.user_id === opponentId && isSettledState(play.state),
  ).length;
}

function outcomeFromStored(duel: DuelRow, userId: string): DuelOutcome | null {
  if (duel.challenger_points == null || duel.opponent_points == null) return null;
  const yours = duel.challenger_id === userId ? duel.challenger_points : duel.opponent_points;
  const theirs = duel.challenger_id === userId ? duel.opponent_points : duel.challenger_points;
  return awardForPoints(yours, theirs).leftOutcome;
}

function toCard(
  duel: DuelRow,
  userId: string,
  plays: readonly (PlayRow & { duel_id: string })[],
  awards: readonly (XpRow & { duel_id: string })[],
  names: Map<string, string>,
): DuelCard {
  const opponentId = duel.challenger_id === userId ? duel.opponent_id : duel.challenger_id;
  const yours = plays.filter((play) => play.duel_id === duel.id && play.user_id === userId);
  const theirs = plays.filter((play) => play.duel_id === duel.id && play.user_id === opponentId);
  const youAreChallenger = duel.challenger_id === userId;
  const award = awards.find((item) => item.duel_id === duel.id && item.user_id === userId);
  return {
    id: duel.id,
    opponentName: names.get(opponentId) ?? "Học viên",
    createdAt: duel.completed_at ?? duel.created_at,
    challenged: !youAreChallenger && yours.length === 0,
    youSettled: yours.filter((play) => isSettledState(play.state)).length,
    opponentStarted: theirs.length > 0,
    yourOutcome: award?.outcome ?? outcomeFromStored(duel, userId),
    yourXp: award?.xp ?? null,
    yourPoints: youAreChallenger ? duel.challenger_points : duel.opponent_points,
    opponentPoints: youAreChallenger ? duel.opponent_points : duel.challenger_points,
  };
}

async function playsForDuels(
  supabase: SupabaseClient,
  duelIds: readonly string[],
): Promise<(PlayRow & { duel_id: string })[]> {
  const rows: (PlayRow & { duel_id: string })[] = [];
  for (const page of chunks(duelIds, 80)) {
    const { data, error } = await supabase
      .from(PLAYS_TABLE)
      .select("duel_id, user_id, position, state, page_session, started_at, finished_at, elapsed_ms")
      .in("duel_id", [...page]);
    if (error) {
      schemaGone(error.message);
      continue;
    }
    for (const raw of data ?? []) {
      const record = raw as { duel_id?: unknown };
      const play = playFromRow(raw);
      if (!play || typeof record.duel_id !== "string") continue;
      rows.push({ ...play, duel_id: record.duel_id });
    }
  }
  return rows;
}

async function awardsForDuels(
  supabase: SupabaseClient,
  duelIds: readonly string[],
): Promise<(XpRow & { duel_id: string })[]> {
  const rows: (XpRow & { duel_id: string })[] = [];
  for (const page of chunks(duelIds, 80)) {
    if (page.length === 0) continue;
    const { data, error } = await supabase
      .from(XP_TABLE)
      .select("duel_id, user_id, xp, outcome")
      .in("duel_id", [...page]);
    if (error) {
      schemaGone(error.message);
      continue;
    }
    for (const raw of (data ?? []) as {
      duel_id?: unknown;
      user_id?: unknown;
      xp?: unknown;
      outcome?: unknown;
    }[]) {
      const outcome = asOutcome(raw.outcome);
      if (typeof raw.duel_id !== "string" || typeof raw.user_id !== "string" || typeof raw.xp !== "number" || !outcome) {
        continue;
      }
      rows.push({ duel_id: raw.duel_id, user_id: raw.user_id, xp: raw.xp, outcome });
    }
  }
  return rows;
}

export async function createDuel(user: {
  id: string;
  email?: string | null;
}): Promise<DuelCreateResult> {
  const context = await loadClassContext(user);
  if (!context.ready) return { ok: false, block: "unavailable" };
  if (context.block !== "ok") return { ok: false, block: context.block };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, block: "unavailable" };
  const mine = context.studied.get(user.id) ?? [];
  const pool = [...context.pool];
  let blockedByCap = false;

  while (pool.length > 0) {
    const index = randomInt(pool.length);
    const opponentId = pool.splice(index, 1)[0];
    if (!opponentId) break;
    const open = await countOpenPair(supabase, user.id, opponentId);
    if (open == null) return { ok: false, block: "unavailable" };
    if (open >= MAX_OPEN_WITH_CLASSMATE) {
      blockedByCap = true;
      continue;
    }

    const shared = sharedStudied(mine, context.studied.get(opponentId) ?? []);
    if (shared.length < DUEL_SIZE) continue;
    const picked = sampleItems(shared, DUEL_SIZE, () => randomInt(1_000_000) / 1_000_000);
    const created = await supabase
      .from(DUELS_TABLE)
      .insert({ challenger_id: user.id, opponent_id: opponentId })
      .select("id")
      .single();
    if (created.error || !created.data) {
      if (created.error) schemaGone(created.error.message);
      return { ok: false, block: "unavailable" };
    }
    const duelId = (created.data as { id?: unknown }).id;
    if (typeof duelId !== "string") return { ok: false, block: "unavailable" };

    const clipInsert = await supabase.from(CLIPS_TABLE).insert(
      picked.map((clip, position) => ({
        duel_id: duelId,
        position,
        lesson_key: clip.lessonKey,
        clip_id: clip.clipId,
      })),
    );
    if (clipInsert.error) {
      schemaGone(clipInsert.error.message);
      await supabase.from(DUELS_TABLE).delete().eq("id", duelId);
      return { ok: false, block: "unavailable" };
    }

    const openAfter = await countOpenPair(supabase, user.id, opponentId);
    if (openAfter != null && openAfter > MAX_OPEN_WITH_CLASSMATE) {
      blockedByCap = true;
      await supabase.from(DUELS_TABLE).delete().eq("id", duelId);
      continue;
    }
    return { ok: true, id: duelId };
  }

  return { ok: false, block: blockedByCap ? "cap" : "no_overlap" };
}

export async function actOnDuel(input: {
  userId: string;
  duelId: string;
  action: "enter" | "answer" | "forfeit";
  pageSession: string;
  text?: string;
  now?: Date;
}): Promise<DuelActionResult> {
  if (!isDuelId(input.duelId) || !isDuelId(input.pageSession)) {
    return { ok: false, status: 400, error: "Invalid duel" };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, status: 503, error: "Unavailable" };
  const now = input.now ?? new Date();
  const duel = await readDuel(supabase, input.duelId);
  if (!duel) return { ok: false, status: 404, error: "Not found" };
  if (duel.challenger_id !== input.userId && duel.opponent_id !== input.userId) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (input.action === "enter") {
    await forfeitOtherSessions(supabase, input.duelId, input.userId, input.pageSession, now);
    await activateNext(supabase, input.duelId, input.userId, input.pageSession, now);
  } else if (input.action === "forfeit") {
    await forfeitSession(supabase, input.duelId, input.userId, input.pageSession, now);
  } else {
    const feedback = await acceptAnswer(supabase, duel, input.userId, input.text ?? "", now);
    await finalizeIfReady(supabase, input.duelId, now);
    const view = await readView(supabase, input.userId, input.duelId);
    if (!view) return { ok: false, status: 503, error: "Unavailable" };
    return { ok: true, view, feedback };
  }

  await finalizeIfReady(supabase, input.duelId, now);
  const view = await readView(supabase, input.userId, input.duelId);
  if (!view) return { ok: false, status: 503, error: "Unavailable" };
  return { ok: true, view, feedback: null };
}

async function readDuel(supabase: SupabaseClient, duelId: string): Promise<DuelRow | null> {
  const { data, error } = await supabase
    .from(DUELS_TABLE)
    .select("id, challenger_id, opponent_id, created_at, completed_at, challenger_points, opponent_points")
    .eq("id", duelId)
    .maybeSingle();
  if (error) {
    schemaGone(error.message);
    return null;
  }
  return duelFromRow(data);
}

async function readClips(supabase: SupabaseClient, duelId: string): Promise<ClipRow[]> {
  const { data, error } = await supabase
    .from(CLIPS_TABLE)
    .select("position, lesson_key, clip_id")
    .eq("duel_id", duelId)
    .order("position", { ascending: true });
  if (error) {
    schemaGone(error.message);
    return [];
  }
  return (data ?? []).flatMap((row) => {
    const clip = clipFromRow(row);
    return clip ? [clip] : [];
  });
}

async function readPlays(supabase: SupabaseClient, duelId: string): Promise<PlayRow[]> {
  const { data, error } = await supabase
    .from(PLAYS_TABLE)
    .select("user_id, position, state, page_session, started_at, finished_at, elapsed_ms")
    .eq("duel_id", duelId);
  if (error) {
    schemaGone(error.message);
    return [];
  }
  return (data ?? []).flatMap((row) => {
    const play = playFromRow(row);
    return play ? [play] : [];
  });
}

async function forfeitOtherSessions(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  pageSession: string,
  now: Date,
): Promise<void> {
  const finished = {
    state: "forfeited",
    finished_at: now.toISOString(),
    elapsed_ms: null,
    page_session: null,
  };
  const different = await supabase
    .from(PLAYS_TABLE)
    .update(finished)
    .eq("duel_id", duelId)
    .eq("user_id", userId)
    .eq("state", "active")
    .neq("page_session", pageSession);
  if (different.error) schemaGone(different.error.message);
  const missing = await supabase
    .from(PLAYS_TABLE)
    .update(finished)
    .eq("duel_id", duelId)
    .eq("user_id", userId)
    .eq("state", "active")
    .is("page_session", null);
  if (missing.error) schemaGone(missing.error.message);
}

async function forfeitSession(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  pageSession: string,
  now: Date,
): Promise<void> {
  const { error } = await supabase
    .from(PLAYS_TABLE)
    .update({
      state: "forfeited",
      finished_at: now.toISOString(),
      elapsed_ms: null,
      page_session: null,
    })
    .eq("duel_id", duelId)
    .eq("user_id", userId)
    .eq("state", "active")
    .eq("page_session", pageSession);
  if (error) schemaGone(error.message);
}

async function activateNext(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  pageSession: string,
  now: Date,
): Promise<void> {
  const catalog = catalogIndex(listCatalogClips());
  for (let guard = 0; guard < DUEL_SIZE; guard += 1) {
    const plays = await readPlays(supabase, duelId);
    const mine = plays.filter((play) => play.user_id === userId);
    const active = mine.find((play) => play.state === "active" && play.page_session === pageSession);
    if (active) return;
    const clips = await readClips(supabase, duelId);
    const taken = new Set(mine.map((play) => play.position));
    const next = clips.find((clip) => !taken.has(clip.position));
    if (!next) return;
    const known = catalog.get(studiedKey(next.lesson_key, next.clip_id));
    if (!known?.script || !known.audioPath) {
      await insertPlay(supabase, {
        duel_id: duelId,
        user_id: userId,
        position: next.position,
        state: "forfeited",
        page_session: null,
        started_at: null,
        finished_at: now.toISOString(),
        elapsed_ms: null,
      });
      continue;
    }
    const inserted = await insertPlay(supabase, {
      duel_id: duelId,
      user_id: userId,
      position: next.position,
      state: "active",
      page_session: pageSession,
      started_at: now.toISOString(),
      finished_at: null,
      elapsed_ms: null,
    });
    if (inserted === "active") return;
    if (inserted === "conflict") continue;
    return;
  }
}

async function insertPlay(
  supabase: SupabaseClient,
  row: {
    duel_id: string;
    user_id: string;
    position: number;
    state: PlayState;
    page_session: string | null;
    started_at: string | null;
    finished_at: string | null;
    elapsed_ms: number | null;
  },
): Promise<"active" | "conflict" | "error"> {
  const { error } = await supabase.from(PLAYS_TABLE).insert(row);
  if (!error) return row.state === "active" ? "active" : "conflict";
  if (error.code === "23505") return "conflict";
  schemaGone(error.message);
  return "error";
}

async function acceptAnswer(
  supabase: SupabaseClient,
  duel: DuelRow,
  userId: string,
  text: string,
  now: Date,
): Promise<DuelFeedback> {
  const empty: DuelFeedback = { accuracy: 0, accepted: false, tooFast: false, words: [] };
  const plays = await readPlays(supabase, duel.id);
  const active = plays.find((play) => play.user_id === userId && play.state === "active");
  if (!active?.started_at) return empty;
  const clips = await readClips(supabase, duel.id);
  const clip = clips.find((item) => item.position === active.position);
  if (!clip) return empty;
  const known = catalogIndex(listCatalogClips()).get(studiedKey(clip.lesson_key, clip.clip_id));
  if (!known?.script) {
    await forfeitPosition(supabase, duel.id, userId, active.position, now);
    return empty;
  }

  const typed = text.trim().slice(0, MAX_ANSWER_CHARS);
  const result = scoreAttempt(typed, known.script);
  const words = result.words.map((word) => ({
    word: word.word,
    status: word.status,
    ...(word.typed ? { typed: word.typed } : {}),
  }));
  if (result.accuracy !== 100) {
    return { accuracy: result.accuracy, accepted: false, tooFast: false, words };
  }

  const elapsed = elapsedMsBetween(active.started_at, now);
  if (elapsed == null) return { accuracy: 100, accepted: false, tooFast: false, words };
  if (isTooFast(elapsed)) {
    return { accuracy: 100, accepted: false, tooFast: true, words };
  }

  const { data, error } = await supabase
    .from(PLAYS_TABLE)
    .update({
      state: "done",
      finished_at: now.toISOString(),
      elapsed_ms: elapsed,
      page_session: null,
    })
    .eq("duel_id", duel.id)
    .eq("user_id", userId)
    .eq("position", active.position)
    .eq("state", "active")
    .select("position");
  if (error) {
    schemaGone(error.message);
    return { accuracy: 100, accepted: false, tooFast: false, words };
  }
  if (!data || data.length === 0) return empty;
  return { accuracy: 100, accepted: true, tooFast: false, words };
}

async function forfeitPosition(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  position: number,
  now: Date,
): Promise<void> {
  const { error } = await supabase
    .from(PLAYS_TABLE)
    .update({
      state: "forfeited",
      finished_at: now.toISOString(),
      elapsed_ms: null,
      page_session: null,
    })
    .eq("duel_id", duelId)
    .eq("user_id", userId)
    .eq("position", position)
    .eq("state", "active");
  if (error) schemaGone(error.message);
}

async function finalizeIfReady(supabase: SupabaseClient, duelId: string, now: Date): Promise<void> {
  const duel = await readDuel(supabase, duelId);
  if (!duel || duel.completed_at) return;
  const plays = await readPlays(supabase, duelId);
  const toPlay = (row: PlayRow): ClipPlay => ({
    position: row.position,
    state: row.state,
    elapsedMs: row.state === "done" ? row.elapsed_ms : null,
  });
  const score = pointsFromPlays(
    plays.filter((play) => play.user_id === duel.challenger_id).map(toPlay),
    plays.filter((play) => play.user_id === duel.opponent_id).map(toPlay),
  );
  if (!score.bothDone) return;
  const award = awardForPoints(score.left, score.right);
  const stamp = {
    week_key: weekKey(now),
    day_key: dayKey(now),
  };
  const { error } = await supabase.from(XP_TABLE).upsert(
    [
      {
        duel_id: duelId,
        user_id: duel.challenger_id,
        xp: award.leftXp,
        outcome: award.leftOutcome,
        ...stamp,
      },
      {
        duel_id: duelId,
        user_id: duel.opponent_id,
        xp: award.rightXp,
        outcome: award.rightOutcome,
        ...stamp,
      },
    ],
    { onConflict: "duel_id,user_id", ignoreDuplicates: true },
  );
  if (error) {
    schemaGone(error.message);
    return;
  }
  const updated = await supabase
    .from(DUELS_TABLE)
    .update({
      completed_at: now.toISOString(),
      challenger_points: score.left,
      opponent_points: score.right,
    })
    .eq("id", duelId)
    .is("completed_at", null);
  if (updated.error) schemaGone(updated.error.message);
}

async function readView(
  supabase: SupabaseClient,
  userId: string,
  duelId: string,
): Promise<DuelView | null> {
  const duel = await readDuel(supabase, duelId);
  if (!duel) return null;
  const [clips, plays, awards, names] = await Promise.all([
    readClips(supabase, duelId),
    readPlays(supabase, duelId),
    awardsForDuels(supabase, [duelId]),
    namesFor(supabase, [duel.challenger_id, duel.opponent_id]),
  ]);
  return buildView({
    duel,
    clips,
    plays,
    awards,
    userId,
    opponentName: names.get(duel.challenger_id === userId ? duel.opponent_id : duel.challenger_id) ?? "Học viên",
    catalog: catalogIndex(listCatalogClips()),
  });
}

async function namesFor(supabase: SupabaseClient, userIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("user_id, name")
    .in("user_id", [...userIds]);
  if (error) {
    logDuel(error.message);
    return names;
  }
  for (const row of (data ?? []) as { user_id?: unknown; name?: unknown }[]) {
    if (typeof row.user_id !== "string") continue;
    names.set(row.user_id, leaderboardDisplayName(typeof row.name === "string" ? row.name : null));
  }
  return names;
}

function buildView(input: {
  duel: DuelRow;
  clips: readonly ClipRow[];
  plays: readonly PlayRow[];
  awards: readonly (XpRow & { duel_id: string })[];
  userId: string;
  opponentName: string;
  catalog: Map<string, CatalogClip>;
}): DuelView {
  const opponentId =
    input.duel.challenger_id === input.userId ? input.duel.opponent_id : input.duel.challenger_id;
  const yours = input.plays.filter((play) => play.user_id === input.userId);
  const theirs = input.plays.filter((play) => play.user_id === opponentId);
  const yourByPosition = new Map(yours.map((play) => [play.position, play]));
  const theirByPosition = new Map(theirs.map((play) => [play.position, play]));
  let yourPoints = 0;
  let opponentPoints = 0;
  const clips = [...input.clips]
    .sort((left, right) => left.position - right.position)
    .map((clip): DuelClipView => {
      const you = yourByPosition.get(clip.position);
      const them = theirByPosition.get(clip.position);
      const youSettled = Boolean(you && isSettledState(you.state));
      const themSettled = Boolean(them && isSettledState(them.state));
      const known = input.catalog.get(studiedKey(clip.lesson_key, clip.clip_id));
      let winner: DuelClipView["winner"] = "pending";
      if (youSettled && themSettled && you && them) {
        const side = clipWinner(
          you.state === "done" ? you.elapsed_ms : null,
          them.state === "done" ? them.elapsed_ms : null,
        );
        if (side === "left") {
          winner = "you";
          yourPoints += 1;
        } else if (side === "right") {
          winner = "opponent";
          opponentPoints += 1;
        } else {
          winner = "neither";
        }
      }
      const active = you?.state === "active";
      const yourState: DuelClipView["you"]["state"] = you?.state ?? "pending";
      const theirState: DuelClipView["opponent"]["state"] = !youSettled
        ? "hidden"
        : them && isSettledState(them.state)
          ? them.state
          : "pending";
      return {
        position: clip.position,
        script: youSettled ? (known?.script ?? null) : null,
        audioPath: active ? (known?.audioPath ?? null) : null,
        you: {
          state: yourState,
          elapsedMs: you?.state === "done" ? you.elapsed_ms : null,
        },
        opponent: {
          state: theirState,
          elapsedMs: youSettled && them?.state === "done" ? them.elapsed_ms : null,
        },
        winner,
      };
    });

  const active = yours.find((play) => play.state === "active");
  const pending = clips.find((clip) => clip.you.state === "pending");
  const bothDone = clips.length >= DUEL_SIZE && clips.every((clip) => clip.winner !== "pending");
  const award = bothDone ? awardForPoints(yourPoints, opponentPoints) : null;
  const yourAward = input.awards.find((item) => item.user_id === input.userId);
  const theirAward = input.awards.find((item) => item.user_id === opponentId);

  return {
    id: input.duel.id,
    opponentName: input.opponentName,
    complete: Boolean(input.duel.completed_at) || bothDone,
    yourOutcome: yourAward?.outcome ?? award?.leftOutcome ?? null,
    yourXp: yourAward?.xp ?? (award ? award.leftXp : null),
    opponentXp: theirAward?.xp ?? (award ? award.rightXp : null),
    yourPoints,
    opponentPoints,
    nextPosition: active?.position ?? pending?.position ?? null,
    startedAt: active?.started_at ?? null,
    clips,
  };
}
