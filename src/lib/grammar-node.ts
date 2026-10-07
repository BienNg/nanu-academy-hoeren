/**
 * Grammar study and practice nodes (see docs/GRAMMAR_NODES.md).
 *
 * A topic's study node follows the class slides, part by part as authored in
 * the Lektion. Its practice node has one part per verb plus a mixed part.
 * Everything is dealt from a seed per Lektion and topic, so the browser, the
 * server and admin build the same cards and keys.
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { seedToRandom } from "./blitzrunde";
import { findWordIndex, blankScript } from "./grammar-gaps";
import {
  endingAfter,
  GRAMMAR_TENSES,
  verbForm,
  type ConjugationTable,
  type GrammarErrorDrill,
  type GrammarExample,
  type GrammarTense,
  type GrammarTip,
  type GrammarTopicContent,
  type GrammarTransformDrill,
  type StudyExample,
  type TenseTables,
} from "./grammar-lessons";
import type { McOption } from "./multiple-choice";
import {
  checkOrder,
  chipText,
  normalizeToken,
  tokenizeSentence,
  type OrderResult,
  type WordChip,
} from "./sentence-order";

export const GRAMMAR_CARD_KINDS = [
  "form-choice",
  "table-fill",
  "tense-transform",
  "bracket-order",
  "tense-spot",
  "pronoun-pairing",
  "error-check",
] as const;

export type GrammarCardKind = (typeof GRAMMAR_CARD_KINDS)[number];

export const GRAMMAR_CARD_LABEL: Record<GrammarCardKind, string> = {
  "form-choice": "Grammar: pick the form",
  "table-fill": "Grammar: fill the table",
  "tense-transform": "Grammar: change the tense",
  "bracket-order": "Grammar: Perfekt word order",
  "tense-spot": "Grammar: hear the tense",
  "pronoun-pairing": "Grammar: pronoun pairing",
  "error-check": "Grammar: correct or not",
};

/** Cards of one kind in a verb's practice part, and in the mixed part. */
export const VERB_PART_MIX: Record<GrammarCardKind, number> = {
  "table-fill": 2,
  "pronoun-pairing": 1,
  "form-choice": 5,
  "tense-transform": 3,
  "bracket-order": 2,
  "tense-spot": 2,
  "error-check": 2,
};

export const MIXED_PART_MIX: Record<GrammarCardKind, number> = {
  "table-fill": 2,
  "pronoun-pairing": 1,
  "form-choice": 4,
  "tense-transform": 2,
  "bracket-order": 2,
  "tense-spot": 2,
  "error-check": 2,
};

/** Warm-up kinds open a practice part in this order; the rest are shuffled after them. */
const WARM_UP_KINDS: readonly GrammarCardKind[] = ["table-fill", "pronoun-pairing"];

/** Blanks on a table-fill card. */
export const TABLE_FILL_BLANKS = 2;

/** Persons on a pairing card. Fewer when a tense has fewer distinct forms. */
export const GRAMMAR_PAIRING_MAX = 5;
const GRAMMAR_PAIRING_MIN = 4;

const TENSE_LABEL: Record<GrammarTense, string> = {
  praesens: "Präsens",
  perfekt: "Perfekt",
  praeteritum: "Präteritum",
};

// ---------------------------------------------------------------- helpers

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function lower(text: string): string {
  return text.toLowerCase();
}

/** `form` with the first letter cased like `like`. */
function caseLike(form: string, like: string): string {
  if (!form) return form;
  return /^\p{Lu}/u.test(like) ? form[0]!.toUpperCase() + form.slice(1) : form;
}

/** FNV-1a, so a part key is short and changes with its cards. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function grammarSeed(lessonKey: string, topicId: string, node: "study" | "practice"): string {
  return `grammar:${lessonKey}:${topicId}:${node}`;
}

/** Forms of one verb and tense for every person, in table order. Perfekt gives the aux. */
function tenseForms(tables: TenseTables, verbId: string, tense: GrammarTense): { personId: string; form: string }[] {
  return tables.persons.flatMap((person) => {
    const form = verbForm(tables, verbId, tense, person.id);
    return form ? [{ personId: person.id, form: form.words[0]! }] : [];
  });
}

function personLabel(tables: TenseTables, personId: string): string {
  return tables.persons.find((person) => person.id === personId)?.label ?? personId;
}

function correctOption(text: string): McOption {
  return { id: "correct", text, correct: true };
}

