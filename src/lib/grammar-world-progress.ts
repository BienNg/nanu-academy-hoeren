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
  /** The learner saw the "new stage" screen. */
  announcedAt?: string;
};

export type WorldProgress = {
  stages: Record<string, WorldStageProgress>;
  /** Areas whose flag Pingu planted, with the day. Only the first time shows the flag scene. */
  summits?: Record<string, string>;
};

export const EMPTY_STAGE: WorldStageProgress = { partKeys: [], nodeEnds: [], reviewRuns: 0 };

/** Two devices' copies of a stage: finished parts union, the longer node list, the higher review count. */
export function mergeWorldStage(left: WorldStageProgress | undefined, right: WorldStageProgress | undefined): WorldStageProgress {
  const a = left ?? EMPTY_STAGE;
  const b = right ?? EMPTY_STAGE;
  const announced = [a.announcedAt, b.announcedAt].filter((value): value is string => typeof value === "string").sort()[0];
  return {
    partKeys: [...new Set([...a.partKeys, ...b.partKeys])],
    nodeEnds: b.nodeEnds.length > a.nodeEnds.length ? [...b.nodeEnds] : [...a.nodeEnds],
    reviewRuns: Math.max(a.reviewRuns, b.reviewRuns),
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
      stages[id] = { partKeys, nodeEnds, reviewRuns, ...(announcedAt ? { announcedAt } : {}) };
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
