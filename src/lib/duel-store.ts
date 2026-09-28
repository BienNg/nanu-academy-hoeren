import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import { scoreAttempt } from "@/lib/scoring";
import { checkOrder } from "@/lib/sentence-order";
import { getCefrLevels, getChapterClips, getLevelChapters } from "@/lib/levels";
import {
  firstUnlockedStudyHref,
  normalizeProgress,
  type StoredProgress,
  type StudyUnlockLevel,
} from "@/lib/progress";
import {
  getSupabaseAdmin,
  getUserLevelAccess,
  readClassName,
  withoutInterviewAccess,
} from "@/lib/progress-store";
import {
  dayKey,
  leaderboardClassKey,
  leaderboardDisplayName,
  weekKey,
} from "@/lib/xp";
import {
  DUEL_EXPIRE_CHALLENGER_XP,
  DUEL_EXPIRE_OPPONENT_XP,
  DUEL_SIZE,
  duelCardsFromClips,
  MAX_ANSWER_CHARS,
  MAX_OPEN_WITH_CLASSMATE,
  awardForPoints,
  challengeExpiresAt,
  challengeReleasedAt,
  clipWinner,
  emptyDuelHome,
  extractStudiedClips,
  homeBucket,
  isChallengeExpired,
  isDuelId,
  isDuelSchemaMissing,
  isSettledState,
  matchPool,
  opponentCanSeeDuel,
  pointsFromPlays,
  sampleItems,
  sharedStudied,
  studiedKey,
  type CatalogClip,
  type ClipPlay,
  type DuelCard,
  type DuelCardKind,
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
const DUEL_COLUMNS_BASE =
  "id, challenger_id, opponent_id, created_at, completed_at, challenger_points, opponent_points";
const DUEL_COLUMNS = `${DUEL_COLUMNS_BASE}, expired`;
/** While this is in the future, reads omit `expired` because that column is not in the database yet. */
let skipExpiredColumnUntil = 0;
let loggedMissingExpiredColumn = false;
let skipKindColumnUntil = 0;
let loggedMissingKindColumn = false;

function missingExpiredColumn(message: string): boolean {
  return /expired/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function rememberMissingExpiredColumn(): void {
  skipExpiredColumnUntil = Date.now() + 5 * 60 * 1000;
  if (loggedMissingExpiredColumn) return;
  loggedMissingExpiredColumn = true;
  console.error(
    "Supabase duel",
    "Run the new statements at the bottom of supabase/duels.sql so a challenge can close after 3 days.",
  );
}

function missingKindColumn(message: string): boolean {
  return /kind/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function rememberMissingKindColumn(): void {
  skipKindColumnUntil = Date.now() + 5 * 60 * 1000;
  if (loggedMissingKindColumn) return;
  loggedMissingKindColumn = true;
  console.error(
    "Supabase duel",
    "Run the new statements at the bottom of supabase/duels.sql so a duel can store sentence-order cards.",
  );
}

function duelColumns(): string {
  return Date.now() < skipExpiredColumnUntil ? DUEL_COLUMNS_BASE : DUEL_COLUMNS;
}
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
  expired: boolean;
};

type ClipRow = {
  position: number;
  lesson_key: string;
  clip_id: string;
  kind: DuelCardKind;
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
          translationVi: clip.translationVi,
          sentenceOrder: clip.sentenceOrder === true,
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
): Promise<{
  studied: Map<string, StudiedClip[]> | null;
  progress: Map<string, StoredProgress>;
}> {
  const progress = await readProgressMaps(supabase, userIds);
  const catalog = listCatalogClips();
  const groups = [...progress.entries()].map(([userId, stored]) => ({
    userId,
    clips: extractStudiedClips(stored.learn, catalog),
  }));
  await upsertStudied(supabase, groups);
  return { studied: await readStudied(supabase, userIds), progress };
}

type ClassContext = {
  ready: boolean;
  block: MatchBlock;
  viewerIsAdmin: boolean;
  studiedCount: number;
  pool: string[];
  studied: Map<string, StudiedClip[]>;
  names: Map<string, string>;
  viewerProgress: StoredProgress;
};

function studyUnlockLevels(): StudyUnlockLevel[] {
  const counts = new Map<string, number>();
  for (const clip of listCatalogClips()) {
    counts.set(clip.lessonKey, (counts.get(clip.lessonKey) ?? 0) + 1);
  }
  return getCefrLevels().map((level) => ({
    slug: level.slug,
    chapters: getLevelChapters(level.slug).map((chapter) => ({
      slug: chapter.slug,
      clipCount: counts.get(`${level.slug}/${chapter.slug}`) ?? 0,
    })),
  }));
}

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
    viewerProgress: normalizeProgress(undefined),
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

  const refreshed = await refreshStudied(supabase, [
    user.id,
    ...classmates.map((profile) => profile.userId),
  ]);
  const viewerProgress = refreshed.progress.get(user.id) ?? normalizeProgress(undefined);
  const studied = refreshed.studied;
  if (!studied) return { ...empty, viewerIsAdmin, names, viewerProgress };
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
      viewerProgress,
    };
  }

  const openCounts = await openDuelsByOpponent(supabase, user.id);
  if (openCounts == null) return { ...empty, viewerIsAdmin, names, viewerProgress };
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
    viewerProgress,
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
  const load = (columns: string) =>
    Promise.all([
      supabase.from(DUELS_TABLE).select(columns).eq("challenger_id", userId),
      supabase.from(DUELS_TABLE).select(columns).eq("opponent_id", userId),
    ]);
  let [asChallenger, asOpponent] = await load(duelColumns());
  const firstError = asChallenger.error?.message ?? asOpponent.error?.message;
  if (firstError && missingExpiredColumn(firstError)) {
    rememberMissingExpiredColumn();
    [asChallenger, asOpponent] = await load(DUEL_COLUMNS_BASE);
  }
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
    expired: row.expired === true,
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
  const kind = row.kind === "order" ? "order" : "listening";
  return { position: row.position, lesson_key: row.lesson_key, clip_id: row.clip_id, kind };
}

