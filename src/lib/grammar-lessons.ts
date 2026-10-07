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
  /** Only after a wrong answer about this verb. Omitted: any verb. */
  verb?: string;
  /** The tense this tip explains. Only a tip with a tense is shown after a wrong answer about that tense. */
  tense?: GrammarTense;
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

/** A Vietnamese line whose tense word (đang, đã) is colored like the German tense. */
type VietnameseCue = {
  vi: string;
  /** The word in `vi` that says the tense, e.g. "đã". */
  markerVi?: string;
  tense: GrammarTense;
};

/** One line of a Beispiele screen: Vietnamese, then the German in one tense. */
export type StoredStudyExample = VietnameseCue & {
  de: string;
  /** Words of `de` colored as the verb, e.g. ["bin", "gewesen"]. */
  verbWords: string[];
  filename: string;
  /** What the audio says when it differs from `de`, e.g. "zehn Euro" for "10€". */
  say?: string;
};

export type StoredStudyScreen =
  /** The three tenses, and which past tense is spoken and which written. */
  | { kind: "overview" }
  /** Verbs whose Präsens and Perfekt the class knows. `today`: its Präteritum is taught now. */
  | { kind: "known"; rows: { praesens: string; perfekt: string; today: boolean }[] }
  /** The verb's table, filled in a column per step. */
  | { kind: "table"; verb: string }
  /** `reveal: "step"` shows one more line per Continue. */
  | { kind: "beispiele"; reveal: "all" | "step"; rows: StoredStudyExample[] }
  /** Pick the form or sentence. `prompt` is German with GAP_BLANK; without it the options are whole sentences. */
  | (VietnameseCue & {
      kind: "choice";
      prompt?: string;
      options: string[];
      answer: string;
      /** The whole right sentence, read out after the answer. */
      script: string;
      filename: string;
      whyVi: string;
    })
  /** Build the German from word chips. Every entry in `answers` is right. */
  | (VietnameseCue & {
      kind: "translate";
      answers: string[];
      /** Extra chips that do not belong in the answer. */
      distractors?: string[];
      hints?: { de: string; vi: string }[];
      /** Audio of `answers[0]`. */
      filename: string;
      /** Audio of the answers after the first, in the same order. */
      moreFilenames?: string[];
      whyVi: string;
    });

/** A study part as taught on the class slides. Its key is stored once it is finished. */
export type StoredStudyPart = {
  key: string;
  titleVi: string;
  screens: StoredStudyScreen[];
};

export type StoredGrammarTopic = {
  id: string;
  titleVi: string;
  /** Verbs with a practice part each, in this order. */
  verbs: string[];
  tips: GrammarTip[];
  examples: StoredGrammarExample[];
  drills: GrammarDrill[];
  /** The study node, screen by screen. */
  study: StoredStudyPart[];
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
  study: StudyPartContent[];
};

/** A stored line with its file resolved: `audioPath` is null until the MP3 exists. */
type WithAudio<T extends { filename: string }> = Omit<T, "filename"> & { audioPath: string | null };

export type StudyExample = WithAudio<StoredStudyExample>;
type StoredChoice = Extract<StoredStudyScreen, { kind: "choice" }>;
type StoredTranslate = Extract<StoredStudyScreen, { kind: "translate" }>;

export type StudyScreenContent =
  | Exclude<StoredStudyScreen, { kind: "beispiele" | "choice" | "translate" }>
  | { kind: "beispiele"; reveal: "all" | "step"; rows: StudyExample[] }
  | WithAudio<StoredChoice>
  | (Omit<StoredTranslate, "filename" | "moreFilenames"> & { audioPaths: (string | null)[] });

export type StudyPartContent = { key: string; titleVi: string; screens: StudyScreenContent[] };

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
  const resolve = (filename: string): string | null => {
    const audioPath = `${lessonAudioDir}/${filename}`;
    return hasAudio(audioPath) ? audioPath : null;
  };
  const withAudio = <T extends { filename: string }>({ filename, ...rest }: T): WithAudio<T> => ({
    ...rest,
    audioPath: resolve(filename),
  });
  const examples = topic.examples.map((example) => ({
    ...example,
    id: stripExtension(example.filename),
    audioPath: resolve(example.filename),
  }));
  const study = topic.study.map((part) => ({
    key: part.key,
    titleVi: part.titleVi,
    screens: part.screens.map((screen): StudyScreenContent => {
      switch (screen.kind) {
        case "beispiele":
          return { ...screen, rows: screen.rows.map(withAudio) };
        case "choice":
          return withAudio(screen);
        case "translate": {
          const { filename, moreFilenames, ...rest } = screen;
          return { ...rest, audioPaths: [filename, ...(moreFilenames ?? [])].map(resolve) };
        }
        default:
          return screen;
      }
    }),
  }));
  return {
    id: topic.id,
    titleVi: topic.titleVi,
    verbs: [...topic.verbs],
    tables: topic.verbs.flatMap((verb) => conjugationTable(tables, verb, hasAudio) ?? []),
    tips: topic.tips,
    examples,
    drills: topic.drills,
    study,
  };
}
