/**
 * Grammar gap cards: one word of a sentence is blanked, the Vietnamese
 * translation is shown, and the student picks the right form from chips.
 *
 * Grammar lives in data, not code. src/data/grammar/topics.json lists topics,
 * each with sets of forms that compete with each other (mein/meine, wo/woher/
 * wohin), and src/data/grammar/verbs.json holds conjugation tables. Any
 * sentence containing a form of a topic unlocked for its lesson becomes a gap,
 * with the other forms as distractors. A clip can opt out (`noGaps`) or ask
 * for a gap explicitly (`gaps`).
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { MC_OPTION_COUNT, type McOption } from "./multiple-choice";
import { chipText, tokenizeSentence } from "./sentence-order";

export type GrammarTopic = {
  id: string;
  labelVi: string;
  /** First lesson the topic applies to, as "levelSlug/chapterSlug". */
  from: string;
  /** Gap every matching sentence. False: only clips that list the word in `gaps`. */
  auto?: boolean;
  /** Only gap the word when the next word is a noun (capitalized). */
  onlyBeforeNoun?: boolean;
  /** Short rule shown after a wrong answer. */
  ruleVi?: string;
  /** Forms that compete with each other. Matched without case. */
  sets?: string[][];
  /** Build the sets from the verb table: one set per verb. */
  verbs?: boolean;
};

/** Infinitive → person → form, e.g. essen → { du: "isst" }. */
export type VerbTable = Record<string, Record<string, string>>;

/** A gap a lesson clip asks for in its JSON. */
export type ClipGapRequest = {
  word: string;
  /** Topic whose sets give the options. Omitted: every unlocked topic. */
  topic?: string;
  /** Options to use instead of a topic, the right word included or not. */
  options?: string[];
  /** Overrides the topic's rule after a wrong answer. */
  whyVi?: string;
  /** Which occurrence of `word` to blank, from 1. Default 1. */
  occurrence?: number;
};

export type GapSourceClip = {
  script: string;
  translationVi?: string;
  gaps?: readonly ClipGapRequest[];
  /** True: never gap this clip. A list: never gap these words. */
  noGaps?: boolean | readonly string[];
};

/** One word of a clip that can be blanked. */
export type GrammarGap = {
  /** Token index in the script. */
  index: number;
  /** The word as written, without edge punctuation. */
  word: string;
  /** Topic the options came from. Null for explicit options. */
  topicId: string | null;
  labelVi: string;
  /** Every wrong form, cased like `word`. Cards show up to three. */
  distractors: string[];
  ruleVi?: string;
  /** The topic is introduced by this clip's own lesson. Dealt first. */
  fresh?: true;
};

/** A one-word clip has nothing left to read once the word is blanked. */
export const MIN_GAP_WORDS = 2;

export const GAP_BLANK = "____";

const FALLBACK_LABEL_VI = "Ngữ pháp";

function lower(word: string): string {
  return word.toLowerCase();
}

function isCapitalized(word: string): boolean {
  return /^\p{Lu}/u.test(word);
}

/** `form` with the first letter cased like `like`. */
function caseLike(form: string, like: string): string {
  if (!form) return form;
  return isCapitalized(like) ? form[0]!.toUpperCase() + form.slice(1) : form;
}

