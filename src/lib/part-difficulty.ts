import type { LearningCourseMap } from "./admin-learning";

/**
 * Behavior metrics per practice part for Admin → Practice clip difficulty.
 *
 * A part is one `lessonKey` + `partNumber`. Each student's tries at a part are
 * split at their first pass: tries up to and including it are the "first-pass
 * journey" that every difficulty number reads. Replays after a pass are only
 * counted, so a part people like to replay does not look easier.
 *
 * Thresholds are the consultant's starting points. Calibrate them against the
 * app's own data; they live in one object so that stays a one-line change.
 */

export const DIFFICULTY_THRESHOLDS = {
  /** Fewer first-pass students than this: shown greyed, never flagged. */
  minLearners: 5,
  /** First-try accuracy below this is too hard, above `accuracyEasy` too easy. */
  accuracyHard: 0.6,
  accuracyEasy: 0.95,
  /** The healthy band a learning app aims for. */
  healthyLow: 0.75,
  healthyHigh: 0.9,
  /** A student "repeats a part" when they needed this many tries or more. */
  heavyRetryTries: 3,
  /** Share of students who needed `heavyRetryTries`+ tries. */
  heavyRetryHard: 0.2,
  /** First try passed by this share or more, above the healthy band: almost nobody retries. */
  firstPassEasy: 0.98,
  /** Per-clip first-try miss rate. */
  clipHardMiss: 0.5,
  clipEasyMiss: 0.02,
  clipMinAnswers: 5,
  clipEasyMinAnswers: 20,
  /** Median time per card against the median part. */
  slowRatio: 1.5,
  fastRatio: 0.6,
  /** Starts left before the part ended. */
  abandonHard: 0.25,
  /** Fails followed by no study or practice for `quitDays`. */
  quitAfterFailHard: 0.3,
  quitDays: 7,
  /** Passes at `bingeAccuracy`+ in under `bingeSpeed` × the median time per card. */
  bingeAccuracy: 95,
  bingeSpeed: 0.5,
  bingeEasy: 0.5,
  /** Behind-pace students whose open part is this one. */
  behindMin: 3,
  behindShare: 0.5,
  /** Worse than the neighbouring parts by this much is a spike. */
  spikeAccuracy: 0.15,
  spikeRate: 0.15,
  /** Share of a Lektion's finishers who opened the next Lektion. */
  cliffRate: 0.7,
  /** Finishers this recent are left out of the cliff rate. */
  continueDays: 7,
  /** A start this recent with no run may still be in progress. */
  startGraceMs: 2 * 60 * 60 * 1000,
  /** A run longer than this was left open; its time is not used. */
  maxRunMs: 2 * 60 * 60 * 1000,
  /** Before/after windows are at most this many days each. */
  compareMaxDays: 28,
} as const;

export type DifficultyThresholds = typeof DIFFICULTY_THRESHOLDS;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** One ended practice part (listening_runs). */
export type DifficultyRun = {
  id: string;
  userId: string;
  lessonKey: string;
  partNumber: number;
  partCount: number;
  passed: boolean;
  /** Share of answered clips right on the first try, 0–100. */
  accuracy: number;
  /** Cards dealt, or clips on older rows. */
  cards: number;
  elapsedMs: number;
  at: number;
};

/** One opened practice part (practice_part_starts). */
export type DifficultyStart = {
  id: string;
  userId: string;
  lessonKey: string;
  partNumber: number;
  cardCount: number;
  at: number;
  cardsDone: number | null;
};

/** First-pass answers per clip of a part, from part_clip_outcomes(). */
export type PartClipOutcome = {
  lessonKey: string;
  partNumber: number;
  clipId: string;
  answers: number;
  misses: number;
  students: number;
};

export type PartChange = {
  id: string;
  lessonKey: string;
  partNumber: number;
  /** Asia/Ho_Chi_Minh day, YYYY-MM-DD. */
  changedOn: string;
  note: string;
  createdBy: string | null;
  createdAt: string | null;
};

export type DifficultyCohort = {
  id: string;
  name: string;
  /** Class names as entered. Matched with the admin class key. */
  classes: string[];
  updatedAt: string | null;
};

/* ------------------------------------------------------------------ */
/* Start events from the client                                        */
/* ------------------------------------------------------------------ */

export type PartStartInput = {
  id: string;
  lessonKey: string;
  partNumber: number;
  partCount: number;
  cardCount: number;
};

