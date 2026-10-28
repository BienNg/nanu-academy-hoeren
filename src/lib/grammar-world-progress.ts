/**
 * How grammar world progress is stored and merged (see grammar-world.ts).
 * Kept apart from the card dealing, so progress.ts can import it cheaply.
 *
 * Relative imports only, so the node tests can compile this file.
 */

/** One stage's progress, stored in `StoredProgress.grammarWorld.stages[topicId]`. */
export type WorldStageProgress = {
  /** Keys of finished parts. */
  partKeys: string[];
  /** Stream end of each finished node, from the foot up. */
  nodeEnds: number[];
  /** Finished plays of the review node. */
  reviewRuns: number;
  /** Next 1-based part when replaying a finished node. Node number → part. Part 1 is omitted. */
  replayParts?: Record<string, number>;
  /** The learner saw the "new stage" screen. */
  announcedAt?: string;
};

export type WorldProgress = {
  stages: Record<string, WorldStageProgress>;
  /** Areas whose flag Pingu planted, with the day. Only the first time shows the flag scene. */
  summits?: Record<string, string>;
};

export const EMPTY_STAGE: WorldStageProgress = { partKeys: [], nodeEnds: [], reviewRuns: 0 };

const NODE_REPLAY_KEY = /^\d{1,2}$/;

function normalizeNodeReplayParts(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [key, part] of Object.entries(value as Record<string, unknown>)) {
    if (!NODE_REPLAY_KEY.test(key)) continue;
    if (typeof part !== "number" || !Number.isInteger(part) || part < 2 || part > 99) continue;
    out[key] = part;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeNodeReplayParts(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
): Record<string, number> | undefined {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  const merged: Record<string, number> = {};
  for (const key of keys) merged[key] = Math.max(left?.[key] ?? 1, right?.[key] ?? 1);
  return normalizeNodeReplayParts(merged);
}

/** Remember the next part of a finished node, or clear it when that review ends. */
export function withWorldReplayPart(
  stage: WorldStageProgress,
  node: number,
  part: number | null,
): WorldStageProgress {
  const replayParts = { ...(stage.replayParts ?? {}) };
  const key = String(node);
  if (part == null || part <= 1) delete replayParts[key];
  else replayParts[key] = part;
  const next: WorldStageProgress = { ...stage };
  if (Object.keys(replayParts).length > 0) next.replayParts = replayParts;
  else delete next.replayParts;
  return next;
}

/** Two devices' copies of a stage: finished parts union, the longer node list, the higher review count. */
export function mergeWorldStage(left: WorldStageProgress | undefined, right: WorldStageProgress | undefined): WorldStageProgress {
  const a = left ?? EMPTY_STAGE;
  const b = right ?? EMPTY_STAGE;
  const announced = [a.announcedAt, b.announcedAt].filter((value): value is string => typeof value === "string").sort()[0];
  const replayParts = mergeNodeReplayParts(a.replayParts, b.replayParts);
  return {
    partKeys: [...new Set([...a.partKeys, ...b.partKeys])],
    nodeEnds: b.nodeEnds.length > a.nodeEnds.length ? [...b.nodeEnds] : [...a.nodeEnds],
    reviewRuns: Math.max(a.reviewRuns, b.reviewRuns),
    ...(replayParts ? { replayParts } : {}),
    ...(announced ? { announcedAt: announced } : {}),
  };
}

export function mergeWorldProgress(left: WorldProgress | undefined, right: WorldProgress | undefined): WorldProgress | undefined {
  if (!left && !right) return undefined;
  const ids = new Set([...Object.keys(left?.stages ?? {}), ...Object.keys(right?.stages ?? {})]);
  const stages: Record<string, WorldStageProgress> = {};
  for (const id of ids) stages[id] = mergeWorldStage(left?.stages[id], right?.stages[id]);
  const areaIds = new Set([...Object.keys(left?.summits ?? {}), ...Object.keys(right?.summits ?? {})]);
  const summits: Record<string, string> = {};
  for (const id of areaIds) {
    const stamps = [left?.summits?.[id], right?.summits?.[id]].filter((value): value is string => typeof value === "string");
    if (stamps.length > 0) summits[id] = stamps.sort()[0]!;
  }
  return { stages, ...(Object.keys(summits).length > 0 ? { summits } : {}) };
}

const STAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isoStamp(value: unknown): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

/** Keeps only well-formed stages. Undefined when nothing is left. */
export function normalizeWorldProgress(value: unknown): WorldProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { stages?: unknown; summits?: unknown };
  const stages: Record<string, WorldStageProgress> = {};
  if (record.stages && typeof record.stages === "object") {
    for (const [id, raw] of Object.entries(record.stages as Record<string, unknown>)) {
      if (!STAGE_ID.test(id) || !raw || typeof raw !== "object") continue;
      const stage = raw as Record<string, unknown>;
      const partKeys = Array.isArray(stage.partKeys)
        ? [...new Set(stage.partKeys.filter((key): key is string => typeof key === "string" && key.length > 0 && key.length <= 40))]
        : [];
      const nodeEnds = Array.isArray(stage.nodeEnds)
        ? stage.nodeEnds.filter((end): end is number => Number.isInteger(end) && (end as number) >= 0)
        : [];
      const reviewRuns =
        typeof stage.reviewRuns === "number" && Number.isInteger(stage.reviewRuns) && stage.reviewRuns > 0 ? stage.reviewRuns : 0;
      const announcedAt = isoStamp(stage.announcedAt);
      const replayParts = normalizeNodeReplayParts(stage.replayParts);
      stages[id] = {
        partKeys,
        nodeEnds,
        reviewRuns,
        ...(replayParts ? { replayParts } : {}),
        ...(announcedAt ? { announcedAt } : {}),
      };
    }
  }
  const summits: Record<string, string> = {};
  if (record.summits && typeof record.summits === "object") {
    for (const [id, stamp] of Object.entries(record.summits as Record<string, unknown>)) {
      const at = isoStamp(stamp);
      if (STAGE_ID.test(id) && at) summits[id] = at;
    }
  }
  if (Object.keys(stages).length === 0 && Object.keys(summits).length === 0) return undefined;
  return { stages, ...(Object.keys(summits).length > 0 ? { summits } : {}) };
}