function wrongOptions(texts: readonly string[], explanation?: string): McOption[] {
  return texts.map((text, index) => ({
    id: `d${index}`,
    text,
    correct: false,
    ...(explanation ? { explanation } : {}),
  }));
}

/**
 * The one tip shown after a wrong answer: a tip about this tense, this verb's
 * own before a general one. None when no tip names the tense, so a miss never
 * shows every tip at once.
 */
export function ruleFor(tips: readonly GrammarTip[], verbId: string | null, tense: GrammarTense): string | undefined {
  const about = tips.filter((tip) => tip.tense === tense && (tip.verb === undefined || tip.verb === verbId));
  return (about.find((tip) => tip.verb === verbId) ?? about[0])?.textVi;
}

// ---------------------------------------------------------------- questions

/** A one-tap question: a German line with a blank and 2–4 options, for form-choice cards. */
export type GrammarChoiceQuestion = {
  /** German with GAP_BLANK where the answer goes. */
  prompt: string;
  /** Shown under the prompt: a translation or "du · Präteritum". */
  hintVi: string;
  options: McOption[];
  /** Shown after a wrong answer. */
  ruleVi?: string;
};

/**
 * The example with its verb blanked. Präteritum blanks the form, with the
 * other persons' forms as options. Perfekt blanks the aux, with the other
 * verb's aux first, so haben vs sein is what the card tests.
 */
export function exampleQuestion(
  tables: TenseTables,
  example: GrammarExample,
  random: () => number,
  ruleVi?: string,
): GrammarChoiceQuestion | null {
  const form = verbForm(tables, example.verb, example.tense, example.person);
  if (!form) return null;
  const target = form.words[0]!;
  const words = tokenizeSentence(example.script).map(chipText);
  const index = findWordIndex(words, target);
  if (index < 0) return null;
  const written = words[index]!;

  // A form is no wrong answer when its person's pronoun is in the sentence:
  // "Sie ___ im Urlaub gewesen" could be "sind" (Sie = they, you).
  const sentenceWords = new Set(words.map(lower));
  const fitsSentence = new Set(
    tables.persons
      .filter((person) => person.label.split("/").some((pronoun) => sentenceWords.has(lower(pronoun))))
      .flatMap((person) => verbForm(tables, example.verb, example.tense, person.id)?.words[0] ?? [])
      .map(lower),
  );

  let wrong: string[];
  if (example.tense === "perfekt") {
    // The other aux for the same person first, so haben vs sein is what the card tests.
    const aux = tables.verbs[example.verb]?.aux;
    const otherAux = unique(Object.values(tables.verbs).map((verb) => verb.aux)).filter((id) => id !== aux);
    const firstWrong = otherAux.flatMap((id) => verbForm(tables, id, "praesens", example.person)?.words ?? []);
    const sameAux = aux ? tenseForms(tables, aux, "praesens").map((entry) => entry.form) : [];
    wrong = unique([...firstWrong, ...shuffle(sameAux, random)]);
  } else {
    wrong = shuffle(unique(tenseForms(tables, example.verb, example.tense).map((entry) => entry.form)), random);
  }
  wrong = wrong.filter((text) => lower(text) !== lower(target) && !fitsSentence.has(lower(text)));
  if (wrong.length === 0) return null;
  const distractors = wrong.slice(0, 3).map((text) => caseLike(text, written));
  return {
    prompt: blankScript(example.script, index),
    hintVi: example.translationVi,
    options: shuffle([correctOption(written), ...wrongOptions(distractors, ruleVi)], random),
    ...(ruleVi ? { ruleVi } : {}),
  };
}

export function checkChoice(options: readonly McOption[], selectedId: string | null): { accuracy: number; correctId: string } {
  const right = options.find((option) => option.correct);
  return { accuracy: right && right.id === selectedId ? 100 : 0, correctId: right?.id ?? "" };
}

// ---------------------------------------------------------------- study node

/** Tense columns of a study table, in the class slides' order. */
export const STUDY_TABLE_TENSES: readonly GrammarTense[] = ["praesens", "perfekt", "praeteritum"];

/**
 * Steps of a study table, one more column per Continue: pronouns, Präsens,
 * Perfekt, a question mark over Präteritum, then the Präteritum forms.
 */
export const TABLE_STEPS = 5;

export type StudyTableCell = {
  text: string;
  /** The Präteritum ending, bold on the slides: "st" in warst, "en" in waren. */
  highlight: string;
  audioPath: string | null;
  spoken: string;
};

