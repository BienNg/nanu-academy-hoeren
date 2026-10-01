/**
 * "Leben in Deutschland" content: workplaces (Nagelstudio, …) made of scenes,
 * each scene a list of clips like a Lektion. A clip can carry extra fields
 * that turn it into a workplace card:
 *
 * - `replies`: "Was sagst du?" — hear the line, pick the right reply.
 * - `answer`: Zahlen-Ohr — hear a price or time, type the number.
 * - `image`: shown instead of the Vietnamese text in pairing cards.
 *
 * No fs or path aliases, so the node tests can compile this file on its own.
 */

export const LIVING_ACCESS_PREFIX = "living-";

export type LivingReply = {
  text: string;
  correct: boolean;
  /** Vietnamese reason a wrong reply does not fit. */
  whyVi?: string;
};

export type StoredLivingClip = {
  filename: string;
  script: string;
  translationVi?: string;
  noSentenceOrder?: boolean;
  replies?: LivingReply[];
  answer?: string;
  image?: string;
};

export type StoredLivingScene = {
  id: string;
  label: string;
  labelVi?: string;
  clips: StoredLivingClip[];
};

export type StoredLivingFile = {
  scenes: StoredLivingScene[];
};

export type LivingWorkplace = {
  id: string;
  label: string;
  labelVi?: string;
  slug: string;
  /** Material Symbols icon name. */
  icon?: string;
  /** Trophy title at the end of the path, e.g. "Bereit für den Salon!". */
  finishTitle?: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isLivingSlug(value: string): boolean {
  return SLUG.test(value);
}

/** Reserved `level_access` slug that grants one workplace. */
export function livingAccessSlug(workplaceSlug: string): string {
  return `${LIVING_ACCESS_PREFIX}${workplaceSlug}`;
}

/** Workplace slug from a reserved access slug, or null for any other slug. */
export function workplaceFromAccessSlug(slug: string): string | null {
  if (!slug.startsWith(LIVING_ACCESS_PREFIX)) return null;
  const workplace = slug.slice(LIVING_ACCESS_PREFIX.length);
  return isLivingSlug(workplace) ? workplace : null;
}

/** Lesson key for runs and XP. Matches the `level/chapter` shape the APIs accept. */
export function livingLessonKey(workplaceSlug: string, sceneId: string): string {
  return `${LIVING_ACCESS_PREFIX}${workplaceSlug}/${sceneId}`;
}

/** Local progress key. No slash, so it never looks like a level lesson key. */
export function livingProgressKey(workplaceSlug: string, sceneId: string): string {
  return `${LIVING_ACCESS_PREFIX}${workplaceSlug}-${sceneId}`;
}

/** Workplace and scene from a lesson key, or null when it is not a Living lesson. */
export function parseLivingLessonKey(
  lessonKey: string,
): { workplaceSlug: string; sceneId: string } | null {
  const slash = lessonKey.indexOf("/");
  if (slash <= 0) return null;
  const workplaceSlug = workplaceFromAccessSlug(lessonKey.slice(0, slash));
  const sceneId = lessonKey.slice(slash + 1);
  if (!workplaceSlug || !isLivingSlug(sceneId)) return null;
  return { workplaceSlug, sceneId };
}

/** Exactly one correct reply and at least one wrong one, or null. */
export function parseReplies(value: unknown): LivingReply[] | null {
  if (!Array.isArray(value)) return null;
  const replies: LivingReply[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const replyText = text(item.text);
    if (!replyText) return null;
    const whyVi = text(item.whyVi);
    replies.push({
      text: replyText,
      correct: item.correct === true,
      ...(whyVi ? { whyVi } : {}),
    });
  }
  const correct = replies.filter((reply) => reply.correct).length;
  if (correct !== 1 || replies.length < 2) return null;
  const unique = new Set(replies.map((reply) => reply.text.toLowerCase()));
  if (unique.size !== replies.length) return null;
  return replies;
}

function parseClip(value: unknown): StoredLivingClip | null {
  if (!isRecord(value)) return null;
  const filename = text(value.filename);
  const script = text(value.script);
  if (!filename || !script) return null;
  const clip: StoredLivingClip = { filename, script };
  const translationVi = text(value.translationVi);
  if (translationVi) clip.translationVi = translationVi;
  if (value.noSentenceOrder === true) clip.noSentenceOrder = true;
  const answer = text(value.answer);
  const replies = parseReplies(value.replies);
  // A clip is one card type: a number answer wins over replies.
  if (answer && normalizeNumberAnswer(answer)) clip.answer = answer;
  else if (replies) clip.replies = replies;
  const image = text(value.image);
  if (image && !image.includes("/") && !image.includes("\\")) clip.image = image;
  return clip;
}

/** Keeps valid scenes and clips. Broken entries are dropped, not thrown. */
export function parseLivingFile(value: unknown): StoredLivingFile | null {
  if (!isRecord(value) || !Array.isArray(value.scenes)) return null;
  const scenes: StoredLivingScene[] = [];
  const seen = new Set<string>();
  for (const item of value.scenes) {
    if (!isRecord(item)) continue;
    const id = text(item.id);
    const label = text(item.label);
    if (!isLivingSlug(id) || !label || seen.has(id)) continue;
    seen.add(id);
    const labelVi = text(item.labelVi);
    const clips = Array.isArray(item.clips)
      ? item.clips.flatMap((clip) => {
          const parsed = parseClip(clip);
          return parsed ? [parsed] : [];
        })
      : [];
    scenes.push({ id, label, ...(labelVi ? { labelVi } : {}), clips });
  }
  return { scenes };
}

export function parseLivingWorkplaces(value: unknown): LivingWorkplace[] {
  if (!Array.isArray(value)) return [];
  const workplaces: LivingWorkplace[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const slug = text(item.slug);
    const label = text(item.label);
    if (!isLivingSlug(slug) || !label || seen.has(slug)) continue;
    seen.add(slug);
    const labelVi = text(item.labelVi);
    const icon = text(item.icon);
    const finishTitle = text(item.finishTitle);
    workplaces.push({
      id: text(item.id) || slug,
      label,
      slug,
      ...(labelVi ? { labelVi } : {}),
      ...(icon ? { icon } : {}),
      ...(finishTitle ? { finishTitle } : {}),
    });
  }
  return workplaces;
}

/**
 * Canonical form of a price, time or other number so typing styles compare
 * equal: `35,50` = `35.50` = `35,50 €` = `35,5`, `15:45` = `15.45 Uhr`,
 * `09:30` = `9:30`, `35` = `35,00`. Null when there is no number.
 */
export function normalizeNumberAnswer(value: string): string | null {
  const cleaned = value
    .toLowerCase()
    .replace(/€|euro|eur|uhr/g, "")
    .replace(/\s+/g, "")
    .replace(/[.:]/g, ",");
  if (!/^\d+(?:,\d+)?$/.test(cleaned)) return null;
  const [whole = "", fraction] = cleaned.split(",");
  const integer = whole.replace(/^0+(?=\d)/, "");
  if (fraction === undefined) return integer;
  const decimals = fraction.length === 1 ? `${fraction}0` : fraction;
  if (/^0+$/.test(decimals)) return integer;
  return `${integer},${decimals}`;
}

export function checkNumberAnswer(typed: string, answer: string): boolean {
  const expected = normalizeNumberAnswer(answer);
  return expected !== null && normalizeNumberAnswer(typed) === expected;
}
