/**
 * Grammar topics taught by a Lektion's grammar nodes (see docs/GRAMMAR_NODES.md).
 *
 * Verb tables live in src/data/grammar/tenses.json and are shared by every
 * Lektion. A Lektion's JSON lists its topics in a `grammar` block: tips,
 * example sentences with audio, and authored drills. Everything else a node
 * shows is built from the tables.
 *
 * Relative imports only, so the node tests can compile this file.
 */

export const GRAMMAR_TENSES = ["praesens", "perfekt", "praeteritum"] as const;
export type GrammarTense = (typeof GRAMMAR_TENSES)[number];

/** Tenses stored per person. Perfekt is built from the aux and the Partizip. */
type StoredTense = Exclude<GrammarTense, "perfekt">;

export type GrammarPerson = {
  id: string;
  /** Row label, e.g. "er/sie/es". */
  label: string;
  /** Pronoun spoken in the row's audio. */
  say: string;
};

export type GrammarTenseMeta = {
  id: GrammarTense;
  label: string;
  labelVi: string;
};

export type TenseVerb = {
  praesens: Record<string, string>;
  praeteritum: Record<string, string>;
  partizip: string;
  aux: string;
};

export type TenseTables = {
  persons: GrammarPerson[];
  tenses: GrammarTenseMeta[];
  verbs: Record<string, TenseVerb>;
};

export type GrammarTip = {
  id: string;
  titleVi: string;
  textVi: string;
  /** Shown only in this verb's study part. Omitted: every part. */
  verb?: string;
};

export type StoredGrammarExample = {
  filename: string;
  script: string;
  translationVi: string;
  verb: string;
  tense: GrammarTense;
  person: string;
};

export type GrammarTransformDrill = {
  type: "transform";
  verb: string;
  tense: GrammarTense;
  from: string;
  to: string;
  translationVi: string;
};

export type GrammarErrorDrill = {
  type: "error";
  verb: string;
  script: string;
  /** The corrected sentence. Omitted: the sentence is already correct. */
  fix?: string;
  whyVi?: string;
};

export type GrammarDrill = GrammarTransformDrill | GrammarErrorDrill;

export type StoredGrammarTopic = {
  id: string;
  titleVi: string;
  /** One study part per verb, in this order. */
  verbs: string[];
  tips: GrammarTip[];
  examples: StoredGrammarExample[];
  drills: GrammarDrill[];
};

export type GrammarExample = StoredGrammarExample & {
  id: string;
  /** Path under public/audio. Null until the MP3 exists: text cards still use the example. */
  audioPath: string | null;
};

/** One cell of a conjugation table. */
export type ConjugationCell = {
  /** As written in the table, e.g. "hast … gehabt". */
  text: string;
  /** What the row's audio says, e.g. "du hast gehabt". */
  spoken: string;
  /** Path under public/audio. Null until the MP3 exists. */
  audioPath: string | null;
  /** The part to highlight: a Präteritum ending ("st" in hattest), or the Partizip. Empty for none. */
  highlight: string;
};

export type ConjugationRow = {
  person: GrammarPerson;
  cells: Record<GrammarTense, ConjugationCell>;
};

export type ConjugationTable = {
  verb: string;
  tenses: GrammarTenseMeta[];
  rows: ConjugationRow[];
};

export type GrammarTopicContent = {
  id: string;
  titleVi: string;
  verbs: string[];
  tables: ConjugationTable[];
  tips: GrammarTip[];
  examples: GrammarExample[];
  drills: GrammarDrill[];
};

/** Shown between the aux and the Partizip in a Perfekt cell. */
export const PERFEKT_GAP = "…";

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

/** Row audio of one table cell, shared by every Lektion. */
export function conjugationAudioPath(verb: string, tense: GrammarTense, personId: string): string {
  return `grammar/${verb}/${tense}-${personId}.mp3`;
}

/** What `form` adds after the shortest shared start with `base`: "st" for hattest vs hatte. */
export function endingAfter(form: string, base: string): string {
  let shared = 0;
  while (shared < form.length && shared < base.length && form[shared] === base[shared]) shared += 1;
  return form.slice(shared);
}

