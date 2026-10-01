import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BLITZRUNDE_SCHEMA_HINT,
  buildBlitzrundeDeck,
  canStartRanked,
  computeEndsAt,
  deckKindCounts,
  isBlitzrundeSchemaMissing,
  LATE_SUBMIT_MS,
  parseHeartbeatIndex,
  parseSubmitBundle,
  participantStatus,
  rankParticipants,
  summarizeAnswers,
  type AnswerRecord,
  type BlitzrundeCard,
  type BlitzrundeEndReason,
  type BlitzrundeFinishReason,
  type BoardResult,
  type BlitzrundeKind,
  type BlitzrundeSourceClip,
  type BlitzrundeStatus,
  type ParticipantStatus,
} from "@/lib/blitzrunde";
import { getCefrLevel, getChapterClips, getLevelChapters } from "@/lib/levels";
import { getSupabaseAdmin, getUserClassName } from "@/lib/progress-store";
import { dayKey, leaderboardClassKey, leaderboardDisplayName, weekKey } from "@/lib/xp";

const SESSIONS_TABLE = "blitzrunde_sessions";
const PARTICIPANTS_TABLE = "blitzrunde_participants";
const ANSWERS_TABLE = "blitzrunde_answers";
const PROFILES_TABLE = "user_progress";
const SESSION_COLUMNS =
  "id, created_by, class_key, class_label, level_slug, chapter_slug, seed, deck, status, ranked, created_at, starts_at, ends_at, ended_at, ended_reason";
const PARTICIPANT_COLUMNS =
  "session_id, user_id, joined_at, last_seen_at, last_seen_index, final_score, answered, correct, completed_deck, avg_ms, longest_streak, finish_reason, submitted_at";

export type StoreError = "unavailable" | "not_found" | "forbidden" | "conflict" | "invalid";
export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: StoreError; message?: string };

type SessionRow = {
  id: string;
  created_by: string;
  class_key: string;
  class_label: string;
  level_slug: string;
  chapter_slug: string;
  seed: string;
  deck: BlitzrundeCard[];
  status: BlitzrundeStatus;
  ranked: boolean;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  ended_reason: BlitzrundeEndReason | null;
};

type ParticipantRow = {
  session_id: string;
  user_id: string;
  joined_at: string;
  last_seen_at: string | null;
  last_seen_index: number | null;
  final_score: number | null;
  answered: number | null;
  correct: number | null;
  completed_deck: boolean;
  avg_ms: number | null;
  longest_streak: number | null;
  finish_reason: BlitzrundeFinishReason | null;
  submitted_at: string | null;
};

type AnswerRow = AnswerRecord & { userId: string };

let loggedSchemaHint = false;

function logBlitz(message: string): void {
  if (isBlitzrundeSchemaMissing(message)) {
    if (loggedSchemaHint) return;
    loggedSchemaHint = true;
    console.error("Supabase blitzrunde", BLITZRUNDE_SCHEMA_HINT);
    return;
  }
  console.error("Supabase blitzrunde", message);
}

function unavailable<T>(message?: string): StoreResult<T> {
  if (message) logBlitz(message);
  return { ok: false, error: "unavailable", message: message && isBlitzrundeSchemaMissing(message) ? BLITZRUNDE_SCHEMA_HINT : undefined };
}

const STATUSES: readonly BlitzrundeStatus[] = ["lobby", "active", "ended", "cancelled"];

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sessionFromRow(raw: unknown): SessionRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const status = STATUSES.find((value) => value === row.status);
  const id = str(row.id);
  if (!id || !status || !Array.isArray(row.deck)) return null;
  const endedReason = row.ended_reason === "time_up" || row.ended_reason === "teacher_ended" ? row.ended_reason : null;
  return {
    id,
    created_by: str(row.created_by) ?? "",
    class_key: str(row.class_key) ?? "",
    class_label: str(row.class_label) ?? "",
    level_slug: str(row.level_slug) ?? "",
    chapter_slug: str(row.chapter_slug) ?? "",
    seed: str(row.seed) ?? "",
    deck: row.deck as BlitzrundeCard[],
    status,
    ranked: row.ranked === true,
    created_at: str(row.created_at) ?? "",
    starts_at: str(row.starts_at),
    ends_at: str(row.ends_at),
    ended_at: str(row.ended_at),
    ended_reason: endedReason,
  };
}