export type PartLeftInput = { id: string; cardsDone: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LESSON_KEY = /^[a-z0-9][a-z0-9/_-]{0,119}$/i;
export const MAX_PART_CARDS = 240;

function integerIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

export function parsePartStartInput(value: unknown): PartStartInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !UUID.test(record.id)) return null;
  if (typeof record.lessonKey !== "string" || !LESSON_KEY.test(record.lessonKey)) return null;
  const partNumber = integerIn(record.partNumber, 1, 99);
  const partCount = integerIn(record.partCount, 1, 99);
  const cardCount = integerIn(record.cardCount, 1, MAX_PART_CARDS);
  if (partNumber == null || partCount == null || cardCount == null) return null;
  if (partNumber > partCount) return null;
  return { id: record.id.toLowerCase(), lessonKey: record.lessonKey, partNumber, partCount, cardCount };
}

export function parsePartLeftInput(value: unknown): PartLeftInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !UUID.test(record.id)) return null;
  const cardsDone = integerIn(record.cardsDone, 0, MAX_PART_CARDS);
  if (cardsDone == null) return null;
  return { id: record.id.toLowerCase(), cardsDone };
}

/* ------------------------------------------------------------------ */
/* Cohorts and change markers                                          */
/* ------------------------------------------------------------------ */

export const COHORT_NAME_MAX = 80;
export const CHANGE_NOTE_MAX = 500;

export function parseCohortInput(
  value: unknown,
): { id: string | null; name: string; classes: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id =
    record.id == null || record.id === ""
      ? null
      : typeof record.id === "string" && UUID.test(record.id)
        ? record.id
        : undefined;
  if (id === undefined) return null;
  const name = typeof record.name === "string" ? record.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > COHORT_NAME_MAX) return null;
  if (!Array.isArray(record.classes)) return null;
  const seen = new Set<string>();
  const classes: string[] = [];
  for (const item of record.classes) {
    if (typeof item !== "string") return null;
    const label = item.replace(/\s+/g, " ").trim();
    const key = label.toLocaleLowerCase("vi");
    if (!label || seen.has(key)) continue;
    seen.add(key);
    classes.push(label);
  }
  if (classes.length === 0 || classes.length > 100) return null;
  return { id, name, classes };
}

export function parsePartChangeInput(
  value: unknown,
): { lessonKey: string; partNumber: number; changedOn: string; note: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.lessonKey !== "string" || !LESSON_KEY.test(record.lessonKey)) return null;
  const partNumber = integerIn(record.partNumber, 1, 99);
  if (partNumber == null) return null;
  if (typeof record.changedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.changedOn)) {
    return null;
  }
  if (Number.isNaN(Date.parse(`${record.changedOn}T00:00:00+07:00`))) return null;
  const note = typeof record.note === "string" ? record.note.trim() : "";
  if (note.length > CHANGE_NOTE_MAX) return null;
  return { lessonKey: record.lessonKey, partNumber, changedOn: record.changedOn, note };
}

/** Vietnam midnight of a YYYY-MM-DD day. */
export function changeDayStartMs(changedOn: string): number {
  return Date.parse(`${changedOn}T00:00:00+07:00`);
}

/* ------------------------------------------------------------------ */
/* Board types                                                         */
/* ------------------------------------------------------------------ */

export function partKey(lessonKey: string, partNumber: number): string {
  return `${lessonKey}#${partNumber}`;
}

export type ClipSignal = { clipId: string; answers: number; misses: number; missRate: number };

export type PartStats = {
  /** Students with a first-pass try or start. */
  learners: number;
  /** First-pass runs. Replays after a pass are in `replays`. */
  runs: number;
  replays: number;
  firstTry: number;
  /** Mean first-try accuracy of each student's first run, 0–1. */
  firstTryAccuracy: number | null;
  /** Share of students whose first run passed. */
  firstTryPass: number | null;
  passedLearners: number;
  medianTriesToPass: number | null;
  /** Share of students with `heavyRetryTries`+ tries. */
  heavyRetry: number | null;
  failRate: number | null;
  failsEligible: number;
  quitsAfterFail: number;
  quitAfterFail: number | null;
  /** Starts old enough to judge. */
  starts: number;
  abandoned: number;
  abandonRate: number | null;
  /** Median share of the part done when students left, 0–1. */
  quitPoint: number | null;
  medianMsPerCard: number | null;
  medianMs: number | null;
  /** Part median time per card ÷ the median part. */
  timeRatio: number | null;
  binge: number | null;
  /** Students whose latest practice is this part, still not passed. */
  openHere: number;
  behindHere: number;
  clipCount: number;
  hardClips: number;
  easyClips: number;
  worstClips: ClipSignal[];
};