function storedForm(verb: TenseVerb, tense: StoredTense, personId: string): string {
  return verb[tense][personId] ?? "";
}

/** The written form of a verb for one person and tense. Perfekt joins aux and Partizip. */
export function verbForm(
  tables: TenseTables,
  verbId: string,
  tense: GrammarTense,
  personId: string,
): { text: string; words: string[] } | null {
  const verb = tables.verbs[verbId];
  if (!verb) return null;
  if (tense === "perfekt") {
    const aux = tables.verbs[verb.aux];
    const auxForm = aux ? storedForm(aux, "praesens", personId) : "";
    if (!auxForm) return null;
    return { text: `${auxForm} ${PERFEKT_GAP} ${verb.partizip}`, words: [auxForm, verb.partizip] };
  }
  const form = storedForm(verb, tense, personId);
  return form ? { text: form, words: [form] } : null;
}

/**
 * The verb's table: one row per person, one cell per tense. `hasAudio` says
 * whether a row's MP3 exists, so a missing file shows no play button.
 */
export function conjugationTable(
  tables: TenseTables,
  verbId: string,
  hasAudio: (audioPath: string) => boolean = () => true,
): ConjugationTable | null {
  const verb = tables.verbs[verbId];
  if (!verb) return null;
  const firstPerson = tables.persons[0]?.id ?? "";
  const rows: ConjugationRow[] = [];
  for (const person of tables.persons) {
    const cells = {} as Record<GrammarTense, ConjugationCell>;
    for (const tense of GRAMMAR_TENSES) {
      const form = verbForm(tables, verbId, tense, person.id);
      if (!form) return null;
      const audioPath = conjugationAudioPath(verbId, tense, person.id);
      const highlight =
        tense === "perfekt"
          ? verb.partizip
          : tense === "praeteritum"
            ? endingAfter(form.text, storedForm(verb, "praeteritum", firstPerson))
            : "";
      cells[tense] = {
        text: form.text,
        spoken: [person.say, ...form.words].join(" "),
        audioPath: hasAudio(audioPath) ? audioPath : null,
        highlight,
      };
    }
    rows.push({ person, cells });
  }
  const tenses = GRAMMAR_TENSES.flatMap((id) => tables.tenses.find((tense) => tense.id === id) ?? []);
  return { verb: verbId, tenses, rows };
}

/** Every table cell's audio, for the content check and audio generation. */
export function conjugationAudioList(
  tables: TenseTables,
  verbIds: readonly string[],
): { audioPath: string; spoken: string }[] {
  return verbIds.flatMap((verbId) => {
    const table = conjugationTable(tables, verbId);
    if (!table) return [];
    return table.rows.flatMap((row) =>
      GRAMMAR_TENSES.map((tense) => ({
        audioPath: conjugationAudioPath(verbId, tense, row.person.id),
        spoken: row.cells[tense].spoken,
      })),
    );
  });
}

/**
 * A Lektion topic as the grammar nodes use it. `lessonAudioDir` is the
 * Lektion's folder under public/audio, e.g. "a1-2/lektion-1".
 */
export function grammarTopicContent(
  topic: StoredGrammarTopic,
  tables: TenseTables,
  lessonAudioDir: string,
  hasAudio: (audioPath: string) => boolean = () => true,
): GrammarTopicContent {
  const examples = topic.examples.map((example) => {
    const audioPath = `${lessonAudioDir}/${example.filename}`;
    return {
      ...example,
      id: stripExtension(example.filename),
      audioPath: hasAudio(audioPath) ? audioPath : null,
    };
  });
  return {
    id: topic.id,
    titleVi: topic.titleVi,
    verbs: [...topic.verbs],
    tables: topic.verbs.flatMap((verb) => conjugationTable(tables, verb, hasAudio) ?? []),
    tips: topic.tips,
    examples,
    drills: topic.drills,
  };
}