export type StudyTableRow = { personLabel: string; cells: Record<GrammarTense, StudyTableCell> };

/** A Vietnamese line with the word that says its tense. */
export type StudyCue = { vi: string; markerVi?: string; tense: GrammarTense };

export type GrammarStudyScreen =
  | { kind: "overview"; key: string }
  | {
      kind: "known";
      key: string;
      rows: { praesens: string; perfekt: string; today: boolean }[];
      /** The second step circles today's column and says we learn it now. */
      callout: boolean;
    }
  | { kind: "table"; key: string; verb: string; step: number; rows: StudyTableRow[] }
  /** The first `shown` rows are visible; `newest` is the row this step added, null when shown whole. */
  | { kind: "beispiele"; key: string; rows: StudyExample[]; shown: number; newest: number | null }
  | {
      kind: "choice";
      key: string;
      cue: StudyCue;
      /** German with GAP_BLANK. Null: the options are whole sentences. */
      prompt: string | null;
      options: McOption[];
      script: string;
      audioPath: string | null;
      ruleVi: string;
    }
  | {
      kind: "translate";
      key: string;
      cue: StudyCue;
      answers: string[];
      bank: WordChip[];
      hints: { de: string; vi: string }[];
      audioPaths: (string | null)[];
      ruleVi: string;
    };

/** Screens that ask something; the rest are read, then continued. */
export type GrammarStudyTask = Extract<GrammarStudyScreen, { kind: "choice" | "translate" }>;

export function isStudyTask(screen: GrammarStudyScreen): screen is GrammarStudyTask {
  return screen.kind === "choice" || screen.kind === "translate";
}

export type GrammarStudyPart = {
  /** Stored once the part is finished. */
  key: string;
  titleVi: string;
  screens: GrammarStudyScreen[];
};

/** The ending as the slides mark it: the wir form ends in "en" (hatten, waren), not just "n". */
function slideEnding(form: string, base: string): string {
  const ending = endingAfter(form, base);
  return ending === "n" && form.endsWith("en") ? "en" : ending;
}

function studyTableRows(table: ConjugationTable): StudyTableRow[] {
  const base = table.rows[0]?.cells.praeteritum.text ?? "";
  return table.rows.map((row) => {
    const cells = {} as Record<GrammarTense, StudyTableCell>;
    for (const tense of GRAMMAR_TENSES) {
      const cell = row.cells[tense];
      cells[tense] = {
        text: cell.text,
        highlight: tense === "praeteritum" ? slideEnding(cell.text, base) : cell.highlight,
        audioPath: cell.audioPath,
        spoken: cell.spoken,
      };
    }
    return { personLabel: row.person.label, cells };
  });
}

function cueOf(screen: { vi: string; markerVi?: string; tense: GrammarTense }): StudyCue {
  return { vi: screen.vi, tense: screen.tense, ...(screen.markerVi ? { markerVi: screen.markerVi } : {}) };
}

/**
 * The study node as taught on the class slides: the topic's authored parts,
 * with a table expanded into TABLE_STEPS screens and a step-by-step Beispiele
 * into one screen per line.
 */
export function grammarStudyParts(lessonKey: string, topic: GrammarTopicContent): GrammarStudyPart[] {
  return topic.study.map((part) => {
    const screens: GrammarStudyScreen[] = [];
    part.screens.forEach((screen, index) => {
      const key = `${topic.id}:${part.key}:${index}`;
      switch (screen.kind) {
        case "overview":
          screens.push({ kind: "overview", key });
          break;
        case "known":
          screens.push({ kind: "known", key: `${key}:1`, rows: screen.rows, callout: false });
          screens.push({ kind: "known", key: `${key}:2`, rows: screen.rows, callout: true });
          break;
        case "table": {
          const table = topic.tables.find((entry) => entry.verb === screen.verb);
          if (!table) break;
          const rows = studyTableRows(table);
          for (let step = 1; step <= TABLE_STEPS; step += 1) {
            screens.push({ kind: "table", key: `${key}:${step}`, verb: screen.verb, step, rows });
          }
          break;
        }
        case "beispiele": {
          const stepped = screen.reveal === "step";
          for (let shown = stepped ? 1 : screen.rows.length; shown <= screen.rows.length; shown += 1) {
            const newest = stepped ? shown - 1 : null;
            screens.push({ kind: "beispiele", key: `${key}:${shown}`, rows: screen.rows, shown, newest });
          }
          break;
        }
        case "choice":
          screens.push({
            kind: "choice",
            key,
            cue: cueOf(screen),
            prompt: screen.prompt ?? null,
            // The slides' A/B order, not shuffled.
            options: screen.options.map((text, option) => ({ id: `o${option}`, text, correct: text === screen.answer })),
            script: screen.script,
            audioPath: screen.audioPath,
            ruleVi: screen.whyVi,
          });
          break;
        case "translate": {
          const random = seedToRandom(`${grammarSeed(lessonKey, topic.id, "study")}:${key}`);
          const distractors = screen.distractors ?? [];
          screens.push({
            kind: "translate",
            key,
            cue: cueOf(screen),
            answers: screen.answers,
            bank: chipBank(screen.answers[0] ?? "", distractors, distractors.length, random),
            hints: screen.hints ?? [],
            audioPaths: screen.audioPaths,
            ruleVi: screen.whyVi,
          });
          break;
        }
      }
    });
    return { key: part.key, titleVi: part.titleVi, screens };
  });
}