function participantFromRow(raw: unknown): ParticipantRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sessionId = str(row.session_id);
  const userId = str(row.user_id);
  if (!sessionId || !userId) return null;
  const reason = row.finish_reason;
  return {
    session_id: sessionId,
    user_id: userId,
    joined_at: str(row.joined_at) ?? "",
    last_seen_at: str(row.last_seen_at),
    last_seen_index: int(row.last_seen_index),
    final_score: int(row.final_score),
    answered: int(row.answered),
    correct: int(row.correct),
    completed_deck: row.completed_deck === true,
    avg_ms: int(row.avg_ms),
    longest_streak: int(row.longest_streak),
    finish_reason:
      reason === "deck_done" || reason === "time_up" || reason === "teacher_ended" ? reason : null,
    submitted_at: str(row.submitted_at),
  };
}

const KINDS: readonly BlitzrundeKind[] = ["order", "multiple-choice", "vi-choice", "vi-input", "pairing"];

function answerFromRow(raw: unknown): AnswerRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const userId = str(row.user_id);
  const kind = KINDS.find((value) => value === row.kind);
  const position = int(row.position);
  if (!userId || !kind || position == null) return null;
  const answer = row.answer;
  return {
    userId,
    position,
    kind,
    accuracy: int(row.accuracy) ?? 0,
    timeMs: int(row.time_ms) ?? 0,
    points: int(row.points) ?? 0,
    streak: int(row.streak) ?? 0,
    answer:
      typeof answer === "string" || typeof answer === "number" || Array.isArray(answer)
        ? (answer as AnswerRecord["answer"])
        : null,
  };
}

async function readSession(supabase: SupabaseClient, id: string): Promise<StoreResult<SessionRow>> {
  const { data, error } = await supabase.from(SESSIONS_TABLE).select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) return unavailable(error.message);
  const session = sessionFromRow(data);
  return session ? { ok: true, value: session } : { ok: false, error: "not_found" };
}

async function readParticipants(supabase: SupabaseClient, sessionId: string): Promise<ParticipantRow[] | null> {
  const { data, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });
  if (error) {
    logBlitz(error.message);
    return null;
  }
  return (data ?? []).flatMap((row) => {
    const participant = participantFromRow(row);
    return participant ? [participant] : [];
  });
}

async function namesFor(supabase: SupabaseClient, userIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  const { data, error } = await supabase.from(PROFILES_TABLE).select("user_id, name").in("user_id", [...userIds]);
  if (error) {
    logBlitz(error.message);
    return names;
  }
  for (const row of (data ?? []) as { user_id?: unknown; name?: unknown }[]) {
    if (typeof row.user_id !== "string") continue;
    names.set(row.user_id, leaderboardDisplayName(typeof row.name === "string" ? row.name : null));
  }
  return names;
}

/** A running round past its 7 minutes is closed on the next read. No cron needed. */
async function expireIfDue(supabase: SupabaseClient, session: SessionRow, now: Date): Promise<SessionRow> {
  if (session.status !== "active" || !session.ends_at) return session;
  if (Date.parse(session.ends_at) > now.getTime()) return session;
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ status: "ended", ended_at: session.ends_at, ended_reason: "time_up" })
    .eq("id", session.id)
    .eq("status", "active");
  if (error) logBlitz(error.message);
  return { ...session, status: "ended", ended_at: session.ends_at, ended_reason: "time_up" };
}

function lektionLabel(levelSlug: string, chapterSlug: string): { level: string; lektion: string } {
  const level = getCefrLevel(levelSlug);
  const chapter = level?.chapters.find((entry) => entry.slug === chapterSlug);
  return { level: level?.level ?? levelSlug, lektion: chapter?.label ?? chapterSlug };
}

function safeClips(levelSlug: string, chapterSlug: string): BlitzrundeSourceClip[] {
  try {
    return getChapterClips(levelSlug, chapterSlug);
  } catch {
    return [];
  }
}

/** Clips of one Lektion plus the whole level (for multiple-choice / pairing top-up). */
function deckSources(levelSlug: string, chapterSlug: string) {
  const lektionClips = safeClips(levelSlug, chapterSlug);
  const levelClips = getLevelChapters(levelSlug).flatMap((chapter) => safeClips(levelSlug, chapter.slug));
  return { lektionClips, levelClips };
}

