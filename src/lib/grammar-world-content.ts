import worldFile from "@/data/grammar/world.json";
import { isAdminUser } from "@/lib/admins";
import { publicMediaExists } from "@/lib/content";
import { resolveWorld, type StoredWorldArea, type WorldArea, type WorldGate } from "@/lib/grammar-world";
import type { TenseTables } from "@/lib/grammar-lessons";
import {
  getCefrLevel,
  getChapterClips,
  getGrammarTenses,
  getLevelChapters,
} from "@/lib/levels";
import { practiceNodeLayout } from "@/lib/practice-node";
import { cefrLearnKey } from "@/lib/progress";
import { getUserDashboardFlags, getUserLevelAccess } from "@/lib/progress-store";

/** Everything the mountain and the portal need. Small enough to send to the browser. */
export type GrammarWorldData = {
  areas: WorldArea[];
  tables: TenseTables;
  /** What opens each topic's stage, by topic id. */
  gates: Record<string, WorldGate>;
};

const storedAreas = (worldFile as { areas: StoredWorldArea[] }).areas;

/** The authored world with clip audio resolved. */
export function getWorldAreas(): WorldArea[] {
  return resolveWorld(storedAreas, (audioPath) => publicMediaExists(`audio/${audioPath}`));
}

/**
 * The Lektion that opens a topic, and the parts of its first practice node.
 * Null when `opensWith` names no Lektion.
 */
function gateFor(opensWith: string, levelAccess: ReadonlySet<string> | null, unlockAll: boolean): WorldGate | null {
  const [levelSlug, chapterSlug] = opensWith.split("/");
  if (!levelSlug || !chapterSlug) return null;
  const level = getCefrLevel(levelSlug);
  const chapter = getLevelChapters(levelSlug).find((entry) => entry.slug === chapterSlug);
  if (!level || !chapter) return null;
  const progressKey = cefrLearnKey(levelSlug, chapterSlug);
  let practiceParts: WorldGate["practiceParts"] = [];
  try {
    const clips = getChapterClips(levelSlug, chapterSlug);
    practiceParts = (practiceNodeLayout(`${levelSlug}/${chapterSlug}`, clips)[0] ?? []).map((part) => ({
      key: part.key,
      clipIds: [...part.clipIds],
    }));
  } catch {
    practiceParts = [];
  }
  return {
    progressKey,
    practiceParts,
    access: levelAccess === null || levelAccess.has(levelSlug),
    unlocked: unlockAll && (levelAccess === null || levelAccess.has(levelSlug)),
    lessonHref: `/learn/${levelSlug}?lektion=${encodeURIComponent(chapterSlug)}`,
    lessonLabel: `${level.level} · ${chapter.label}`,
  };
}

/**
 * The world for one learner. Admins see every stage open; a teacher sees the
 * stages of courses they were granted open, as on the Lektion path.
 */
export async function loadGrammarWorld(user: { id?: string | null; email?: string | null }): Promise<GrammarWorldData> {
  const admin = isAdminUser(user);
  const levelAccess = admin || !user.id ? null : new Set(await getUserLevelAccess(user.id));
  const unlockAll = admin || (user.id ? (await getUserDashboardFlags(user.id)).teacher : false);
  const areas = getWorldAreas();
  const gates: Record<string, WorldGate> = {};
  for (const topic of areas.flatMap((area) => area.topics)) {
    const gate = gateFor(topic.opensWith, levelAccess, unlockAll);
    if (gate) gates[topic.id] = gate;
  }
  return { areas, tables: getGrammarTenses(), gates };
}