/** Right when the chips match any of the answers. `answer` is the one matched, or the first. */
export function checkStudyTranslate(
  selected: readonly string[],
  answers: readonly string[],
): { accuracy: number; answer: string } {
  const right = answers.find((answer) => checkOrder(selected, answer).accuracy === 100);
  const fallback = answers[0] ?? "";
  return right
    ? { accuracy: 100, answer: right }
    : { accuracy: checkOrder(selected, fallback).accuracy, answer: fallback };
}

// ---------------------------------------------------------------- practice node

export type TableFillRow = {
  personLabel: string;
  /** Null where the student fills in. */
  text: string | null;
  /** The form that belongs in the row. */
  answer: string;
};

export type GrammarPairingItem = { id: string; person: string; form: string };

type CardBase = {
  key: string;
  /** The verb the card practices. Null when it mixes verbs. */
  verb: string | null;
  /** The German sentence the card is built on, so two cards of one sentence are not dealt in a row. */
  sentence: string | null;
  ruleVi?: string;
};

export type GrammarCard =
  | (CardBase & { kind: "form-choice"; question: GrammarChoiceQuestion; audioPath: string | null })
  | (CardBase & { kind: "table-fill"; tense: GrammarTense; rows: TableFillRow[]; bank: WordChip[] })
  | (CardBase & { kind: "tense-transform"; from: string; tense: GrammarTense; script: string; translationVi: string; bank: WordChip[] })
  | (CardBase & { kind: "bracket-order"; script: string; translationVi: string; bank: WordChip[] })
  | (CardBase & { kind: "tense-spot"; script: string; translationVi: string; audioPath: string; options: McOption[] })
  | (CardBase & { kind: "pronoun-pairing"; tense: GrammarTense; items: GrammarPairingItem[] })
  | (CardBase & { kind: "error-check"; script: string; fix: string | null });

export type GrammarPracticePart = {
  /** Hash of the card keys: a saved key stops matching once the cards change. */
  key: string;
  /** The verb of a verb part. Null on the mixed part. */
  verb: string | null;
  cards: GrammarCard[];
};

/** Sentence chips plus distractors, shuffled so the bank never starts as the answer. */
function chipBank(
  script: string,
  distractors: readonly string[],
  maxExtra: number,
  random: () => number,
): WordChip[] {
  const words = tokenizeSentence(script);
  const inSentence = new Set(words.map(normalizeToken));
  const extra = unique(distractors.map(chipText))
    .filter((word) => word && !inSentence.has(normalizeToken(word)))
    .slice(0, maxExtra);
  const chips: WordChip[] = [
    ...words.flatMap((text, index) => {
      const label = chipText(text);
      return label ? [{ id: `w${index}`, text: label }] : [];
    }),
    ...extra.map((text, index) => ({ id: `d${index}`, text })),
  ];
  const answer = words.map(normalizeToken).join(" ");
  let bank = shuffle(chips, random);
  for (let tries = 0; tries < 5; tries += 1) {
    const start = bank.slice(0, words.length).map((chip) => normalizeToken(chip.text)).join(" ");
    if (start !== answer) break;
    bank = shuffle(chips, random);
  }
  return bank;
}