async function insertDuelClips(
  supabase: SupabaseClient,
  duelId: string,
  cards: readonly { clip: { lessonKey: string; clipId: string }; kind: DuelCardKind }[],
): Promise<"ok" | "unavailable"> {
  const base = cards.map(({ clip }, position) => ({
    duel_id: duelId,
    position,
    lesson_key: clip.lessonKey,
    clip_id: clip.clipId,
  }));
  const withKind = cards.map(({ clip, kind }, position) => ({
    duel_id: duelId,
    position,
    lesson_key: clip.lessonKey,
    clip_id: clip.clipId,
    kind,
  }));
  const includeKind = Date.now() >= skipKindColumnUntil;
  const inserted = await supabase.from(CLIPS_TABLE).insert(includeKind ? withKind : base);
  if (!inserted.error) return "ok";
  if (missingKindColumn(inserted.error.message) && includeKind) {
    rememberMissingKindColumn();
    const retry = await supabase.from(CLIPS_TABLE).insert(base);
    if (!retry.error) return "ok";
    schemaGone(retry.error.message);
    return "unavailable";
  }
  schemaGone(inserted.error.message);
  return "unavailable";
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
  const prepared = getSupabaseAdmin();
  if (prepared) {
    const open = await viewerDuels(prepared, user.id);
    if (open) await expireOverdueDuels(prepared, open, new Date());
  }
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
  if (!context.viewerIsAdmin && context.studiedCount < DUEL_SIZE) {
    const access = withoutInterviewAccess(await getUserLevelAccess(user.id));
    home.studyHref = firstUnlockedStudyHref(
      context.viewerProgress,
      studyUnlockLevels(),
      access,
    );
  }

  const cards = duels
    .filter((duel) =>
      opponentCanSeeDuel(
        duel.opponent_id === user.id,
        settledFor(plays, duel.id, duel.challenger_id),
      ),
    )
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map((duel) => toCard(duel, user.id, plays, awards, context.names));

  for (const card of cards) {
    const duel = duels.find((item) => item.id === card.id);
    const bucket = homeBucket({
      finished: Boolean(duel?.completed_at),
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

function settledFor(
  plays: readonly (PlayRow & { duel_id: string })[],
  duelId: string,
  userId: string,
): number {
  return plays.filter(
    (play) => play.duel_id === duelId && play.user_id === userId && isSettledState(play.state),
  ).length;
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
  if (duel.expired) return duel.challenger_id === userId ? "win" : "loss";
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
  const live = pointsFromPlays(
    yours.map((play) => ({
      position: play.position,
      state: play.state,
      elapsedMs: play.state === "done" ? play.elapsed_ms : null,
    })),
    theirs.map((play) => ({
      position: play.position,
      state: play.state,
      elapsedMs: play.state === "done" ? play.elapsed_ms : null,
    })),
  );
  const storedYours = youAreChallenger ? duel.challenger_points : duel.opponent_points;
  const storedTheirs = youAreChallenger ? duel.opponent_points : duel.challenger_points;
  const challengerPlays = youAreChallenger ? yours : theirs;
  return {
    id: duel.id,
    yourName: names.get(userId) ?? "Bạn",
    opponentName: names.get(opponentId) ?? "Học viên",
    createdAt: duel.completed_at ?? duel.created_at,
    challenged: !youAreChallenger && yours.length === 0,
    youSettled: yours.filter((play) => isSettledState(play.state)).length,
    opponentStarted: theirs.length > 0,
    yourOutcome: award?.outcome ?? outcomeFromStored(duel, userId),
    yourXp:
      award?.xp ??
      (duel.expired ? (youAreChallenger ? DUEL_EXPIRE_CHALLENGER_XP : DUEL_EXPIRE_OPPONENT_XP) : null),
    yourPoints: duel.expired ? null : (storedYours ?? live.left),
    opponentPoints: duel.expired ? null : (storedTheirs ?? live.right),
    expired: duel.expired,
    expiresAt: duel.completed_at
      ? null
      : challengeExpiresAt(
          challengeReleasedAt(
            challengerPlays.map((play) => ({ state: play.state, finishedAt: play.finished_at })),
          ),
        ),
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
  const prepared = getSupabaseAdmin();
  if (prepared) {
    const open = await viewerDuels(prepared, user.id);
    if (open) await expireOverdueDuels(prepared, open, new Date());
  }
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
    const catalog = catalogIndex(listCatalogClips());
    const cards = duelCardsFromClips(
      picked.map((clip) => {
        const known = catalog.get(studiedKey(clip.lessonKey, clip.clipId));
        return { ...clip, sentenceOrder: known?.sentenceOrder === true };
      }),
    );
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

    const clipInsert = await insertDuelClips(supabase, duelId, cards);
    if (clipInsert === "unavailable") {
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

/** Challenges the viewer has been sent and has not opened yet. */
export async function countUnstartedChallenges(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const load = (columns: string) =>
    Promise.all([
      supabase.from(DUELS_TABLE).select(columns).eq("challenger_id", userId).is("completed_at", null),
      supabase.from(DUELS_TABLE).select(columns).eq("opponent_id", userId).is("completed_at", null),
    ]);
  let [asChallenger, asOpponent] = await load(duelColumns());
  const firstError = asChallenger.error?.message ?? asOpponent.error?.message;
  if (firstError && missingExpiredColumn(firstError)) {
    rememberMissingExpiredColumn();
    [asChallenger, asOpponent] = await load(DUEL_COLUMNS_BASE);
  }
  if (asChallenger.error || asOpponent.error) {
    schemaGone(asChallenger.error?.message ?? asOpponent.error?.message ?? "");
    return 0;
  }
  const duels = [...(asChallenger.data ?? []), ...(asOpponent.data ?? [])].flatMap((row) => {
    const duel = duelFromRow(row);
    return duel ? [duel] : [];
  });
  if (duels.length === 0) return 0;
  const now = new Date();
  const expired = await expireOverdueDuels(supabase, duels, now);
  const plays = await playsForDuels(
    supabase,
    duels.map((duel) => duel.id),
  );
  return duels.filter((duel) => {
    if (duel.opponent_id !== userId || expired.has(duel.id)) return false;
    const released = opponentCanSeeDuel(true, settledFor(plays, duel.id, duel.challenger_id));
    const started = plays.some((play) => play.duel_id === duel.id && play.user_id === userId);
    return released && !started;
  }).length;
}

export async function actOnDuel(input: {
  userId: string;
  duelId: string;
  action: "open" | "begin" | "settle" | "forfeit";
  pageSession: string;
  text?: string;
  position?: number | null;
  elapsedMs?: number | null;
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
  if (duel.opponent_id === input.userId) {
    const plays = await readPlays(supabase, input.duelId);
    const challengerSettled = plays.filter(
      (play) => play.user_id === duel.challenger_id && isSettledState(play.state),
    ).length;
    if (!opponentCanSeeDuel(true, challengerSettled)) {
      return { ok: false, status: 404, error: "Not found" };
    }
  }

  await expireOverdueDuels(supabase, [duel], now);
  const current = (await readDuel(supabase, input.duelId)) ?? duel;
  if (current.completed_at) {
    const finished = await readView(supabase, input.userId, input.duelId);
    if (!finished) return { ok: false, status: 503, error: "Unavailable" };
    return { ok: true, view: finished, feedback: null };
  }

  if (input.action === "open") {
    await forfeitOtherSessions(supabase, input.duelId, input.userId, input.pageSession, now);
    await skipMissingClips(supabase, input.duelId, input.userId, now);
  } else if (input.action === "begin") {
    if (!isClipPosition(input.position)) return { ok: false, status: 400, error: "Invalid clip" };
    await beginClip(supabase, input.duelId, input.userId, input.position, input.pageSession, now);
  } else if (input.action === "forfeit") {
    if (isClipPosition(input.position)) {
      await forfeitClip(supabase, input.duelId, input.userId, input.position, now);
    } else {
      await forfeitSession(supabase, input.duelId, input.userId, input.pageSession, now);
    }
  } else {
    if (!isClipPosition(input.position)) return { ok: false, status: 400, error: "Invalid clip" };
    const feedback = await settleClip(
      supabase,
      input.duelId,
      input.userId,
      input.position,
      input.text ?? "",
      input.elapsedMs,
      now,
    );
    await finalizeIfReady(supabase, input.duelId, now);
    const view = await readView(supabase, input.userId, input.duelId);
    if (!view) return { ok: false, status: 503, error: "Unavailable" };
    return { ok: true, view, feedback };
  }

  if (input.action === "forfeit" || input.action === "open") {
    await finalizeIfReady(supabase, input.duelId, now);
  }
  const view = await readView(supabase, input.userId, input.duelId);
  if (!view) return { ok: false, status: 503, error: "Unavailable" };
  return { ok: true, view, feedback: null };
}

function isClipPosition(position: number | null | undefined): position is number {
  return typeof position === "number" && Number.isInteger(position) && position >= 0 && position < DUEL_SIZE;
}

async function readDuel(supabase: SupabaseClient, duelId: string): Promise<DuelRow | null> {
  const load = (columns: string) =>
    supabase.from(DUELS_TABLE).select(columns).eq("id", duelId).maybeSingle();
  let { data, error } = await load(duelColumns());
  if (error && missingExpiredColumn(error.message)) {
    rememberMissingExpiredColumn();
    ({ data, error } = await load(DUEL_COLUMNS_BASE));
  }
  if (error) {
    schemaGone(error.message);
    return null;
  }
  return duelFromRow(data);
}

async function readClips(supabase: SupabaseClient, duelId: string): Promise<ClipRow[]> {
  const load = (columns: string) =>
    supabase.from(CLIPS_TABLE).select(columns).eq("duel_id", duelId).order("position", { ascending: true });
  const columns =
    Date.now() < skipKindColumnUntil ? "position, lesson_key, clip_id" : "position, lesson_key, clip_id, kind";
  let { data, error } = await load(columns);
  if (error && missingKindColumn(error.message)) {
    rememberMissingKindColumn();
    ({ data, error } = await load("position, lesson_key, clip_id"));
  }
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

async function skipMissingClips(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  now: Date,
): Promise<void> {
  const catalog = catalogIndex(listCatalogClips());
  for (let guard = 0; guard < DUEL_SIZE; guard += 1) {
    const plays = await readPlays(supabase, duelId);
    const mine = plays.filter((play) => play.user_id === userId);
    const clips = await readClips(supabase, duelId);
    const taken = new Set(mine.map((play) => play.position));
    const next = clips.find((clip) => !taken.has(clip.position));
    if (!next) return;
    const known = catalog.get(studiedKey(next.lesson_key, next.clip_id));
    const playable =
      next.kind === "order"
        ? Boolean(known?.script && known.translationVi?.trim())
        : Boolean(known?.script && known.audioPath);
    if (playable) return;
    const inserted = await insertPlay(supabase, {
      duel_id: duelId,
      user_id: userId,
      position: next.position,
      state: "forfeited",
      page_session: null,
      started_at: null,
      finished_at: now.toISOString(),
      elapsed_ms: null,
    });
    if (inserted === "error") return;
  }
}

async function beginClip(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  position: number,
  pageSession: string,
  now: Date,
): Promise<void> {
  const plays = await readPlays(supabase, duelId);
  const existing = plays.find((play) => play.user_id === userId && play.position === position);
  if (existing) return;
  await insertPlay(supabase, {
    duel_id: duelId,
    user_id: userId,
    position,
    state: "active",
    page_session: pageSession,
    started_at: now.toISOString(),
    finished_at: null,
    elapsed_ms: null,
  });
}

async function forfeitClip(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  position: number,
  now: Date,
): Promise<void> {
  const plays = await readPlays(supabase, duelId);
  const existing = plays.find((play) => play.user_id === userId && play.position === position);
  if (existing && existing.state !== "active") return;
  if (existing?.state === "active") {
    await forfeitPosition(supabase, duelId, userId, position, now);
    return;
  }
  const inserted = await insertPlay(supabase, {
    duel_id: duelId,
    user_id: userId,
    position,
    state: "forfeited",
    page_session: null,
    started_at: null,
    finished_at: now.toISOString(),
    elapsed_ms: null,
  });
  if (inserted === "conflict") await forfeitPosition(supabase, duelId, userId, position, now);
}

const MAX_CLIP_MS = 30 * 60 * 1000;

async function settleClip(
  supabase: SupabaseClient,
  duelId: string,
  userId: string,
  position: number,
  text: string,
  elapsedMs: number | null | undefined,
  now: Date,
): Promise<DuelFeedback> {
  const empty: DuelFeedback = { accuracy: 0, accepted: false, tooFast: false, words: [] };
  const plays = await readPlays(supabase, duelId);
  const existing = plays.find((play) => play.user_id === userId && play.position === position);
  if (existing && existing.state !== "active") {
    return { accuracy: 100, accepted: existing.state === "done", tooFast: false, words: [] };
  }
  const clips = await readClips(supabase, duelId);
  const clip = clips.find((item) => item.position === position);
  if (!clip) return empty;
  const known = catalogIndex(listCatalogClips()).get(studiedKey(clip.lesson_key, clip.clip_id));
  if (!known?.script) {
    await forfeitClip(supabase, duelId, userId, position, now);
    return empty;
  }

  const typed = text.trim().slice(0, MAX_ANSWER_CHARS);
  const result =
    clip.kind === "order"
      ? checkOrder(typed.split(/\s+/).filter(Boolean), known.script)
      : scoreAttempt(typed, known.script);
  const words = result.words.map((word) => ({
    word: word.word,
    status: word.status,
    ...(word.typed ? { typed: word.typed } : {}),
  }));
  if (result.accuracy !== 100) {
    return { accuracy: result.accuracy, accepted: false, tooFast: false, words };
  }
  if (elapsedMs == null || !Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_CLIP_MS) {
    return { accuracy: 100, accepted: false, tooFast: false, words };
  }

  const finishedAt = now.toISOString();
  const startedAt = new Date(now.getTime() - elapsedMs).toISOString();
  if (existing?.state === "active") {
    const { data, error } = await supabase
      .from(PLAYS_TABLE)
      .update({
        state: "done",
        finished_at: finishedAt,
        elapsed_ms: elapsedMs,
        page_session: null,
      })
      .eq("duel_id", duelId)
      .eq("user_id", userId)
      .eq("position", position)
      .eq("state", "active")
      .select("position");
    if (error) {
      schemaGone(error.message);
      return { accuracy: 100, accepted: false, tooFast: false, words };
    }
    if (!data || data.length === 0) return { accuracy: 100, accepted: false, tooFast: false, words };
    return { accuracy: 100, accepted: true, tooFast: false, words };
  }

  const inserted = await insertPlay(supabase, {
    duel_id: duelId,
    user_id: userId,
    position,
    state: "done",
    page_session: null,
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_ms: elapsedMs,
  });
  if (inserted === "error") return { accuracy: 100, accepted: false, tooFast: false, words };
  if (inserted === "inserted") return { accuracy: 100, accepted: true, tooFast: false, words };
  const retry = await supabase
    .from(PLAYS_TABLE)
    .update({
      state: "done",
      finished_at: finishedAt,
      elapsed_ms: elapsedMs,
      page_session: null,
    })
    .eq("duel_id", duelId)
    .eq("user_id", userId)
    .eq("position", position)
    .eq("state", "active")
    .select("position");
  if (retry.error) {
    schemaGone(retry.error.message);
    return { accuracy: 100, accepted: false, tooFast: false, words };
  }
  if (!retry.data || retry.data.length === 0) return { accuracy: 100, accepted: false, tooFast: false, words };
  return { accuracy: 100, accepted: true, tooFast: false, words };
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
): Promise<"inserted" | "conflict" | "error"> {
  const { error } = await supabase.from(PLAYS_TABLE).insert(row);
  if (!error) return "inserted";
  if (error.code === "23505") return "conflict";
  schemaGone(error.message);
  return "error";
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

async function expireOverdueDuels(
  supabase: SupabaseClient,
  duels: readonly DuelRow[],
  now: Date,
): Promise<Set<string>> {
  const closed = new Set<string>();
  if (Date.now() < skipExpiredColumnUntil) return closed;
  const open = duels.filter((duel) => !duel.completed_at && !duel.expired);
  if (open.length === 0) return closed;
  const plays = await playsForDuels(
    supabase,
    open.map((duel) => duel.id),
  );
  for (const duel of open) {
    const expiresAt = challengeExpiresAt(
      challengeReleasedAt(
        plays
          .filter((play) => play.duel_id === duel.id && play.user_id === duel.challenger_id)
          .map((play) => ({ state: play.state, finishedAt: play.finished_at })),
      ),
    );
    if (!isChallengeExpired(expiresAt, now)) continue;
    if (await closeExpiredDuel(supabase, duel.id, now)) closed.add(duel.id);
  }
  return closed;
}

async function closeExpiredDuel(supabase: SupabaseClient, duelId: string, now: Date): Promise<boolean> {
  const duel = await readDuel(supabase, duelId);
  if (Date.now() < skipExpiredColumnUntil) return false;
  if (!duel || duel.completed_at) return Boolean(duel?.expired);
  const plays = await readPlays(supabase, duelId);
  const opponentDone =
    plays.filter((play) => play.user_id === duel.opponent_id && isSettledState(play.state)).length >= DUEL_SIZE;
  if (opponentDone) {
    await finalizeIfReady(supabase, duelId, now);
    return false;
  }
  const toPlay = (row: PlayRow): ClipPlay => ({
    position: row.position,
    state: row.state,
    elapsedMs: row.state === "done" ? row.elapsed_ms : null,
  });
  const score = pointsFromPlays(
    plays.filter((play) => play.user_id === duel.challenger_id).map(toPlay),
    plays.filter((play) => play.user_id === duel.opponent_id).map(toPlay),
  );
  const stamp = {
    week_key: weekKey(now),
    day_key: dayKey(now),
  };
  const { error } = await supabase.from(XP_TABLE).upsert(
    [
      {
        duel_id: duelId,
        user_id: duel.challenger_id,
        xp: DUEL_EXPIRE_CHALLENGER_XP,
        outcome: "win",
        ...stamp,
      },
      {
        duel_id: duelId,
        user_id: duel.opponent_id,
        xp: DUEL_EXPIRE_OPPONENT_XP,
        outcome: "loss",
        ...stamp,
      },
    ],
    { onConflict: "duel_id,user_id", ignoreDuplicates: true },
  );
  if (error) {
    schemaGone(error.message);
    return false;
  }
  const updated = await supabase
    .from(DUELS_TABLE)
    .update({
      completed_at: now.toISOString(),
      challenger_points: score.left,
      opponent_points: score.right,
      expired: true,
    })
    .eq("id", duelId)
    .is("completed_at", null)
    .select("id");
  if (updated.error) {
    schemaGone(updated.error.message);
    return false;
  }
  return (updated.data?.length ?? 0) > 0;
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
    yourName: names.get(userId) ?? "Bạn",
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
  yourName: string;
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
      const yourState: DuelClipView["you"]["state"] = you?.state ?? "pending";
      const theirState: DuelClipView["opponent"]["state"] = !youSettled
        ? "hidden"
        : them && isSettledState(them.state)
          ? them.state
          : "pending";
      return {
        position: clip.position,
        kind: clip.kind,
        script: known?.script ?? null,
        audioPath: known?.audioPath ?? null,
        translationVi: known?.translationVi ?? null,
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
  const youAreChallenger = input.duel.challenger_id === input.userId;
  const scored = bothDone && !input.duel.expired ? awardForPoints(yourPoints, opponentPoints) : null;
  const yourAward = input.awards.find((item) => item.user_id === input.userId);
  const theirAward = input.awards.find((item) => item.user_id === opponentId);
  const expireYours = input.duel.expired
    ? youAreChallenger
      ? DUEL_EXPIRE_CHALLENGER_XP
      : DUEL_EXPIRE_OPPONENT_XP
    : null;
  const expireTheirs = input.duel.expired
    ? youAreChallenger
      ? DUEL_EXPIRE_OPPONENT_XP
      : DUEL_EXPIRE_CHALLENGER_XP
    : null;
  const released = challengeReleasedAt(
    input.plays
      .filter((play) => play.user_id === input.duel.challenger_id)
      .map((play) => ({ state: play.state, finishedAt: play.finished_at })),
  );

  return {
    id: input.duel.id,
    yourName: input.yourName,
    opponentName: input.opponentName,
    complete: Boolean(input.duel.completed_at) || bothDone,
    yourOutcome:
      yourAward?.outcome ??
      (input.duel.expired ? (youAreChallenger ? "win" : "loss") : null) ??
      scored?.leftOutcome ??
      null,
    yourXp: yourAward?.xp ?? expireYours ?? (scored ? scored.leftXp : null),
    opponentXp: theirAward?.xp ?? expireTheirs ?? (scored ? scored.rightXp : null),
    yourPoints,
    opponentPoints,
    nextPosition: active?.position ?? pending?.position ?? null,
    startedAt: active?.started_at ?? null,
    completedAt: input.duel.completed_at,
    expired: input.duel.expired,
    expiresAt: input.duel.completed_at ? null : challengeExpiresAt(released),
    clips,
  };
}

export type AdminDuelRecord = {
  id: string;
  challengerId: string;
  opponentId: string;
  createdAt: string;
  completedAt: string | null;
  challengerPoints: number | null;
  opponentPoints: number | null;
  expired: boolean;
};

function toAdminDuelRecord(duel: DuelRow): AdminDuelRecord {
  return {
    id: duel.id,
    challengerId: duel.challenger_id,
    opponentId: duel.opponent_id,
    createdAt: duel.created_at,
    completedAt: duel.completed_at,
    challengerPoints: duel.challenger_points,
    opponentPoints: duel.opponent_points,
    expired: duel.expired,
  };
}

/** Every stored duel. The admin page filters by Vietnam calendar day. */
export async function listAdminDuels(): Promise<{
  ready: boolean;
  rows: AdminDuelRecord[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, rows: [] };

  const rows: AdminDuelRecord[] = [];
  let from = 0;
  let columns = duelColumns();
  for (;;) {
    const { data, error } = await supabase
      .from(DUELS_TABLE)
      .select(columns)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (missingExpiredColumn(error.message) && columns !== DUEL_COLUMNS_BASE) {
        rememberMissingExpiredColumn();
        columns = DUEL_COLUMNS_BASE;
        continue;
      }
      schemaGone(error.message);
      return { ready: false, rows: [] };
    }
    const page = (data ?? []) as unknown[];
    for (const raw of page) {
      const duel = duelFromRow(raw);
      if (duel) rows.push(toAdminDuelRecord(duel));
    }
    if (page.length < PAGE_SIZE) return { ready: true, rows };
    from += PAGE_SIZE;
  }
}
