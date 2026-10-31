/**
 * Conjugation study cards. A Lektion clip with a `conjugation` list is one
 * verb: its card shows the infinitive and the Präsens forms as a table, and
 * recall asks for every form (see A1.1 Lektion 12).
 *
 * Forms are written by hand in the Lektion JSON. The endings are colored, and
 * the letters a form changes in the infinitive's stem (fährst, liest, isst)
 * are marked, so the vowel change stands out.
 *
 * No imports so the node tests can compile this file on its own.
 */

export type StoredConjugationRow = {
  /** Row label as shown: "ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie". */
  person: string;
  /** The verb form alone, e.g. "fährst". */
  form: string;
  /** Audio of the person and the form, e.g. "du fährst". */
  filename: string;
};

/** A piece of a form: the stem, letters changed from the infinitive's stem, or the ending. */
export type ConjugationSegment = { text: string; tone: "stem" | "change" | "ending" };

export type ConjugationRow = {
  person: string;
  form: string;
  segments: ConjugationSegment[];
  /** Path under public/audio. Null until the MP3 exists. */
  audioPath: string | null;
};

const PRESENT_ENDINGS: Record<string, string> = {
  ich: "e",
  du: "st",
  er: "t",
  wir: "en",
  ihr: "t",
  sie: "en",
};

/** "er/sie/es" → "er", "sie/Sie" → "sie". */
export function personId(label: string): string {
  return label.split("/")[0]!.trim().toLowerCase();
}

/** fahren → fahr, wandern → wander. */
export function infinitiveStem(infinitive: string): string {
  const verb = infinitive.trim();
  if (verb.endsWith("en")) return verb.slice(0, -2);
  if (verb.endsWith("n")) return verb.slice(0, -1);
  return verb;
}

/** The regular Präsens ending, with the e after -t/-d (arbeitest) and no s after s/ß/z/x (heißt). */
export function presentEnding(stem: string, person: string): string | null {
  const ending = PRESENT_ENDINGS[person];
  if (ending === undefined) return null;
  if (/[td]$/.test(stem) && (ending === "st" || ending === "t")) return `e${ending}`;
  if (/[sßzx]$/.test(stem) && person === "du") return "t";
  return ending;
}

/**
 * Splits a form into stem and ending, and marks the letters of the stem that
 * differ from the infinitive's. A form that does not end in the expected
 * ending (ist, hat) is shown as one stem piece.
 */
export function conjugationSegments(infinitive: string, person: string, form: string): ConjugationSegment[] {
  const baseStem = infinitiveStem(infinitive);
  const id = personId(person);
  // A changed stem keeps the plain ending (hältst, not haltest), so try both.
  const ending = [presentEnding(baseStem, id), PRESENT_ENDINGS[id]].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && form.length > candidate.length && form.endsWith(candidate),
  );
  const stem = ending === undefined ? form : form.slice(0, form.length - ending.length);
  const segments = stemSegments(baseStem, stem);
  if (ending !== undefined) segments.push({ text: ending, tone: "ending" });
  return segments;
}

/** The stem, with the letters between the shared start and the shared end marked as changed. */
function stemSegments(baseStem: string, stem: string): ConjugationSegment[] {
  if (stem.toLowerCase() === baseStem.toLowerCase()) return [{ text: stem, tone: "stem" }];
  const a = stem.toLowerCase();
  const b = baseStem.toLowerCase();
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) {
    end += 1;
  }
  const changed = stem.slice(start, stem.length - end);
  if (changed.length === 0) return [{ text: stem, tone: "stem" }];
  return [
    { text: stem.slice(0, start), tone: "stem" as const },
    { text: changed, tone: "change" as const },
    { text: stem.slice(stem.length - end), tone: "stem" as const },
  ].filter((segment) => segment.text.length > 0);
}

/** Whether a typed answer is the row's form. A typed pronoun in front ("du fährst") is fine. */
export function conjugationAnswerMatches(row: { person: string; form: string }, typed: string): boolean {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/[.,!?]+$/, "").replace(/\s+/g, " ");
  const answer = normalize(typed);
  const form = normalize(row.form);
  if (answer === form) return true;
  const pronouns = row.person.split("/").map((pronoun) => normalize(pronoun));
  return pronouns.some((pronoun) => answer === `${pronoun} ${form}`);
}