function formChoiceCards(
  tables: TenseTables,
  topic: GrammarTopicContent,
  examples: readonly GrammarExample[],
  random: () => number,
): GrammarCard[] {
  return examples.flatMap((example) => {
    const rule = ruleFor(topic.tips, example.verb, example.tense);
    const question = exampleQuestion(tables, example, random, rule);
    if (!question) return [];
    return [
      {
        kind: "form-choice" as const,
        key: `${topic.id}:form-choice:${example.id}`,
        verb: example.verb,
        sentence: example.script,
        question,
        audioPath: example.audioPath,
        ...(rule ? { ruleVi: rule } : {}),
      },
    ];
  });
}

/** A Präsens or Präteritum table of one verb with TABLE_FILL_BLANKS rows blanked. */
function tableFillCard(
  tables: TenseTables,
  topic: GrammarTopicContent,
  verbId: string,
  tense: GrammarTense,
  random: () => number,
): GrammarCard | null {
  if (tense === "perfekt") return null;
  const forms = tenseForms(tables, verbId, tense);
  if (forms.length <= TABLE_FILL_BLANKS) return null;
  // A form two persons share (ich hatte, er hatte) would be shown in the other row, so those go last.
  const shared = (form: string) => forms.filter((entry) => entry.form === form).length > 1;
  const order = [
    ...shuffle(forms.filter((entry) => !shared(entry.form)), random),
    ...shuffle(forms.filter((entry) => shared(entry.form)), random),
  ];
  const blanks = new Set(order.slice(0, TABLE_FILL_BLANKS).map((entry) => entry.personId));
  const rows = forms.map((entry) => ({
    personLabel: personLabel(tables, entry.personId),
    text: blanks.has(entry.personId) ? null : entry.form,
    answer: entry.form,
  }));
  const answers = rows.filter((row) => row.text === null).map((row) => row.answer);
  // Distractors: this tense's forms that are not answers, then the other stored tense.
  const otherTense: GrammarTense = tense === "praesens" ? "praeteritum" : "praesens";
  const pool = unique([
    ...shuffle(forms.map((entry) => entry.form).filter((form) => !answers.includes(form)), random),
    ...shuffle(tenseForms(tables, verbId, otherTense).map((entry) => entry.form), random),
  ]).filter((form) => !answers.includes(form));
  const chips = shuffle(
    [...answers, ...pool.slice(0, 2)].map((text, index) => ({ id: `c${index}`, text })),
    random,
  );
  const rule = ruleFor(topic.tips, verbId, tense);
  return {
    kind: "table-fill",
    key: `${topic.id}:table-fill:${verbId}:${tense}:${[...blanks].sort().join("+")}`,
    verb: verbId,
    sentence: null,
    tense,
    rows,
    bank: chips,
    ...(rule ? { ruleVi: rule } : {}),
  };
}

/** Persons with distinct forms in `tense`, so every pair has one right answer. */
function pairingCard(
  tables: TenseTables,
  topic: GrammarTopicContent,
  verbId: string,
  random: () => number,
): GrammarCard | null {
  for (const tense of shuffle(GRAMMAR_TENSES, random)) {
    const seen = new Set<string>();
    const items: GrammarPairingItem[] = [];
    for (const person of tables.persons) {
      const form = verbForm(tables, verbId, tense, person.id);
      if (!form || seen.has(form.text)) continue;
      seen.add(form.text);
      items.push({ id: person.id, person: person.label, form: form.text });
    }
    if (items.length < GRAMMAR_PAIRING_MIN) continue;
    const picked = shuffle(items, random).slice(0, GRAMMAR_PAIRING_MAX);
    return {
      kind: "pronoun-pairing",
      key: `${topic.id}:pronoun-pairing:${verbId}:${tense}`,
      verb: verbId,
      sentence: null,
      tense,
      items: picked,
    };
  }
  return null;
}

function transformCard(
  tables: TenseTables,
  topic: GrammarTopicContent,
  drill: GrammarTransformDrill,
  index: number,
  random: () => number,
): GrammarCard {
  // The Präsens words left behind and another form of the target tense are the traps.
  const fromWords = tokenizeSentence(drill.from).map(chipText);
  const forms = drill.tense === "perfekt"
    ? Object.values(tables.verbs).map((verb) => verb.partizip)
    : tenseForms(tables, drill.verb, drill.tense).map((entry) => entry.form);
  const distractors = [...fromWords, ...shuffle(forms, random)];
  const rule = ruleFor(topic.tips, drill.verb, drill.tense);
  return {
    kind: "tense-transform",
    key: `${topic.id}:tense-transform:${index}`,
    verb: drill.verb,
    sentence: drill.to,
    from: drill.from,
    tense: drill.tense,
    script: drill.to,
    translationVi: drill.translationVi,
    bank: chipBank(drill.to, distractors, 2, random),
    ...(rule ? { ruleVi: rule } : {}),
  };
}