export type PartFlagCode =
  | "low-accuracy"
  | "high-accuracy"
  | "heavy-retry"
  | "no-retry"
  | "hard-clip"
  | "easy-clips"
  | "slow"
  | "fast"
  | "abandon"
  | "quit-after-fail"
  | "binge"
  | "behind-pace"
  | "spike";

export type PartFlag = { code: PartFlagCode; tone: "hard" | "easy"; label: string };

export type PartVerdict = "too-hard" | "too-easy" | "mixed" | "healthy" | "thin";

export type PartRow = {
  key: string;
  lessonKey: string;
  partNumber: number;
  lessonLabel: string;
  courseId: string;
  courseLabel: string;
  order: number;
  stats: PartStats;
  /** This part minus the mean of its neighbours with enough data. */
  neighbor: {
    accuracy: number | null;
    abandon: number | null;
    fail: number | null;
  };
  flags: PartFlag[];
  verdict: PartVerdict;
};

export type CourseSummary = {
  courseId: string;
  courseLabel: string;
  parts: number;
  sampledParts: number;
  medianAccuracy: number | null;
  healthyShare: number | null;
  hardParts: number;
  easyParts: number;
  verdict: "too-hard" | "too-easy" | "healthy" | "thin";
};

export type LessonContinuation = {
  lessonKey: string;
  lessonLabel: string;
  courseLabel: string;
  nextLessonKey: string;
  nextLessonLabel: string;
  finishers: number;
  continued: number;
  rate: number | null;
  cliff: boolean;
};

export type ChangeWindowStats = Pick<
  PartStats,
  "learners" | "runs" | "firstTryAccuracy" | "firstTryPass" | "heavyRetry" | "abandonRate" | "starts" | "medianMsPerCard"
>;

export type ChangeComparison = {
  change: PartChange;
  lessonLabel: string;
  courseLabel: string;
  /** Days in each window. 0 when the change is today or in the future. */
  days: number;
  before: ChangeWindowStats | null;
  after: ChangeWindowStats | null;
};