export type DeckPreview = { total: number; counts: Record<BlitzrundeKind, number> };

/** How many cards a round on this Lektion would have, for the admin picker. */
export function previewDeck(levelSlug: string, chapterSlug: string): DeckPreview {
  const deck = buildBlitzrundeDeck({ ...deckSources(levelSlug, chapterSlug), seed: "preview" });
  return { total: deck.length, counts: deckKindCounts(deck) };
}

// ── Teacher actions ─────────────────────────────────────────────────────────

export async function createSession(input: {
  createdBy: string;
  classKey: string;
  classLabel: string;
  levelSlug: string;
  chapterSlug: string;
  now?: Date;
}): Promise<StoreResult<{ id: string }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const classKey = leaderboardClassKey(input.classKey);
  if (!classKey) return { ok: false, error: "invalid", message: "Chọn một lớp." };

  const sources = deckSources(input.levelSlug, input.chapterSlug);
  if (sources.lektionClips.length === 0) {
    return { ok: false, error: "invalid", message: "Lektion này chưa có câu nào." };
  }
  const seed = randomUUID();
  const deck = buildBlitzrundeDeck({ ...sources, seed });
  if (deck.length === 0) {
    return { ok: false, error: "invalid", message: "Lektion này không có thẻ nào dùng được (cần câu có bản dịch)." };
  }

  // A round that ran out of time but was never read again would still block
  // this class through the one-live-round index.
  const now = input.now ?? new Date();
  const { data: stale } = await supabase
    .from(SESSIONS_TABLE)
    .select(SESSION_COLUMNS)
    .eq("class_key", classKey)
    .eq("status", "active");
  for (const raw of stale ?? []) {
    const session = sessionFromRow(raw);
    if (session) await expireIfDue(supabase, session, now);
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .insert({
      created_by: input.createdBy,
      class_key: classKey,
      class_label: input.classLabel.trim() || classKey,
      level_slug: input.levelSlug,
      chapter_slug: input.chapterSlug,
      seed,
      deck,
      status: "lobby",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "conflict", message: "Lớp này đang có một Blitzrunde mở." };
    }
    return unavailable(error.message);
  }
  const id = str((data as { id?: unknown } | null)?.id);
  return id ? { ok: true, value: { id } } : unavailable();
}

export async function startSession(sessionId: string, now: Date = new Date()): Promise<StoreResult<{ ranked: boolean }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  if (found.value.status !== "lobby") {
    return { ok: false, error: "conflict", message: "Vòng này đã bắt đầu hoặc đã đóng." };
  }
  const participants = await readParticipants(supabase, sessionId);
  if (!participants) return unavailable();
  if (participants.length === 0) {
    return { ok: false, error: "invalid", message: "Chưa có học viên nào vào phòng." };
  }
  const ranked = canStartRanked(participants.length);
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({
      status: "active",
      ranked,
      starts_at: now.toISOString(),
      ends_at: computeEndsAt(now).toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "lobby")
    .select("id");
  if (error) return unavailable(error.message);
  if (!data || data.length === 0) return { ok: false, error: "conflict", message: "Vòng này đã bắt đầu." };
  return { ok: true, value: { ranked } };
}

export async function endSession(sessionId: string, now: Date = new Date()): Promise<StoreResult<null>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  const session = await expireIfDue(supabase, found.value, now);
  if (session.status !== "active") return { ok: true, value: null };
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ status: "ended", ended_at: now.toISOString(), ended_reason: "teacher_ended" })
    .eq("id", sessionId)
    .eq("status", "active");
  if (error) return unavailable(error.message);
  return { ok: true, value: null };
}

export async function cancelSession(sessionId: string): Promise<StoreResult<null>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("status", "lobby");
  if (error) return unavailable(error.message);
  return { ok: true, value: null };
}

// ── Student actions ─────────────────────────────────────────────────────────

export type LiveRound = {
  id: string;
  status: "lobby" | "active";
  classLabel: string;
  levelLabel: string;
  lektionLabel: string;
  endsAt: string | null;
  joined: boolean;
  submitted: boolean;
};