/** Perfekt sentence from Vietnamese, with the other verb's Partizip and aux as traps. */
function bracketCard(
  tables: TenseTables,
  topic: GrammarTopicContent,
  source: { id: string; verb: string; person: string | null; script: string; translationVi: string },
  random: () => number,
): GrammarCard | null {
  const verb = tables.verbs[source.verb];
  if (!verb) return null;
  const traps: string[] = [];
  for (const [id, other] of Object.entries(tables.verbs)) {
    if (id === source.verb) continue;
    traps.push(other.partizip);
    if (source.person && other.aux !== verb.aux) {
      const aux = verbForm(tables, other.aux, "praesens", source.person)?.words[0];
      if (aux) traps.push(aux);
    }
  }
  const rule = ruleFor(topic.tips, source.verb, "perfekt");
  return {
    kind: "bracket-order",
    key: `${topic.id}:bracket-order:${source.id}`,
    verb: source.verb,
    sentence: source.script,
    script: source.script,
    translationVi: source.translationVi,
    bank: chipBank(source.script, shuffle(traps, random), 2, random),
    ...(rule ? { ruleVi: rule } : {}),
  };
}

function tenseSpotCard(topic: GrammarTopicContent, example: GrammarExample, random: () => number): GrammarCard | null {
  if (!example.audioPath) return null;
  const options = shuffle(
    GRAMMAR_TENSES.map((tense) => ({
      id: tense,
      text: TENSE_LABEL[tense],
      correct: tense === example.tense,
    })),
    random,
  );
  return {
    kind: "tense-spot",
    key: `${topic.id}:tense-spot:${example.id}`,
    verb: example.verb,
    sentence: example.script,
    script: example.script,
    translationVi: example.translationVi,
    audioPath: example.audioPath,
    options,
  };
}

function errorCard(topic: GrammarTopicContent, drill: GrammarErrorDrill, index: number): GrammarCard {
  return {
    kind: "error-check",
    key: `${topic.id}:error-check:${index}`,
    verb: drill.verb,
    sentence: drill.fix ?? drill.script,
    script: drill.script,
    fix: drill.fix ?? null,
    ...(drill.whyVi ? { ruleVi: drill.whyVi } : {}),
  };
}