export type DifficultyBoard = {
  thresholds: DifficultyThresholds;
  learners: number;
  runs: number;
  /** Start rows in scope. Zero until practice_part_starts has data. */
  startsTracked: number;
  firstStartAt: number | null;
  courseMsPerCard: number | null;
  parts: PartRow[];
  courses: CourseSummary[];
  continuation: LessonContinuation[];
  changes: ChangeComparison[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function msPerCard(run: DifficultyRun): number | null {
  if (run.elapsedMs <= 0 || run.elapsedMs > DIFFICULTY_THRESHOLDS.maxRunMs || run.cards <= 0) {
    return null;
  }
  return run.elapsedMs / run.cards;
}

/** A sorted list's first index at or after `target`. */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** One student's history at one part. */
type Journey = {
  userId: string;
  key: string;
  /** Tries up to and including the first pass, oldest first. */
  runs: DifficultyRun[];
  passed: boolean;
  replays: DifficultyRun[];
  /** Starts up to the first pass. */
  starts: DifficultyStart[];
};

function buildJourneys(
  runs: readonly DifficultyRun[],
  starts: readonly DifficultyStart[],
): Map<string, Journey[]> {
  const byUserPart = new Map<string, { runs: DifficultyRun[]; starts: DifficultyStart[] }>();
  const entry = (userId: string, key: string) => {
    const id = `${userId}\u0000${key}`;
    let found = byUserPart.get(id);
    if (!found) {
      found = { runs: [], starts: [] };
      byUserPart.set(id, found);
    }
    return found;
  };
  for (const run of runs) entry(run.userId, partKey(run.lessonKey, run.partNumber)).runs.push(run);
  for (const start of starts) {
    entry(start.userId, partKey(start.lessonKey, start.partNumber)).starts.push(start);
  }

  const byPart = new Map<string, Journey[]>();
  for (const [id, value] of byUserPart) {
    const [userId, key] = id.split("\u0000");
    const sorted = [...value.runs].sort((a, b) => a.at - b.at);
    const passIndex = sorted.findIndex((run) => run.passed);
    const firstPass = passIndex >= 0 ? sorted.slice(0, passIndex + 1) : sorted;
    const replays = passIndex >= 0 ? sorted.slice(passIndex + 1) : [];
    const passAt = passIndex >= 0 ? sorted[passIndex].at : Number.POSITIVE_INFINITY;
    const journey: Journey = {
      userId,
      key,
      runs: firstPass,
      passed: passIndex >= 0,
      replays,
      starts: value.starts.filter((start) => start.at <= passAt).sort((a, b) => a.at - b.at),
    };
    const list = byPart.get(key) ?? [];
    list.push(journey);
    byPart.set(key, list);
  }
  return byPart;
}

type Window = { from: number; to: number };

type StatsContext = {
  now: number;
  runIds: ReadonlySet<string>;
  /** Every study or practice moment per student, sorted. */
  activity: ReadonlyMap<string, number[]>;
  courseMsPerCard: number | null;
  openAt: ReadonlyMap<string, string>;
  behind: ReadonlySet<string>;
};

function inWindow(at: number, window: Window | null): boolean {
  return !window || (at >= window.from && at < window.to);
}

function partStats(
  journeys: readonly Journey[],
  clips: readonly PartClipOutcome[],
  context: StatsContext,
  window: Window | null,
): PartStats {
  const t = DIFFICULTY_THRESHOLDS;
  const learners = new Set<string>();
  let runs = 0;
  let replays = 0;
  let fails = 0;
  const firstAccuracies: number[] = [];
  let firstPasses = 0;
  const triesToPass: number[] = [];
  let heavy = 0;
  let triedLearners = 0;
  let failsEligible = 0;
  let quits = 0;
  let starts = 0;
  let abandoned = 0;
  const quitPoints: number[] = [];
  const perCard: number[] = [];
  const times: number[] = [];
  let passedRuns = 0;
  let binges = 0;
  let passedLearners = 0;

  for (const journey of journeys) {
    const tries = journey.runs.filter((run) => inWindow(run.at, window));
    const opened = journey.starts.filter((start) => inWindow(start.at, window));
    replays += journey.replays.filter((run) => inWindow(run.at, window)).length;
    if (tries.length === 0 && opened.length === 0) continue;
    learners.add(journey.userId);
    runs += tries.length;

    const first = journey.runs[0];
    if (first && inWindow(first.at, window)) {
      firstAccuracies.push(first.accuracy / 100);
      if (first.passed) firstPasses += 1;
      triedLearners += 1;
      if (journey.runs.length >= t.heavyRetryTries) heavy += 1;
      if (journey.passed) {
        passedLearners += 1;
        triesToPass.push(journey.runs.length);
      }
    }

    const activity = context.activity.get(journey.userId) ?? [];
    for (const run of tries) {
      if (!run.passed) {
        fails += 1;
        if (run.at + t.quitDays * DAY_MS <= context.now) {
          failsEligible += 1;
          // Anything after this fail, within the quit window, means they came back.
          const next = activity[lowerBound(activity, run.at + 1)];
          if (next == null || next > run.at + t.quitDays * DAY_MS) quits += 1;
        }
        continue;
      }
      const cardMs = msPerCard(run);
      if (cardMs == null) continue;
      perCard.push(cardMs);
      times.push(run.elapsedMs);
      passedRuns += 1;
      if (
        context.courseMsPerCard != null &&
        run.accuracy >= t.bingeAccuracy &&
        cardMs <= context.courseMsPerCard * t.bingeSpeed
      ) {
        binges += 1;
      }
    }

    for (const start of opened) {
      if (context.runIds.has(start.id)) {
        starts += 1;
        continue;
      }
      if (start.at > context.now - t.startGraceMs) continue;
      starts += 1;
      abandoned += 1;
      if (start.cardsDone != null && start.cardCount > 0) {
        quitPoints.push(Math.min(1, start.cardsDone / start.cardCount));
      }
    }
  }

  let openHere = 0;
  let behindHere = 0;
  if (!window) {
    const key = journeys[0]?.key;
    for (const journey of journeys) {
      if (context.openAt.get(journey.userId) !== key) continue;
      openHere += 1;
      if (context.behind.has(journey.userId)) behindHere += 1;
    }
  }

  const signals: ClipSignal[] = clips.map((clip) => ({
    clipId: clip.clipId,
    answers: clip.answers,
    misses: clip.misses,
    missRate: clip.answers > 0 ? clip.misses / clip.answers : 0,
  }));
  const ranked = signals
    .filter((clip) => clip.answers >= t.clipMinAnswers)
    .sort((a, b) => b.missRate - a.missRate || b.misses - a.misses);

  const medianPerCard = median(perCard);
  return {
    learners: learners.size,
    runs,
    replays,
    firstTry: firstAccuracies.length,
    firstTryAccuracy: mean(firstAccuracies),
    firstTryPass: share(firstPasses, triedLearners),
    passedLearners,
    medianTriesToPass: median(triesToPass),
    heavyRetry: share(heavy, triedLearners),
    failRate: share(fails, runs),
    failsEligible,
    quitsAfterFail: quits,
    quitAfterFail: share(quits, failsEligible),
    starts,
    abandoned,
    abandonRate: share(abandoned, starts),
    quitPoint: median(quitPoints),
    medianMsPerCard: medianPerCard,
    medianMs: median(times),
    timeRatio:
      medianPerCard != null && context.courseMsPerCard ? medianPerCard / context.courseMsPerCard : null,
    binge: share(binges, passedRuns),
    openHere,
    behindHere,
    clipCount: signals.length,
    hardClips: ranked.filter((clip) => clip.missRate >= t.clipHardMiss).length,
    easyClips: signals.filter(
      (clip) => clip.answers >= t.clipEasyMinAnswers && clip.missRate < t.clipEasyMiss,
    ).length,
    worstClips: ranked.slice(0, 3),
  };
}

function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function flagsFor(stats: PartStats, neighbor: PartRow["neighbor"]): PartFlag[] {
  const t = DIFFICULTY_THRESHOLDS;
  const flags: PartFlag[] = [];
  const hard = (code: PartFlagCode, label: string) => flags.push({ code, tone: "hard", label });
  const easy = (code: PartFlagCode, label: string) => flags.push({ code, tone: "easy", label });

  if (stats.firstTryAccuracy != null && stats.firstTry >= t.minLearners) {
    if (stats.firstTryAccuracy < t.accuracyHard) {
      hard("low-accuracy", `First-try accuracy ${percentLabel(stats.firstTryAccuracy)}`);
    } else if (stats.firstTryAccuracy > t.accuracyEasy) {
      easy("high-accuracy", `First-try accuracy ${percentLabel(stats.firstTryAccuracy)}`);
    }
  }
  if (stats.heavyRetry != null && stats.firstTry >= t.minLearners) {
    if (stats.heavyRetry >= t.heavyRetryHard) {
      hard("heavy-retry", `${percentLabel(stats.heavyRetry)} needed ${t.heavyRetryTries}+ tries`);
    } else if (
      stats.firstTryPass != null &&
      stats.firstTryPass >= t.firstPassEasy &&
      (stats.firstTryAccuracy ?? 0) > t.healthyHigh
    ) {
      easy("no-retry", "Almost nobody needs a second try");
    }
  }
  if (stats.hardClips > 0) {
    hard(
      "hard-clip",
      `${stats.hardClips} clip${stats.hardClips === 1 ? "" : "s"} missed ${percentLabel(t.clipHardMiss)}+ of the time`,
    );
  } else if (stats.clipCount > 0 && stats.easyClips === stats.clipCount) {
    easy("easy-clips", `Every clip under ${percentLabel(t.clipEasyMiss)} misses`);
  }
  if (stats.timeRatio != null && stats.passedLearners >= t.minLearners) {
    if (stats.timeRatio >= t.slowRatio) {
      hard("slow", `${stats.timeRatio.toFixed(1)}× the median time per card`);
    } else if (stats.timeRatio <= t.fastRatio) {
      easy("fast", `${stats.timeRatio.toFixed(1)}× the median time per card`);
    }
  }
  if (stats.abandonRate != null && stats.starts >= t.minLearners && stats.abandonRate >= t.abandonHard) {
    hard("abandon", `${percentLabel(stats.abandonRate)} of starts left before the end`);
  }
  if (
    stats.quitAfterFail != null &&
    stats.failsEligible >= t.minLearners &&
    stats.quitAfterFail >= t.quitAfterFailHard
  ) {
    hard("quit-after-fail", `${percentLabel(stats.quitAfterFail)} of fails were followed by a ${t.quitDays}-day break`);
  }
  if (stats.binge != null && stats.passedLearners >= t.minLearners && stats.binge >= t.bingeEasy) {
    easy("binge", `${percentLabel(stats.binge)} of passes are fast and near-perfect`);
  }
  if (stats.behindHere >= t.behindMin && stats.behindHere / Math.max(1, stats.openHere) >= t.behindShare) {
    hard("behind-pace", `${stats.behindHere} behind-pace students are stuck here`);
  }
  const spikes: string[] = [];
  if (neighbor.accuracy != null && neighbor.accuracy <= -t.spikeAccuracy) {
    spikes.push(`accuracy ${Math.round(neighbor.accuracy * 100)} pts`);
  }
  if (neighbor.abandon != null && neighbor.abandon >= t.spikeRate) {
    spikes.push(`drop-off +${Math.round(neighbor.abandon * 100)} pts`);
  }
  if (neighbor.fail != null && neighbor.fail >= t.spikeRate) {
    spikes.push(`fails +${Math.round(neighbor.fail * 100)} pts`);
  }
  if (spikes.length > 0) hard("spike", `Worse than neighbouring parts: ${spikes.join(", ")}`);
  return flags;
}

function verdictFor(stats: PartStats, flags: readonly PartFlag[]): PartVerdict {
  if (stats.learners < DIFFICULTY_THRESHOLDS.minLearners) return "thin";
  const hard = flags.some((flag) => flag.tone === "hard");
  const easy = flags.some((flag) => flag.tone === "easy");
  if (hard && easy) return "mixed";
  if (hard) return "too-hard";
  if (easy) return "too-easy";
  return "healthy";
}

function sampled(stats: PartStats): boolean {
  return stats.learners >= DIFFICULTY_THRESHOLDS.minLearners;
}

/** This value minus the mean of the neighbours that have one. */
function neighborDelta(
  rows: readonly { stats: PartStats; courseId: string }[],
  index: number,
  pick: (stats: PartStats) => number | null,
): number | null {
  const own = pick(rows[index].stats);
  if (own == null || !sampled(rows[index].stats)) return null;
  const values: number[] = [];
  for (const step of [-1, 1]) {
    for (let at = index + step; at >= 0 && at < rows.length; at += step) {
      if (rows[at].courseId !== rows[index].courseId) break;
      if (!sampled(rows[at].stats)) continue;
      const value = pick(rows[at].stats);
      if (value != null) values.push(value);
      break;
    }
  }
  const around = mean(values);
  return around == null ? null : own - around;
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

/**
 * Everything the Behavior tab draws. `runs`, `starts`, `clips`, and
 * `studyAt` are already limited to the students in the chosen cohort.
 */
export function buildPartDifficultyBoard({
  runs,
  starts,
  clips,
  studyAt,
  changes,
  course,
  behind,
  now = Date.now(),
}: {
  runs: readonly DifficultyRun[];
  starts: readonly DifficultyStart[];
  clips: readonly PartClipOutcome[];
  /** Finished study parts per student, as epoch ms. */
  studyAt: ReadonlyMap<string, readonly number[]>;
  changes: readonly PartChange[];
  course: LearningCourseMap;
  /** Students behind the course pace. */
  behind: ReadonlySet<string>;
  now?: number;
}): DifficultyBoard {
  const t = DIFFICULTY_THRESHOLDS;
  const journeys = buildJourneys(runs, starts);
  const runIds = new Set(runs.map((run) => run.id.toLowerCase()));

  const activity = new Map<string, number[]>();
  const note = (userId: string, at: number) => {
    const list = activity.get(userId) ?? [];
    list.push(at);
    activity.set(userId, list);
  };
  for (const run of runs) note(run.userId, run.at);
  for (const start of starts) note(start.userId, start.at);
  for (const [userId, list] of studyAt) for (const at of list) note(userId, at);
  for (const list of activity.values()) list.sort((a, b) => a - b);

  // Each student's open part: their latest practice, while it is still not passed.
  const latest = new Map<string, { at: number; key: string }>();
  const consider = (userId: string, key: string, at: number) => {
    const current = latest.get(userId);
    if (!current || at > current.at) latest.set(userId, { at, key });
  };
  for (const run of runs) consider(run.userId, partKey(run.lessonKey, run.partNumber), run.at);
  for (const start of starts) consider(start.userId, partKey(start.lessonKey, start.partNumber), start.at);
  const passedParts = new Set<string>();
  for (const run of runs) {
    if (run.passed) passedParts.add(`${run.userId}\u0000${partKey(run.lessonKey, run.partNumber)}`);
  }
  const openAt = new Map<string, string>();
  for (const [userId, value] of latest) {
    if (!passedParts.has(`${userId}\u0000${value.key}`)) openAt.set(userId, value.key);
  }

  // Course median time per card: the median of the parts' own medians, so busy parts do not dominate.
  const partMedians: number[] = [];
  for (const list of journeys.values()) {
    const values: number[] = [];
    for (const journey of list) {
      for (const run of journey.runs) {
        if (!run.passed) continue;
        const cardMs = msPerCard(run);
        if (cardMs != null) values.push(cardMs);
      }
    }
    const value = median(values);
    if (value != null && list.length >= t.minLearners) partMedians.push(value);
  }
  const courseMsPerCard = median(partMedians);

  const clipsByPart = new Map<string, PartClipOutcome[]>();
  for (const clip of clips) {
    const key = partKey(clip.lessonKey, clip.partNumber);
    const list = clipsByPart.get(key) ?? [];
    list.push(clip);
    clipsByPart.set(key, list);
  }

  const context: StatsContext = { now, runIds, activity, courseMsPerCard, openAt, behind };
  const describe = (lessonKey: string) => {
    const lesson = course.lessons.get(lessonKey);
    return {
      lessonLabel: lesson?.label ?? lessonKey,
      courseId: lesson?.courseId ?? "other",
      courseLabel: lesson?.courseLabel ?? "Other",
      lessonOrder: lesson?.order ?? 1e6,
    };
  };

  const base = [...journeys.entries()].map(([key, list]) => {
    const [lessonKey, part] = key.split("#");
    const partNumber = Number(part);
    const info = describe(lessonKey);
    return {
      key,
      lessonKey,
      partNumber,
      lessonLabel: info.lessonLabel,
      courseId: info.courseId,
      courseLabel: info.courseLabel,
      order: info.lessonOrder * 100 + partNumber,
      stats: partStats(list, clipsByPart.get(key) ?? [], context, null),
    };
  });
  base.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const parts: PartRow[] = base.map((row, index) => {
    const neighbor = {
      accuracy: neighborDelta(base, index, (stats) => stats.firstTryAccuracy),
      abandon: neighborDelta(base, index, (stats) => (stats.starts >= t.minLearners ? stats.abandonRate : null)),
      fail: neighborDelta(base, index, (stats) => stats.failRate),
    };
    const flags = sampled(row.stats) ? flagsFor(row.stats, neighbor) : [];
    return { ...row, neighbor, flags, verdict: verdictFor(row.stats, flags) };
  });

  // Level check: one bad part is content; a whole course out of band is the level.
  const courseIds = [...new Set(parts.map((row) => row.courseId))];
  const courses: CourseSummary[] = courseIds.map((courseId) => {
    const rows = parts.filter((row) => row.courseId === courseId);
    const accuracies = rows
      .filter((row) => sampled(row.stats) && row.stats.firstTryAccuracy != null)
      .map((row) => row.stats.firstTryAccuracy as number);
    const medianAccuracy = median(accuracies);
    const healthy = accuracies.filter((value) => value >= t.healthyLow && value <= t.healthyHigh).length;
    return {
      courseId,
      courseLabel: rows[0]?.courseLabel ?? courseId,
      parts: rows.length,
      sampledParts: accuracies.length,
      medianAccuracy,
      healthyShare: share(healthy, accuracies.length),
      hardParts: rows.filter((row) => row.verdict === "too-hard").length,
      easyParts: rows.filter((row) => row.verdict === "too-easy").length,
      verdict:
        medianAccuracy == null || accuracies.length < 3
          ? "thin"
          : medianAccuracy < t.healthyLow
            ? "too-hard"
            : medianAccuracy > t.healthyHigh
              ? "too-easy"
              : "healthy",
    };
  });

  return {
    thresholds: t,
    learners: new Set([...runs.map((run) => run.userId), ...starts.map((start) => start.userId)]).size,
    runs: runs.length,
    startsTracked: starts.length,
    firstStartAt: starts.reduce<number | null>((min, start) => (min == null || start.at < min ? start.at : min), null),
    courseMsPerCard,
    parts,
    courses,
    continuation: buildContinuation(runs, starts, course, now),
    changes: changes.map((change) => compareChange(change, journeys, context, describe)),
  };
}

/** Finishers of each Lektion who opened the next one in the same course. */
function buildContinuation(
  runs: readonly DifficultyRun[],
  starts: readonly DifficultyStart[],
  course: LearningCourseMap,
  now: number,
): LessonContinuation[] {
  const t = DIFFICULTY_THRESHOLDS;
  const lessons = [...course.lessons.values()].sort((a, b) => a.order - b.order);
  const finishedAt = new Map<string, Map<string, number>>();
  const touched = new Map<string, Set<string>>();
  const touch = (lessonKey: string, userId: string) => {
    const set = touched.get(lessonKey) ?? new Set<string>();
    set.add(userId);
    touched.set(lessonKey, set);
  };
  for (const run of runs) {
    touch(run.lessonKey, run.userId);
    if (!run.passed || run.partNumber !== run.partCount) continue;
    const map = finishedAt.get(run.lessonKey) ?? new Map<string, number>();
    const current = map.get(run.userId);
    if (current == null || run.at < current) map.set(run.userId, run.at);
    finishedAt.set(run.lessonKey, map);
  }
  for (const start of starts) touch(start.lessonKey, start.userId);

  const rows: LessonContinuation[] = [];
  for (let index = 0; index + 1 < lessons.length; index += 1) {
    const lesson = lessons[index];
    const next = lessons[index + 1];
    if (next.courseId !== lesson.courseId) continue;
    const finishers = finishedAt.get(lesson.key);
    if (!finishers || finishers.size === 0) continue;
    const cutoff = now - t.continueDays * DAY_MS;
    let eligible = 0;
    let continued = 0;
    const openedNext = touched.get(next.key);
    for (const [userId, at] of finishers) {
      if (at > cutoff) continue;
      eligible += 1;
      if (openedNext?.has(userId)) continued += 1;
    }
    const rate = share(continued, eligible);
    rows.push({
      lessonKey: lesson.key,
      lessonLabel: lesson.label,
      courseLabel: lesson.courseLabel,
      nextLessonKey: next.key,
      nextLessonLabel: next.label,
      finishers: eligible,
      continued,
      rate,
      cliff: rate != null && eligible >= t.minLearners && rate < t.cliffRate,
    });
  }
  return rows;
}

function windowStats(stats: PartStats): ChangeWindowStats {
  return {
    learners: stats.learners,
    runs: stats.runs,
    firstTryAccuracy: stats.firstTryAccuracy,
    firstTryPass: stats.firstTryPass,
    heavyRetry: stats.heavyRetry,
    abandonRate: stats.abandonRate,
    starts: stats.starts,
    medianMsPerCard: stats.medianMsPerCard,
  };
}

/** Same-length windows either side of the change day, capped at `compareMaxDays`. */
function compareChange(
  change: PartChange,
  journeys: ReadonlyMap<string, Journey[]>,
  context: StatsContext,
  describe: (lessonKey: string) => { lessonLabel: string; courseLabel: string },
): ChangeComparison {
  const info = describe(change.lessonKey);
  const start = changeDayStartMs(change.changedOn);
  const days = Number.isNaN(start)
    ? 0
    : Math.max(0, Math.min(DIFFICULTY_THRESHOLDS.compareMaxDays, Math.floor((context.now - start) / DAY_MS)));
  const list = journeys.get(partKey(change.lessonKey, change.partNumber)) ?? [];
  if (days === 0) {
    return { change, lessonLabel: info.lessonLabel, courseLabel: info.courseLabel, days, before: null, after: null };
  }
  const span = days * DAY_MS;
  return {
    change,
    lessonLabel: info.lessonLabel,
    courseLabel: info.courseLabel,
    days,
    before: windowStats(partStats(list, [], context, { from: start - span, to: start })),
    after: windowStats(partStats(list, [], context, { from: start, to: start + span })),
  };
}

/* ------------------------------------------------------------------ */
/* Cohort scope                                                        */
/* ------------------------------------------------------------------ */

/** Student ids in a cohort. `classKeyOf` is the admin class key function. */
export function cohortMembers(
  cohort: Pick<DifficultyCohort, "classes">,
  students: readonly { userId: string; className: string | null }[],
  classKeyOf: (name: string | null) => string,
): Set<string> {
  const keys = new Set(cohort.classes.map((name) => classKeyOf(name)).filter((key) => key.length > 0));
  const ids = new Set<string>();
  for (const student of students) {
    const key = classKeyOf(student.className);
    if (key && keys.has(key)) ids.add(student.userId);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Tab payload                                                         */
/* ------------------------------------------------------------------ */

export type DifficultyReadStatus = "ready" | "missing" | "error";

/** What the Behavior tab loads for one cohort. */
export type ClipBehaviorData = {
  /** Runs could not be read at all, or the store is not configured. */
  status: DifficultyReadStatus | "unconfigured";
  /** Each store from part_difficulty.sql. "missing" means the SQL was not run. */
  setup: {
    starts: DifficultyReadStatus;
    cohorts: DifficultyReadStatus;
    changes: DifficultyReadStatus;
    clips: DifficultyReadStatus;
  };
  cohorts: DifficultyCohort[];
  /** Every class with at least one student. */
  classes: { key: string; label: string; count: number }[];
  /** Null is every student. */
  cohortId: string | null;
  cohortSize: number;
  allLearners: number;
  board: DifficultyBoard | null;
  loadedAt: string;
};