function isSentenceStart(tokens: readonly string[], index: number): boolean {
  if (index === 0) return true;
  return /[.?!]["'“”»]*$/.test(tokens[index - 1] ?? "");
}

/** The topic's sets, lowercased. Verb topics get one set per verb. */
export function topicSets(topic: GrammarTopic, verbs: VerbTable): string[][] {
  const sets = (topic.sets ?? []).map((set) => set.map(lower));
  if (topic.verbs) {
    for (const forms of Object.values(verbs)) {
      sets.push([...new Set(Object.values(forms).map(lower))]);
    }
  }
  return sets.filter((set) => set.length > 1);
}

/** Topics whose `from` lesson is at or before `lessonKey` in `lessonOrder`. Unknown lessons unlock nothing. */
export function topicsForLesson(
  topics: readonly GrammarTopic[],
  lessonKey: string,
  lessonOrder: readonly string[],
): GrammarTopic[] {
  const rank = lessonOrder.indexOf(lessonKey);
  if (rank < 0) return [];
  return topics.filter((topic) => {
    const from = lessonOrder.indexOf(topic.from);
    return from >= 0 && from <= rank;
  });
}

/**
 * The context rules a topic adds on top of matching a form: a noun must
 * follow, and a verb form never matches a capitalized word mid-sentence
 * (that is a noun: das Essen, das Leben).
 */
function contextFits(topic: GrammarTopic, tokens: readonly string[], words: readonly string[], index: number): boolean {
  if (topic.onlyBeforeNoun && !isCapitalized(words[index + 1] ?? "")) return false;
  if (topic.verbs && isCapitalized(words[index] ?? "") && !isSentenceStart(tokens, index)) return false;
  return true;
}

/** Wrong forms for `word` from every set of `topics` that contains it, in topic order. */
function distractorsFrom(
  word: string,
  topics: readonly GrammarTopic[],
  verbs: VerbTable,
): { topic: GrammarTopic | null; forms: string[] } {
  const key = lower(word);
  let first: GrammarTopic | null = null;
  const forms: string[] = [];
  for (const topic of topics) {
    for (const set of topicSets(topic, verbs)) {
      if (!set.includes(key)) continue;
      first ??= topic;
      for (const form of set) {
        if (form !== key && !forms.includes(form)) forms.push(form);
      }
    }
  }
  return { topic: first, forms: forms.map((form) => caseLike(form, word)) };
}

/** Token index of the `occurrence`-th `word`, matched without case. -1 when missing. */
export function findWordIndex(words: readonly string[], word: string, occurrence: number = 1): number {
  const key = lower(chipText(word));
  let seen = 0;
  for (let index = 0; index < words.length; index += 1) {
    if (lower(words[index] ?? "") !== key) continue;
    seen += 1;
    if (seen === occurrence) return index;
  }
  return -1;
}

/**
 * Every word of `clip` that can be blanked, given the topics unlocked for its
 * lesson. Explicit `gaps` come first and ignore `auto` and the context rules;
 * then each word that matches an `auto` topic. A clip without a translation
 * gets none: the translation is what leaves only one right answer.
 * Pass `lessonKey` to mark gaps of topics that lesson introduces as fresh.
 */
export function findClipGaps(
  clip: GapSourceClip,
  topics: readonly GrammarTopic[],
  verbs: VerbTable,
  lessonKey?: string,
): GrammarGap[] {
  const freshness = (topic: GrammarTopic | null) =>
    lessonKey !== undefined && topic?.from === lessonKey ? { fresh: true as const } : {};
  if (clip.noGaps === true) return [];
  if (!clip.translationVi?.trim()) return [];
  const tokens = tokenizeSentence(clip.script);
  const words = tokens.map(chipText);
  if (words.filter(Boolean).length < MIN_GAP_WORDS) return [];

  const skipped = new Set(Array.isArray(clip.noGaps) ? clip.noGaps.map((word) => lower(chipText(word))) : []);
  const gaps: GrammarGap[] = [];
  const taken = new Set<number>();

  for (const request of clip.gaps ?? []) {
    const index = findWordIndex(words, request.word, request.occurrence ?? 1);
    if (index < 0 || taken.has(index)) continue;
    const word = words[index]!;
    const named = request.topic ? topics.find((topic) => topic.id === request.topic) : undefined;
    if (request.topic && !named) continue;
    const found = request.options
      ? {
          topic: named ?? null,
          forms: [...new Set(request.options.map((option) => lower(chipText(option))))]
            .filter((form) => form && form !== lower(word))
            .map((form) => caseLike(form, word)),
        }
      : distractorsFrom(word, named ? [named] : topics, verbs);
    if (found.forms.length === 0) continue;
    taken.add(index);
    const ruleVi = request.whyVi ?? found.topic?.ruleVi;
    gaps.push({
      index,
      word,
      topicId: found.topic?.id ?? null,
      labelVi: found.topic?.labelVi ?? FALLBACK_LABEL_VI,
      distractors: found.forms,
      ...(ruleVi ? { ruleVi } : {}),
      ...freshness(found.topic),
    });
  }

  words.forEach((word, index) => {
    if (!word || taken.has(index) || skipped.has(lower(word))) return;
    const fitting = topics.filter((topic) => topic.auto && contextFits(topic, tokens, words, index));
    const found = distractorsFrom(word, fitting, verbs);
    if (!found.topic || found.forms.length === 0) return;
    taken.add(index);
    gaps.push({
      index,
      word,
      topicId: found.topic.id,
      labelVi: found.topic.labelVi,
      distractors: found.forms,
      ...(found.topic.ruleVi ? { ruleVi: found.topic.ruleVi } : {}),
      ...freshness(found.topic),
    });
  });

  return gaps.sort((a, b) => a.index - b.index);
}

/** The script with the gap's word replaced by a blank. Punctuation around it stays. */
export function blankScript(script: string, index: number): string {
  const tokens = tokenizeSentence(script);
  const token = tokens[index];
  if (token === undefined) return script;
  const word = chipText(token);
  tokens[index] = word ? token.replace(word, GAP_BLANK) : GAP_BLANK;
  return tokens.join(" ");
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/** The right word plus up to three distractors, shuffled. Wrong options carry the rule. */
export function buildGapOptions(gap: GrammarGap, random: () => number = Math.random): McOption[] {
  const distractors = shuffle(gap.distractors, random).slice(0, MC_OPTION_COUNT - 1);
  const options: McOption[] = [
    { id: "correct", text: gap.word, correct: true },
    ...distractors.map((text, index) => ({
      id: `d${index}`,
      text,
      correct: false,
      ...(gap.ruleVi ? { explanation: gap.ruleVi } : {}),
    })),
  ];
  return shuffle(options, random);
}