/** Takes one item per verb in turn, so a mixed part draws from every verb. Order within a verb is kept. */
function alternateVerbs<T extends { verb: string }>(items: readonly T[], verbs: readonly string[]): T[] {
  const queues = verbs.map((verb) => items.filter((item) => item.verb === verb));
  const out: T[] = [];
  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/** Every card the topic can deal for these verbs, by kind, before the mix is applied. */
function candidateCards(
  tables: TenseTables,
  topic: GrammarTopicContent,
  verbs: readonly string[],
  random: () => number,
): Record<GrammarCardKind, GrammarCard[]> {
  const inVerbs = <T extends { verb: string }>(items: readonly T[]) =>
    items.filter((item) => verbs.includes(item.verb));
  const examples = alternateVerbs(shuffle(inVerbs(topic.examples), random), verbs);
  const drills = topic.drills.map((drill, index) => ({ drill, index, verb: drill.verb }));
  const transforms = alternateVerbs(
    shuffle(
      drills.filter(
        (entry): entry is { drill: GrammarTransformDrill; index: number; verb: string } => entry.drill.type === "transform",
      ),
      random,
    ),
    verbs,
  );
  const errors = alternateVerbs(
    shuffle(
      drills.filter((entry): entry is { drill: GrammarErrorDrill; index: number; verb: string } => entry.drill.type === "error"),
      random,
    ),
    verbs,
  );

  // Listening goes to examples with audio; the rest of the examples feed form-choice first.
  const withAudio = examples.filter((example) => example.audioPath);
  const spotted = new Set(withAudio.slice(0, 2).map((example) => example.id));
  const formExamples = [
    ...examples.filter((example) => !spotted.has(example.id)),
    ...examples.filter((example) => spotted.has(example.id)),
  ];

  const bracketSources = [
    ...examples
      .filter((example) => example.tense === "perfekt")
      .map((example) => ({ ...example, person: example.person as string | null })),
    ...transforms
      .filter((entry) => entry.drill.tense === "perfekt")
      .map((entry) => ({
        id: `drill-${entry.index}`,
        verb: entry.drill.verb,
        person: null,
        script: entry.drill.to,
        translationVi: entry.drill.translationVi,
      })),
  ];

  const tableFills = shuffle(verbs, random).flatMap((verbId) =>
    (["praeteritum", "praesens"] as const).flatMap((tense) => tableFillCard(tables, topic, verbId, tense, random) ?? []),
  );
  // One table per verb first, so a mixed part shows both verbs.
  const isPraeteritum = (card: GrammarCard) => card.kind === "table-fill" && card.tense === "praeteritum";
  const tableOrder = [...tableFills.filter(isPraeteritum), ...tableFills.filter((card) => !isPraeteritum(card))];

  return {
    "table-fill": tableOrder,
    "pronoun-pairing": shuffle(verbs, random).flatMap((verbId) => pairingCard(tables, topic, verbId, random) ?? []),
    "form-choice": formChoiceCards(tables, topic, formExamples, random),
    "tense-transform": transforms.map((entry) => transformCard(tables, topic, entry.drill, entry.index, random)),
    "bracket-order": alternateVerbs(shuffle(bracketSources, random), verbs).flatMap(
      (source) => bracketCard(tables, topic, source, random) ?? [],
    ),
    "tense-spot": withAudio.flatMap((example) => tenseSpotCard(topic, example, random) ?? []),
    "error-check": errors.map((entry) => errorCard(topic, entry.drill, entry.index)),
  };
}

/**
 * Shuffles `cards` so no two cards in a row practice the same sentence, when
 * the cards allow it.
 */
export function spreadSentences(cards: readonly GrammarCard[], random: () => number): GrammarCard[] {
  const rest = shuffle(cards, random);
  const out: GrammarCard[] = [];
  while (rest.length > 0) {
    const previous = out[out.length - 1]?.sentence ?? null;
    const at = rest.findIndex((card) => card.sentence === null || card.sentence !== previous);
    out.push(...rest.splice(at < 0 ? 0 : at, 1));
  }
  return out;
}

function dealPart(
  candidates: Record<GrammarCardKind, GrammarCard[]>,
  mix: Record<GrammarCardKind, number>,
  random: () => number,
): GrammarCard[] {
  const take = (kind: GrammarCardKind) => candidates[kind].slice(0, mix[kind]);
  const warmUp = WARM_UP_KINDS.flatMap(take);
  const main = GRAMMAR_CARD_KINDS.filter((kind) => !WARM_UP_KINDS.includes(kind)).flatMap(take);
  return [...warmUp, ...spreadSentences(main, random)];
}

/**
 * The practice node of a topic: one part per verb, then a mixed part when the
 * topic has more than one verb. Empty parts are dropped.
 */
export function grammarPracticeParts(
  lessonKey: string,
  topic: GrammarTopicContent,
  tables: TenseTables,
): GrammarPracticePart[] {
  const random = seedToRandom(grammarSeed(lessonKey, topic.id, "practice"));
  const plans: { verb: string | null; verbs: string[]; mix: Record<GrammarCardKind, number> }[] = topic.verbs.map(
    (verb) => ({ verb, verbs: [verb], mix: VERB_PART_MIX }),
  );
  if (topic.verbs.length > 1) plans.push({ verb: null, verbs: [...topic.verbs], mix: MIXED_PART_MIX });

  return plans.flatMap((plan) => {
    const cards = dealPart(candidateCards(tables, topic, plan.verbs, random), plan.mix, random);
    if (cards.length === 0) return [];
    return [{ key: `g${hashText(cards.map((card) => card.key).join(","))}`, verb: plan.verb, cards }];
  });
}

// ---------------------------------------------------------------- answers

/** Chip texts placed into the blanks, in row order. All right is 100, otherwise the share right, below 100. */
export function checkTableFill(rows: readonly TableFillRow[], placed: readonly (string | null)[]): {
  accuracy: number;
  blanks: { answer: string; placed: string | null; correct: boolean }[];
} {
  const blanks = rows
    .filter((row) => row.text === null)
    .map((row, index) => {
      const given = placed[index] ?? null;
      return { answer: row.answer, placed: given, correct: given !== null && lower(given) === lower(row.answer) };
    });
  const right = blanks.filter((blank) => blank.correct).length;
  const accuracy = blanks.length === 0 || right === blanks.length ? 100 : Math.min(99, Math.round((right / blanks.length) * 100));
  return { accuracy, blanks };
}

/** Same check as sentence-order cards. Any one of `script` counts as right. */
export function checkGrammarOrder(selected: readonly string[], script: string | readonly string[]): OrderResult {
  const scripts = typeof script === "string" ? [script] : script;
  const results = scripts.map((candidate) => checkOrder(selected, candidate));
  return results.find((result) => result.accuracy === 100) ?? results[0] ?? { accuracy: 0, words: [] };
}

/**
 * A pair is right when the form belongs to the person. Matched by text, since
 * two persons can share a form (ich hatte, er hatte).
 */
export function checkGrammarPairing(
  items: readonly GrammarPairingItem[],
  pairs: readonly { personId: string; formId: string }[],
): { accuracy: number; pairs: { personId: string; formId: string; correct: boolean }[] } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const checked = pairs
    .filter((pair) => byId.has(pair.personId) && byId.has(pair.formId))
    .map((pair) => ({ ...pair, correct: byId.get(pair.personId)!.form === byId.get(pair.formId)!.form }));
  const right = checked.filter((pair) => pair.correct).length;
  return { accuracy: items.length > 0 ? Math.round((right / items.length) * 100) : 0, pairs: checked };
}