/** True once this class has a round that left the lobby. Cancelled lobbies do not count. */
export async function classHasStartedBlitzrunde(classKey: string): Promise<boolean> {
  if (!classKey) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("class_key", classKey)
    .in("status", ["active", "ended"])
    .limit(1);
  if (error) {
    logBlitz(error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** True when any class has a round that left the lobby. */
export async function anyClassHasStartedBlitzrunde(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .in("status", ["active", "ended"])
    .limit(1);
  if (error) {
    logBlitz(error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** The open round for this learner's class, if any. Drives the home-screen banner. */
export async function getLiveRoundForUser(userId: string, now: Date = new Date()): Promise<LiveRound | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const classKey = leaderboardClassKey(await getUserClassName(userId));
  if (!classKey) return null;

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(SESSION_COLUMNS)
    .eq("class_key", classKey)
    .in("status", ["lobby", "active"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    logBlitz(error.message);
    return null;
  }
  const found = sessionFromRow(data?.[0]);
  if (!found) return null;
  const session = await expireIfDue(supabase, found, now);
  if (session.status !== "lobby" && session.status !== "active") return null;

  const { data: mine } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select("submitted_at")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle();
  const labels = lektionLabel(session.level_slug, session.chapter_slug);
  return {
    id: session.id,
    status: session.status,
    classLabel: session.class_label,
    levelLabel: labels.level,
    lektionLabel: labels.lektion,
    endsAt: session.ends_at,
    joined: Boolean(mine),
    submitted: Boolean(str((mine as { submitted_at?: unknown } | null)?.submitted_at)),
  };
}

async function classMatches(userId: string, session: SessionRow): Promise<boolean> {
  return leaderboardClassKey(await getUserClassName(userId)) === session.class_key;
}

export async function joinSession(sessionId: string, userId: string, now: Date = new Date()): Promise<StoreResult<null>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  if (!(await classMatches(userId, found.value))) {
    return { ok: false, error: "forbidden", message: "Vòng này dành cho lớp khác." };
  }
  const { data: existing } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return { ok: true, value: null };
  if (found.value.status !== "lobby") {
    return { ok: false, error: "conflict", message: "Vòng này đã bắt đầu, không vào được nữa." };
  }
  const { error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .upsert(
      { session_id: sessionId, user_id: userId, joined_at: now.toISOString(), last_seen_at: now.toISOString() },
      { onConflict: "session_id,user_id", ignoreDuplicates: true },
    );
  if (error) return unavailable(error.message);
  return { ok: true, value: null };
}

export async function recordHeartbeat(
  sessionId: string,
  userId: string,
  body: unknown,
  now: Date = new Date(),
): Promise<StoreResult<{ status: BlitzrundeStatus; endsAt: string | null }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  const session = await expireIfDue(supabase, found.value, now);
  const index = parseHeartbeatIndex(body, session.deck.length);
  if (index == null) return { ok: false, error: "invalid" };
  if (session.status === "active") {
    const { error } = await supabase
      .from(PARTICIPANTS_TABLE)
      .update({ last_seen_at: now.toISOString(), last_seen_index: index })
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .is("submitted_at", null);
    if (error) logBlitz(error.message);
  }
  return { ok: true, value: { status: session.status, endsAt: session.ends_at } };
}

export async function submitResult(
  sessionId: string,
  userId: string,
  body: unknown,
  now: Date = new Date(),
): Promise<StoreResult<{ finalScore: number }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  const session = await expireIfDue(supabase, found.value, now);
  if (session.status === "lobby" || session.status === "cancelled") {
    return { ok: false, error: "conflict", message: "Vòng này chưa chạy." };
  }
  const closedAt = session.ended_at ? Date.parse(session.ended_at) : null;
  if (closedAt != null && now.getTime() - closedAt > LATE_SUBMIT_MS) {
    return { ok: false, error: "conflict", message: "Vòng này đã đóng." };
  }

  const { data: row, error: readError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) return unavailable(readError.message);
  const participant = participantFromRow(row);
  if (!participant) return { ok: false, error: "forbidden", message: "Bạn chưa vào vòng này." };
  if (participant.submitted_at) {
    return { ok: true, value: { finalScore: participant.final_score ?? 0 } };
  }

  const bundle = parseSubmitBundle(body, session.deck.length);
  if (!bundle) return { ok: false, error: "invalid" };
  for (const answer of bundle.answers) {
    if (session.deck[answer.position]?.kind !== answer.kind) return { ok: false, error: "invalid" };
  }

  if (bundle.answers.length > 0) {
    const { error } = await supabase.from(ANSWERS_TABLE).upsert(
      bundle.answers.map((answer) => ({
        session_id: sessionId,
        user_id: userId,
        position: answer.position,
        kind: answer.kind,
        accuracy: answer.accuracy,
        time_ms: answer.timeMs,
        points: answer.points,
        streak: answer.streak,
        answer: answer.answer,
      })),
      { onConflict: "session_id,user_id,position", ignoreDuplicates: true },
    );
    if (error) return unavailable(error.message);
  }

  const summary = summarizeAnswers(bundle.answers);
  const { error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .update({
      final_score: summary.finalScore,
      answered: summary.answered,
      correct: summary.correct,
      avg_ms: summary.avgMs,
      longest_streak: summary.longestStreak,
      completed_deck: bundle.answers.length === session.deck.length,
      finish_reason: bundle.finishReason,
      submitted_at: now.toISOString(),
      week_key: weekKey(now),
      day_key: dayKey(now),
    })
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .is("submitted_at", null);
  if (error) return unavailable(error.message);
  return { ok: true, value: { finalScore: summary.finalScore } };
}

// ── Views ───────────────────────────────────────────────────────────────────

export type ParticipantView = {
  userId: string;
  name: string;
  status: ParticipantStatus;
  joinedAt: string;
  lastSeenAt: string | null;
  lastSeenIndex: number | null;
  submittedAt: string | null;
  finishReason: BlitzrundeFinishReason | null;
  finalScore: number;
  answered: number;
  correct: number;
  avgMs: number;
  longestStreak: number;
  completedDeck: boolean;
  rank: number | null;
};

export type RoundMeta = {
  id: string;
  status: BlitzrundeStatus;
  ranked: boolean;
  classLabel: string;
  levelSlug: string;
  chapterSlug: string;
  levelLabel: string;
  lektionLabel: string;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  endedReason: BlitzrundeEndReason | null;
  deckSize: number;
  counts: Record<BlitzrundeKind, number>;
};

function toMeta(session: SessionRow): RoundMeta {
  const labels = lektionLabel(session.level_slug, session.chapter_slug);
  return {
    id: session.id,
    status: session.status,
    ranked: session.ranked,
    classLabel: session.class_label,
    levelSlug: session.level_slug,
    chapterSlug: session.chapter_slug,
    levelLabel: labels.level,
    lektionLabel: labels.lektion,
    createdAt: session.created_at,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    endedAt: session.ended_at,
    endedReason: session.ended_reason,
    deckSize: session.deck.length,
    counts: deckKindCounts(session.deck),
  };
}

function toParticipantViews(
  session: SessionRow,
  participants: readonly ParticipantRow[],
  names: Map<string, string>,
  now: Date,
): ParticipantView[] {
  const views = participants.map((row) => ({
    userId: row.user_id,
    name: names.get(row.user_id) ?? leaderboardDisplayName(null),
    status: participantStatus({
      sessionStatus: session.status,
      submittedAt: row.submitted_at,
      lastSeenAt: row.last_seen_at,
      endedAt: session.ended_at,
      now,
    }),
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
    lastSeenIndex: row.last_seen_index,
    submittedAt: row.submitted_at,
    finishReason: row.finish_reason,
    finalScore: row.final_score ?? 0,
    answered: row.answered ?? 0,
    correct: row.correct ?? 0,
    avgMs: row.avg_ms ?? 0,
    longestStreak: row.longest_streak ?? 0,
    completedDeck: row.completed_deck,
  }));
  const ranks = new Map(
    rankParticipants(views.filter((view) => view.submittedAt)).map((view) => [view.userId, view.rank]),
  );
  const ranked = views.map((view) => ({ ...view, rank: ranks.get(view.userId) ?? null }));
  return ranked.sort((left, right) => {
    if (left.rank != null && right.rank != null) return left.rank - right.rank;
    if (left.rank != null) return -1;
    if (right.rank != null) return 1;
    return left.name.localeCompare(right.name, "vi", { sensitivity: "base" });
  });
}

export type StudentRoundView = {
  meta: RoundMeta;
  joined: boolean;
  classMatches: boolean;
  /** Only once the round runs and only for someone who joined. */
  deck: BlitzrundeCard[] | null;
  you: ParticipantView | null;
  joinedCount: number;
  /** The standings, once the round is over. */
  standings: ParticipantView[] | null;
  /** Who is in the room, in join order: only in the lobby, and only for someone who joined. */
  players: LobbyPlayer[] | null;
};

export type LobbyPlayer = { name: string; isYou: boolean; joinedAt: string };

export async function getStudentRound(
  sessionId: string,
  userId: string,
  now: Date = new Date(),
): Promise<StoreResult<StudentRoundView>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  const session = await expireIfDue(supabase, found.value, now);
  const participants = await readParticipants(supabase, sessionId);
  if (!participants) return unavailable();

  const mine = participants.find((row) => row.user_id === userId) ?? null;
  const over = session.status === "ended" || session.status === "cancelled";
  const inLobby = session.status === "lobby" && Boolean(mine);
  const names = await namesFor(
    supabase,
    over || inLobby ? participants.map((row) => row.user_id) : mine ? [userId] : [],
  );
  const views = toParticipantViews(session, participants, names, now);
  return {
    ok: true,
    value: {
      meta: toMeta(session),
      joined: Boolean(mine),
      classMatches: mine ? true : await classMatches(userId, session),
      deck: mine && (session.status === "active" || session.status === "ended") ? session.deck : null,
      you: views.find((view) => view.userId === userId) ?? null,
      joinedCount: participants.length,
      standings: over ? views : null,
      players: inLobby
        ? participants.map((row) => ({
            name: names.get(row.user_id) ?? leaderboardDisplayName(null),
            isYou: row.user_id === userId,
            joinedAt: row.joined_at,
          }))
        : null,
    },
  };
}

export type AdminRoundView = {
  meta: RoundMeta;
  deck: BlitzrundeCard[];
  participants: ParticipantView[];
  answers: Record<string, AnswerRecord[]>;
};

export async function getAdminRound(sessionId: string, now: Date = new Date()): Promise<StoreResult<AdminRoundView>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailable();
  const found = await readSession(supabase, sessionId);
  if (!found.ok) return found;
  const session = await expireIfDue(supabase, found.value, now);
  const participants = await readParticipants(supabase, sessionId);
  if (!participants) return unavailable();

  const { data, error } = await supabase
    .from(ANSWERS_TABLE)
    .select("user_id, position, kind, accuracy, time_ms, points, streak, answer")
    .eq("session_id", sessionId)
    .order("position", { ascending: true });
  if (error) return unavailable(error.message);
  const answers: Record<string, AnswerRecord[]> = {};
  for (const raw of data ?? []) {
    const answer = answerFromRow(raw);
    if (!answer) continue;
    const { userId, ...record } = answer;
    (answers[userId] ??= []).push(record);
  }

  const names = await namesFor(supabase, participants.map((row) => row.user_id));
  return {
    ok: true,
    value: {
      meta: toMeta(session),
      deck: session.deck,
      participants: toParticipantViews(session, participants, names, now),
      answers,
    },
  };
}

export type AdminRoundSummary = RoundMeta & {
  joinedCount: number;
  finishedCount: number;
  winnerName: string | null;
  winnerScore: number | null;
};

export async function listAdminRounds(
  limit = 40,
  now: Date = new Date(),
): Promise<{ ready: boolean; hint?: string; rounds: AdminRoundSummary[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, rounds: [] };
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(SESSION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logBlitz(error.message);
    return {
      ready: false,
      hint: isBlitzrundeSchemaMissing(error.message) ? BLITZRUNDE_SCHEMA_HINT : undefined,
      rounds: [],
    };
  }
  const sessions: SessionRow[] = [];
  for (const raw of data ?? []) {
    const session = sessionFromRow(raw);
    if (session) sessions.push(await expireIfDue(supabase, session, now));
  }
  if (sessions.length === 0) return { ready: true, rounds: [] };

  const { data: rows, error: rowsError } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .in("session_id", sessions.map((session) => session.id));
  if (rowsError) logBlitz(rowsError.message);
  const bySession = new Map<string, ParticipantRow[]>();
  for (const raw of rows ?? []) {
    const participant = participantFromRow(raw);
    if (!participant) continue;
    const list = bySession.get(participant.session_id) ?? [];
    list.push(participant);
    bySession.set(participant.session_id, list);
  }

  const winners = new Map<string, ParticipantView>();
  for (const session of sessions) {
    const participants = bySession.get(session.id) ?? [];
    const top = toParticipantViews(session, participants, new Map(), now).find((view) => view.rank === 1);
    if (top) winners.set(session.id, top);
  }
  const names = await namesFor(supabase, [...new Set([...winners.values()].map((view) => view.userId))]);

  return {
    ready: true,
    rounds: sessions.map((session) => {
      const participants = bySession.get(session.id) ?? [];
      const winner = winners.get(session.id);
      return {
        ...toMeta(session),
        joinedCount: participants.length,
        finishedCount: participants.filter((row) => row.submitted_at).length,
        winnerName: winner ? (names.get(winner.userId) ?? leaderboardDisplayName(null)) : null,
        winnerScore: winner?.finalScore ?? null,
      };
    }),
  };
}

// ── Leaderboard rows ────────────────────────────────────────────────────────

/**
 * Every submitted result from finished, ranked rounds, each tagged with the
 * class the round was played in (not the student's class today), the Lektion
 * and its placement. Unranked practice rounds (one student) never count, and
 * a running round only counts once it is over, because its winner can still
 * change. Callers filter by week or class in memory.
 */
export async function listRankedResults(input: { now?: Date } = {}): Promise<BoardResult[] | null> {
  const now = input.now ?? new Date();
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select(`${PARTICIPANT_COLUMNS}, week_key`)
    .not("submitted_at", "is", null);
  if (error) {
    logBlitz(error.message);
    return null;
  }
  const participants = (data ?? []).flatMap((raw) => {
    const participant = participantFromRow(raw);
    if (!participant) return [];
    const weekKeyValue = (raw as { week_key?: unknown }).week_key;
    return [{ ...participant, week_key: typeof weekKeyValue === "string" ? weekKeyValue : null }];
  });
  if (participants.length === 0) return [];

  const sessionIds = [...new Set(participants.map((row) => row.session_id))];
  const { data: sessions, error: sessionsError } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, status, class_key, class_label, level_slug, chapter_slug, created_at, starts_at, ends_at")
    .in("id", sessionIds)
    .eq("ranked", true)
    .in("status", ["active", "ended"]);
  if (sessionsError) {
    logBlitz(sessionsError.message);
    return null;
  }

  type SessionInfo = { classKey: string; classLabel: string; lektionLabel: string; playedAt: string };
  const finished = new Map<string, SessionInfo>();
  for (const raw of (sessions ?? []) as Record<string, unknown>[]) {
    const id = str(raw.id);
    if (!id) continue;
    const endsAt = str(raw.ends_at);
    const over =
      raw.status === "ended" || (endsAt != null && Number.isFinite(Date.parse(endsAt)) && Date.parse(endsAt) <= now.getTime());
    if (!over) continue;
    const labels = lektionLabel(str(raw.level_slug) ?? "", str(raw.chapter_slug) ?? "");
    finished.set(id, {
      classKey: str(raw.class_key) ?? "",
      classLabel: str(raw.class_label) ?? "",
      lektionLabel: `${labels.level} ${labels.lektion}`,
      playedAt: str(raw.starts_at) ?? str(raw.created_at) ?? "",
    });
  }

  const bySession = new Map<string, typeof participants>();
  for (const row of participants) {
    if (!finished.has(row.session_id)) continue;
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }

  const results: BoardResult[] = [];
  for (const [sessionId, rows] of bySession) {
    const info = finished.get(sessionId);
    if (!info) continue;
    const weekByUser = new Map(rows.map((row) => [row.user_id, row.week_key]));
    const ranked = rankParticipants(
      rows.map((row) => ({
        userId: row.user_id,
        finalScore: row.final_score ?? 0,
        answered: row.answered ?? 0,
        correct: row.correct ?? 0,
        avgMs: row.avg_ms ?? 0,
        longestStreak: row.longest_streak ?? 0,
        completedDeck: row.completed_deck,
      })),
    );
    for (const entry of ranked) {
      results.push({
        sessionId,
        userId: entry.userId,
        finalScore: entry.finalScore,
        rank: entry.rank,
        classKey: info.classKey,
        classLabel: info.classLabel,
        lektionLabel: info.lektionLabel,
        playedAt: info.playedAt,
        weekKey: weekByUser.get(entry.userId) ?? null,
      });
    }
  }
  return results;
}