export function checkErrorCheck(fix: string | null, saidCorrect: boolean): { accuracy: number } {
  return { accuracy: saidCorrect === (fix === null) ? 100 : 0 };
}

// ---------------------------------------------------------------- layout

/** What progress and XP need from a topic's nodes: part keys and sizes. */
export type GrammarNodeLayout = {
  topicId: string;
  titleVi: string;
  studyParts: { key: string; titleVi: string; screenCount: number }[];
  practiceParts: { key: string; verb: string | null; cardCount: number }[];
};

export function grammarNodeLayout(
  lessonKey: string,
  topic: GrammarTopicContent,
  tables: TenseTables,
): GrammarNodeLayout {
  return {
    topicId: topic.id,
    titleVi: topic.titleVi,
    studyParts: grammarStudyParts(lessonKey, topic).map((part) => ({
      key: part.key,
      titleVi: part.titleVi,
      screenCount: part.screens.length,
    })),
    practiceParts: grammarPracticeParts(lessonKey, topic, tables).map((part) => ({
      key: part.key,
      verb: part.verb,
      cardCount: part.cards.length,
    })),
  };
}

// ---------------------------------------------------------------- progress

export type GrammarNodeKind = "study" | "practice";

/** How a finished part is stored in `LearnProgress.grammarPartKeys`. */
export function grammarPartStorageKey(topicId: string, partKey: string): string {
  return `${topicId}:${partKey}`;
}

/** Stored keys of one node's parts, in order. */
export function grammarNodeKeys(layout: GrammarNodeLayout, kind: GrammarNodeKind): string[] {
  const parts = kind === "study" ? layout.studyParts : layout.practiceParts;
  return parts.map((part) => grammarPartStorageKey(layout.topicId, part.key));
}

/** Done state of each part of one grammar node. */
export function grammarNodeProgress(
  layout: GrammarNodeLayout,
  kind: GrammarNodeKind,
  doneKeys: readonly string[],
): { partDone: boolean[]; partsDone: number; done: boolean } {
  const done = new Set(doneKeys);
  const partDone = grammarNodeKeys(layout, kind).map((key) => done.has(key));
  const partsDone = partDone.filter(Boolean).length;
  return { partDone, partsDone, done: partDone.length > 0 && partsDone === partDone.length };
}

/** Every grammar part of a Lektion is finished, counting `justDone` as finished too. */
export function grammarLessonDone(
  layouts: readonly GrammarNodeLayout[],
  doneKeys: readonly string[],
  justDone?: string,
): boolean {
  const keys = justDone ? [...doneKeys, justDone] : doneKeys;
  return layouts.every(
    (layout) =>
      grammarNodeProgress(layout, "study", keys).done && grammarNodeProgress(layout, "practice", keys).done,
  );
}

/**
 * Trail id of a grammar node: `<lessonId>-grammar-study-<topicId>`. Never
 * matches the Study/Practice ids, which end in "-study" or "-listening".
 */
export function grammarActivityId(lessonId: string, kind: GrammarNodeKind, topicId: string): string {
  return `${lessonId}-grammar-${kind}-${topicId}`;
}

export function grammarNodeFromActivityId(id: string): { kind: GrammarNodeKind; topicId: string } | null {
  const match = /-grammar-(study|practice)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id);
  if (!match) return null;
  return { kind: match[1] === "study" ? "study" : "practice", topicId: match[2]! };
}
