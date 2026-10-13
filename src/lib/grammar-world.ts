/**
 * The grammar world (see docs/GRAMMAR_WORLD.md): a mountain per grammar area,
 * one stage per authored topic, climbed bottom to top.
 *
 * Every topic, its area and its place are written by hand in
 * src/data/grammar/world/, one file per tab. A topic's clips become one card stream; the
 * stream is cut into nodes of 4 parts on clip boundaries. A verb stage opens each
 * part with two warm-ups from the verb tables. A word stage (`drill: "word"`)
 * blanks each clip's `focus` instead, and has no verb-table warm-ups. Every
 * clip deals its cards from its own seed, so
 * adding clips only adds cards at the end of the stream: finished parts keep
 * their keys, and finished nodes keep their place.
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { seedToRandom } from "./blitzrunde";
import { blankScript, findWordIndex } from "./grammar-gaps";
import {
  scopeTables,
  verbForm,
  type GrammarTense,
  type GrammarTip,
  type StoredGrammarExample,
  type TenseTables,
} from "./grammar-lessons";
import {
  bracketCard,
  exampleQuestion,
  GRAMMAR_PAIRING_MAX,
  hashText,
  personLabel,
  ruleFor,
  shuffle,
  spreadSentences,
  pickTableFillBlanks,
  tenseForms,
  transformCard,
  type GrammarCard,
  type GrammarChoiceQuestion,
  type GrammarPairingItem,
} from "./grammar-node";
import { chipText, tokenizeSentence } from "./sentence-order";
import { EMPTY_STAGE, type WorldProgress, type WorldStageProgress } from "./grammar-world-progress";
import { type LearnProgress, type StoredProgress } from "./progress";

export {
  EMPTY_STAGE,
  mergeWorldProgress,
  normalizeWorldProgress,
  type WorldProgress,
  type WorldStageProgress,
} from "./grammar-world-progress";

// ---------------------------------------------------------------- content

export type StoredWorldClip = {
  /** Stable: progress and card keys are saved under it. */
  id: string;
  filename: string;
  script: string;
  translationVi: string;
  verb: string;
  tense: GrammarTense;
  person: string;
  /** The sentence before the change. Gives a tense-transform card. */
  from?: string;
  /** An incorrect version. Gives an error-check card. */
  wrong?: { script: string; whyVi: string };
  /** Shown after a mistake on this clip's cards. */
  tip?: string;
  /**
   * Word the cards blank: an article, a question word, a preposition.
   * Absent on a verb stage, which blanks the verb form.
   */
  focus?: string;
  /** Which occurrence of `focus` to blank, from 1. Default 1. */
  occurrence?: number;
  /** Competing forms, including `focus`. The card shows up to three wrong ones. */
  choices?: string[];
};

export type StoredWorldTopic = {
  id: string;
  titleVi: string;
  titleDe: string;
  /** "<level>/<lektion>": the Lektion's first practice node opens the stage. */
  opensWith: string;
  /** Tenses the stage practises. Warm-ups and listening options stay inside them. */
  tenses: GrammarTense[];
  /**
   * "word": cards blank `focus` and parts have no verb-table warm-ups.
   * Absent: a verb stage, as Verbkonjugation.
   */
  drill?: "verb" | "word";
  /** Verbs of the warm-up tables. A word stage still names the verbs its sentences use. */
  verbs: string[];
  tips: GrammarTip[];
  clips: StoredWorldClip[];
};

export type StoredWorldArea = {
  id: string;
  titleVi: string;
  titleDe: string;
  icon: string;
  /** Stages bottom to top, in the authored order. */
  topics: StoredWorldTopic[];
};

export type WorldClip = Omit<StoredWorldClip, "filename"> & {
  /** Path under public/audio. Null until the MP3 exists. */
  audioPath: string | null;
};

export type WorldTopic = Omit<StoredWorldTopic, "clips"> & { clips: WorldClip[] };

export type WorldArea = Omit<StoredWorldArea, "topics"> & { topics: WorldTopic[] };

/** Clip audio of a topic: public/audio/grammar-world/<topic>/<filename>. */
export function worldClipAudioPath(topicId: string, filename: string): string {
  return `grammar-world/${topicId}/${filename}`;
}

export function resolveWorld(
  areas: readonly StoredWorldArea[],
  hasAudio: (audioPath: string) => boolean = () => true,
): WorldArea[] {
  return areas.map((area) => ({
    ...area,
    topics: area.topics.map((topic) => ({
      ...topic,
      clips: topic.clips.map(({ filename, ...clip }) => {
        const audioPath = worldClipAudioPath(topic.id, filename);
        return { ...clip, audioPath: hasAudio(audioPath) ? audioPath : null };
      }),
    })),
  }));
}

// ---------------------------------------------------------------- sizes

/** Parts in a full node. The last node of a stage can have fewer. */
export const WORLD_PARTS_PER_NODE = 4;
/** Table-fill and pronoun-pairing open every part. */
export const WORLD_WARM_UPS = 2;
/** Cards of the review node, drawn evenly across all of the stage's clips. */
export const WORLD_REVIEW_CARDS = 15;
/** A tail shorter than this joins the part before it instead of making its own. */
const MIN_TAIL_CARDS = 3;

/** Cards in one part of `node` (1-based): 10 in the first two nodes, 15 from the third on. */
export function worldPartSize(node: number): number {
  return node <= 2 ? 10 : 15;
}

// ---------------------------------------------------------------- cards

function topicTables(tables: TenseTables, topic: WorldTopic): TenseTables {
  return scopeTables(tables, [...topic.verbs, ...topic.clips.map((clip) => clip.verb)]);
}

function asExample(clip: WorldClip): StoredGrammarExample & { id: string; audioPath: string | null } {
  return { ...clip, filename: "" };
}

function clipRule(topic: WorldTopic, clip: WorldClip): string | undefined {
  return clip.tip ?? ruleFor(topic.tips, clip.verb, clip.tense);
}

/** `form` cased like the word written in the sentence. */
function matchCase(form: string, like: string): string {
  const lower = form.toLocaleLowerCase("de-DE");
  if (!lower) return lower;
  return /^\p{Lu}/u.test(like) ? lower[0]!.toLocaleUpperCase("de-DE") + lower.slice(1) : lower;
}

/**
 * The sentence with `focus` blanked. Options are the clip's `choices`.
 * A verb stage leaves this unused and blanks the verb form instead.
 */
function wordQuestion(clip: WorldClip, random: () => number, rule?: string): GrammarChoiceQuestion | null {
  if (!clip.focus || !clip.choices?.length) return null;
  const words = tokenizeSentence(clip.script).map(chipText);
  const index = findWordIndex(words, clip.focus, clip.occurrence ?? 1);
  if (index < 0) return null;
  const written = words[index]!;
  const focus = clip.focus.toLocaleLowerCase("de-DE");
  const wrong = shuffle(
    clip.choices.filter((choice) => choice.toLocaleLowerCase("de-DE") !== focus),
    random,
  ).slice(0, 3);
  if (wrong.length === 0) return null;
  return {
    prompt: blankScript(clip.script, index),
    hintVi: clip.translationVi,
    options: shuffle(
      [
        { id: "correct", text: matchCase(clip.focus, written), correct: true },
        ...wrong.map((text, index) => ({
          id: `d${index}`,
          text: matchCase(text, written),
          correct: false,
          ...(rule ? { explanation: rule } : {}),
        })),
      ],
      random,
    ),
    ...(rule ? { ruleVi: rule } : {}),
  };
}

/** Tense labels, for listening cards of a stage with several tenses. */
const TENSE_LABEL: Record<GrammarTense, string> = {
  praesens: "Präsens",
  perfekt: "Perfekt",
  praeteritum: "Präteritum",
};

/**
 * The 2–4 cards of one clip, in a fixed order: form-choice always,
 * tense-spot with audio, bracket-order for Perfekt, tense-transform with
 * `from`, error-check with `wrong`. `seed` changes the dealing, not the kinds.
 */
export function worldClipCards(
  tables: TenseTables,
  topic: WorldTopic,
  clip: WorldClip,
  seed = "",
): GrammarCard[] {
  const scoped = topicTables(tables, topic);
  const random = seedToRandom(`world:${topic.id}:${clip.id}${seed}`);
  const rule = clipRule(topic, clip);
  const key = (kind: string) => `${topic.id}:${clip.id}:${kind}`;
  const cards: GrammarCard[] = [];

  const focused = Boolean(clip.focus);
  const question = focused ? wordQuestion(clip, random, rule) : exampleQuestion(scoped, asExample(clip), random, rule);
  if (question) {
    cards.push({
      kind: "form-choice",
      key: key("form-choice"),
      verb: clip.verb,
      sentence: clip.script,
      question,
      audioPath: clip.audioPath,
      ...(rule ? { ruleVi: rule } : {}),
    });
  }

  // The listening slot is always dealt, so adding an MP3 later keeps every
  // card key, and with it every saved part. Until the audio exists it is a
  // second form-choice on the same sentence.
  const listening = focused
    ? (wordQuestion(clip, random, rule)?.options ?? null)
    : topic.tenses.length > 1
      ? shuffle(
          topic.tenses.map((tense) => ({ id: tense, text: TENSE_LABEL[tense], correct: tense === clip.tense })),
          random,
        )
      : (exampleQuestion(scoped, asExample(clip), random)?.options ?? null);
  if (clip.audioPath && listening) {
    // One tense: hear the sentence and pick the verb form. Several: pick the tense.
    // A word stage always asks for the blanked word.
    cards.push({
      kind: "tense-spot",
      key: key("tense-spot"),
      verb: clip.verb,
      sentence: clip.script,
      script: clip.script,
      translationVi: clip.translationVi,
      audioPath: clip.audioPath,
      options: listening,
      ...(focused
        ? { promptVi: "Bạn nghe thấy từ nào?" }
        : topic.tenses.length > 1
          ? {}
          : { promptVi: "Bạn nghe thấy động từ nào?" }),
    });
  } else if (question && listening) {
    cards.push({
      kind: "form-choice",
      key: key("tense-spot"),
      verb: clip.verb,
      sentence: clip.script,
      question: { ...question, options: shuffle(question.options, random) },
      audioPath: null,
      ...(rule ? { ruleVi: rule } : {}),
    });
  }

  if (clip.tense === "perfekt") {
    const card = bracketCard(scoped, topic, clip, random);
    if (card) cards.push({ ...card, key: key("bracket-order"), ...(rule ? { ruleVi: rule } : {}) });
  }

  if (clip.from) {
    const card = transformCard(
      scoped,
      topic,
      { type: "transform", verb: clip.verb, tense: clip.tense, from: clip.from, to: clip.script, translationVi: clip.translationVi },
      0,
      random,
    );
    if (card.kind === "tense-transform") {
      cards.push({
        ...card,
        key: key("tense-transform"),
        // One tense: the change is the person, so the card shows the meaning to reach.
        ...(topic.tenses.length > 1 ? {} : { changeVi: "Đổi câu cho đúng nghĩa mới" }),
        ...(rule ? { ruleVi: rule } : {}),
      });
    }
  }

  if (clip.wrong) {
    // Half the clips show the wrong version, half the right one, so "Sai" is never a sure bet.
    const showWrong = random() < 0.5;
    cards.push({
      kind: "error-check",
      key: key("error-check"),
      verb: clip.verb,
      sentence: clip.script,
      script: showWrong ? clip.wrong.script : clip.script,
      fix: showWrong ? clip.script : null,
      ruleVi: clip.wrong.whyVi,
    });
  }

  return cards;
}

/** Every clip's cards in authored clip order: the stream nodes and parts are cut from. */
export function worldCardStream(tables: TenseTables, topic: WorldTopic): GrammarCard[] {
  return topic.clips.flatMap((clip) => worldClipCards(tables, topic, clip));
}

/** The first tense of the stage that the tables store per person. */
function warmUpTense(topic: WorldTopic): GrammarTense | null {
  return topic.tenses.find((tense) => tense !== "perfekt") ?? null;
}

function worldTableFill(
  tables: TenseTables,
  topic: WorldTopic,
  verbId: string,
  random: () => number,
): GrammarCard | null {
  const tense = warmUpTense(topic);
  if (!tense) return null;
  const forms = tenseForms(tables, verbId, tense);
  const blanks = pickTableFillBlanks(forms, random);
  if (!blanks) return null;
  const rows = forms.map((entry) => ({
    personLabel: personLabel(tables, entry.personId),
    text: blanks.has(entry.personId) ? null : entry.form,
    answer: entry.form,
  }));
  const answers = rows.filter((row) => row.text === null).map((row) => row.answer);
  // Traps stay in the stage's tense: the verb's other forms.
  const pool = shuffle([...new Set(forms.map((entry) => entry.form))].filter((form) => !answers.includes(form)), random);
  const bank = shuffle(
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
    bank,
    ...(rule ? { ruleVi: rule } : {}),
  };
}

function worldPairing(
  tables: TenseTables,
  topic: WorldTopic,
  verbId: string,
  random: () => number,
): GrammarCard | null {
  for (const tense of shuffle(topic.tenses, random)) {
    const seen = new Set<string>();
    const items: GrammarPairingItem[] = [];
    for (const person of tables.persons) {
      const form = verbForm(tables, verbId, tense, person.id);
      if (!form || seen.has(form.text)) continue;
      seen.add(form.text);
      items.push({ id: person.id, person: person.label, form: form.text });
    }
    if (items.length < 4) continue;
    const rule = ruleFor(topic.tips, verbId, tense);
    return {
      kind: "pronoun-pairing",
      key: `${topic.id}:pronoun-pairing:${verbId}:${tense}`,
      verb: verbId,
      sentence: null,
      tense,
      items: shuffle(items, random).slice(0, GRAMMAR_PAIRING_MAX),
      ...(rule ? { ruleVi: rule } : {}),
    };
  }
  return null;
}

/** A word stage practises the blanked word, so its parts do not open on a verb table. */
function usesWarmUps(topic: WorldTopic): boolean {
  return topic.drill !== "word";
}

/** Clip cards in one part. Verb stages leave two slots for the warm-ups. */
function streamSlots(topic: WorldTopic, node: number): number {
  return worldPartSize(node) - (usesWarmUps(topic) ? WORLD_WARM_UPS : 0);
}

/** Table-fill on the part's first verb, pairing on its second (or the first again). */
function warmUps(tables: TenseTables, topic: WorldTopic, cards: readonly GrammarCard[], random: () => number): GrammarCard[] {
  if (!usesWarmUps(topic)) return [];
  const scoped = topicTables(tables, topic);
  const verbs = [...new Set(cards.flatMap((card) => (card.verb ? [card.verb] : [])))];
  const fallback = topic.verbs[0];
  const first = verbs[0] ?? fallback;
  const second = verbs[1] ?? first;
  if (!first || !second) return [];
  return [worldTableFill(scoped, topic, first, random), worldPairing(scoped, topic, second, random)].flatMap(
    (card) => card ?? [],
  );
}

// ---------------------------------------------------------------- layout

export type WorldPart = {
  /** Hash of the part's cards. A saved key stops matching only if these cards change. */
  key: string;
  /** 1-based, inside its node. */
  part: number;
  cards: GrammarCard[];
  clipIds: string[];
};

export type WorldNode = {
  /** 1-based, from the foot of the stage. */
  node: number;
  /** Range of the topic's card stream. `end` is what a finished node stores. */
  start: number;
  end: number;
  parts: WorldPart[];
  /** Finished and stored: it keeps its range even after clips are added. */
  sealed: boolean;
  /** Every clip in its parts has its MP3. A node without them cannot be played. */
  ready: boolean;
};

function buildPart(tables: TenseTables, topic: WorldTopic, cards: readonly GrammarCard[], part: number): WorldPart {
  const random = seedToRandom(`world:${topic.id}:part:${cards.map((card) => card.key).join(",")}`);
  const dealt = [...warmUps(tables, topic, cards, random), ...spreadSentences(cards, random)];
  return {
    key: `w${hashText(dealt.map((card) => card.key).join(","))}`,
    part,
    cards: dealt,
    clipIds: [...new Set(cards.map((card) => card.key.split(":")[1] ?? ""))].filter(Boolean),
  };
}

/** The clip id stored in a world card key (`topic:clip:kind`). */
function clipIdOf(card: GrammarCard): string {
  return card.key.split(":")[1] ?? "";
}

/** Index just after the clip that contains `at`. */
function clipBoundary(stream: readonly GrammarCard[], at: number): number {
  const id = clipIdOf(stream[at]!);
  let end = at + 1;
  while (end < stream.length && clipIdOf(stream[end]!) === id) end += 1;
  return end;
}

/**
 * Where the next practice node ends. It takes whole clips until it holds
 * `capacity` cards, so the node after it starts on a new clip. One or two
 * extra cards come along and join the last part; a clip that would open a
 * fifth part waits. A remainder shorter than a part's tail stays here too.
 */
function practiceNodeEnd(stream: readonly GrammarCard[], cursor: number, capacity: number): number {
  const limit = capacity + MIN_TAIL_CARDS - 1;
  let end = cursor;
  while (end < stream.length) {
    const next = clipBoundary(stream, end);
    if (end > cursor && next - cursor > limit) break;
    end = next;
    if (end - cursor >= capacity) break;
  }
  if (stream.length - end > 0 && stream.length - end < MIN_TAIL_CARDS && stream.length - cursor <= limit) {
    return stream.length;
  }
  return end;
}

/** Cuts one node's cards into parts of `per`. A short tail joins the part before it. */
function cutParts(cards: readonly GrammarCard[], per: number): GrammarCard[][] {
  const parts: GrammarCard[][] = [];
  for (let at = 0; at < cards.length; at += per) parts.push(cards.slice(at, at + per));
  const tail = parts.at(-1);
  if (parts.length > 1 && tail && tail.length < MIN_TAIL_CARDS) {
    parts.pop();
    parts[parts.length - 1] = [...parts[parts.length - 1]!, ...tail];
  }
  return parts;
}

/**
 * The stage's practice nodes. Finished nodes keep the ranges stored in
 * `nodeEnds`; the rest of the stream fills new nodes of 4 parts above them.
 * A new node ends on a clip, so the same clip is never in two of them.
 */
export function worldNodes(tables: TenseTables, topic: WorldTopic, nodeEnds: readonly number[] = []): WorldNode[] {
  const stream = worldCardStream(tables, topic);
  const voiced = new Set(topic.clips.flatMap((clip) => (clip.audioPath ? [clip.id] : [])));
  const nodes: WorldNode[] = [];
  let cursor = 0;
  const addNode = (end: number, sealed: boolean) => {
    const node = nodes.length + 1;
    const per = streamSlots(topic, node);
    const cards = stream.slice(cursor, end);
    const parts = cutParts(cards, per).map((partCards, index) => buildPart(tables, topic, partCards, index + 1));
    nodes.push({
      node,
      start: cursor,
      end,
      sealed,
      parts,
      ready: parts.every((part) => part.clipIds.every((id) => voiced.has(id))),
    });
    cursor = Math.max(cursor, end);
  };
  for (const end of nodeEnds) addNode(Math.min(Math.max(end, cursor), stream.length), true);
  while (cursor < stream.length) {
    const per = streamSlots(topic, nodes.length + 1);
    addNode(practiceNodeEnd(stream, cursor, per * WORLD_PARTS_PER_NODE), false);
  }
  return nodes;
}

/**
 * The review node's cards: one card per clip in turn, across every clip of
 * the stage, until WORLD_REVIEW_CARDS. `run` changes the draw, so each replay
 * mixes differently and takes in clips added since.
 */
export function worldReviewCards(tables: TenseTables, topic: WorldTopic, run: number): GrammarCard[] {
  const random = seedToRandom(`world:${topic.id}:review:${run}`);
  const queues = shuffle(topic.clips, random).map((clip) =>
    shuffle(worldClipCards(tables, topic, clip, `:review:${run}`), random),
  );
  const picked: GrammarCard[] = [];
  while (picked.length < WORLD_REVIEW_CARDS && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const card = queue.shift();
      if (card) picked.push(card);
      if (picked.length >= WORLD_REVIEW_CARDS) break;
    }
  }
  return spreadSentences(picked, random);
}

// ---------------------------------------------------------------- progress

export type WorldNodeView = WorldNode & {
  partDone: boolean[];
  partsDone: number;
  done: boolean;
};

export type WorldStageView = {
  topic: WorldTopic;
  nodes: WorldNodeView[];
  review: { unlocked: boolean; done: boolean; runs: number };
  /** Practice parts finished, plus the review once it is done. Each is a star on the tab. */
  stars: number;
  /** Every part of the stage, plus the review. */
  starsTotal: number;
  /** Something was finished on this stage. */
  practised: boolean;
  /** Every node and the review are done. */
  done: boolean;
  /** The node to play next, or null when only the review is left, the next node's audio is missing, or nothing. */
  current: { node: number; part: number } | null;
};

export function worldStageView(
  tables: TenseTables,
  topic: WorldTopic,
  progress: WorldStageProgress = EMPTY_STAGE,
  options?: { freePlay?: boolean },
): WorldStageView {
  const done = new Set(progress.partKeys);
  const nodes = worldNodes(tables, topic, progress.nodeEnds).map((node): WorldNodeView => {
    const partDone = node.parts.map((part) => node.sealed || done.has(part.key));
    const partsDone = partDone.filter(Boolean).length;
    return { ...node, partDone, partsDone, done: node.sealed || (partDone.length > 0 && partsDone === partDone.length) };
  });
  const allNodesDone = nodes.every((node) => node.done);
  const runs = progress.reviewRuns;
  const reviewDone = runs > 0;
  const partStars = nodes.reduce((total, node) => total + node.partsDone, 0);
  const partTotal = nodes.reduce((total, node) => total + node.parts.length, 0);
  const open = nodes.find((node) => !node.done);
  const openPart = open ? open.partDone.findIndex((value) => !value) + 1 : 0;
  return {
    topic,
    nodes,
    review: { unlocked: (Boolean(options?.freePlay) || allNodesDone) && topic.clips.length > 0, done: reviewDone, runs },
    stars: partStars + (reviewDone ? 1 : 0),
    starsTotal: partTotal + 1,
    practised: partStars > 0 || reviewDone || progress.nodeEnds.length > 0,
    done: allNodesDone && reviewDone && topic.clips.length > 0,
    current: open?.ready ? { node: open.node, part: openPart } : null,
  };
}

/**
 * Stores a finished part. When it finishes its node, the node's stream end is
 * stored too, so clips added later start a new node above it.
 */
export function withWorldPartDone(
  tables: TenseTables,
  topic: WorldTopic,
  progress: WorldStageProgress = EMPTY_STAGE,
  partKey: string,
): WorldStageProgress {
  const partKeys = progress.partKeys.includes(partKey) ? progress.partKeys : [...progress.partKeys, partKey];
  const nodes = worldNodes(tables, topic, progress.nodeEnds);
  const keys = new Set(partKeys);
  const nodeEnds = [...progress.nodeEnds];
  for (const node of nodes) {
    if (node.sealed) continue;
    if (node.parts.length === 0 || !node.parts.every((part) => keys.has(part.key))) break;
    nodeEnds.push(node.end);
  }
  return { ...progress, partKeys, nodeEnds };
}

export function withWorldReviewDone(progress: WorldStageProgress = EMPTY_STAGE): WorldStageProgress {
  return { ...progress, reviewRuns: progress.reviewRuns + 1 };
}

/**
 * Cards in the part the learner just finished. Null when that part is not a
 * real one, or a review that is not open yet. `run` is the review draw; a
 * saved review is one run ahead of the draw it was dealt from.
 */
export function worldPracticeCardCount(
  tables: TenseTables,
  topic: WorldTopic,
  progress: WorldStageProgress | undefined,
  target: { review: boolean; node: number; part: number; run: number },
  options?: { freePlay?: boolean },
): number | null {
  const stage = progress ?? EMPTY_STAGE;
  if (target.review) {
    if (topic.clips.length === 0 || target.run < 0 || target.run > stage.reviewRuns) return null;
    const view = worldStageView(tables, topic, stage, options);
    if (!view.review.unlocked && stage.reviewRuns === 0) return null;
    const count = worldReviewCards(tables, topic, target.run).length;
    return count > 0 ? count : null;
  }
  if (target.node < 1 || target.part < 1) return null;
  const layouts = [stage.nodeEnds, stage.nodeEnds.slice(0, -1), [] as number[]];
  const seen = new Set<string>();
  for (const ends of layouts) {
    const key = ends.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const node = worldNodes(tables, topic, ends).find((entry) => entry.node === target.node);
    const part =
      node && (node.ready || options?.freePlay)
        ? node.parts.find((entry) => entry.part === target.part)
        : undefined;
    if (part && part.cards.length > 0) return part.cards.length;
  }
  return null;
}

// ---------------------------------------------------------------- areas

export type WorldAreaView = {
  area: WorldArea;
  stages: (WorldStageView & { open: boolean })[];
  stars: number;
  starsTotal: number;
  /** Some stage is open. A tab without one is locked. */
  open: boolean;
  /** Every stage is done. */
  done: boolean;
};

/** `isOpen` says whether a topic's stage is open for this learner. `freePlay` opens every review. */
export function worldAreaViews(
  tables: TenseTables,
  areas: readonly WorldArea[],
  progress: WorldProgress | undefined,
  isOpen: (topic: WorldTopic) => boolean,
  options?: { freePlay?: boolean },
): WorldAreaView[] {
  return areas.map((area) => {
    const stages = area.topics.map((topic) => ({
      ...worldStageView(tables, topic, progress?.stages[topic.id], options),
      open: isOpen(topic),
    }));
    return {
      area,
      stages,
      stars: stages.reduce((total, stage) => total + stage.stars, 0),
      starsTotal: stages.reduce((total, stage) => total + stage.starsTotal, 0),
      open: stages.some((stage) => stage.open),
      done: stages.length > 0 && stages.every((stage) => stage.open && stage.done),
    };
  });
}

/** The first open stage in authored order: the only one that gets the welcome tour. */
export function firstOpenStage(views: readonly WorldAreaView[]): WorldTopic | null {
  for (const view of views) {
    const stage = view.stages.find((entry) => entry.open);
    if (stage) return stage.topic;
  }
  return null;
}

/** Open stages with nothing finished yet: the portal's badge. */
export function unpractisedStages(views: readonly WorldAreaView[]): WorldTopic[] {
  return views.flatMap((view) => view.stages.filter((stage) => stage.open && !stage.practised).map((stage) => stage.topic));
}

/** Open stages whose "new stage" screen has not been shown. */
export function unannouncedStages(views: readonly WorldAreaView[], progress: WorldProgress | undefined): WorldTopic[] {
  return views.flatMap((view) =>
    view.stages
      .filter((stage) => stage.open && !progress?.stages[stage.topic.id]?.announcedAt)
      .map((stage) => stage.topic),
  );
}

/**
 * The tab the world opens on: the area of the newest open stage (the last open
 * one in authored order that is not done), else the first open area.
 */
export function landingArea(views: readonly WorldAreaView[]): string | null {
  for (let a = views.length - 1; a >= 0; a -= 1) {
    const view = views[a]!;
    if (view.stages.some((stage) => stage.open && !stage.done)) return view.area.id;
  }
  return views.find((view) => view.open)?.area.id ?? views[0]?.area.id ?? null;
}

// ---------------------------------------------------------------- opening

/** One part of the practice node that opens a stage. */
export type WorldPracticePart = {
  key: string;
  clipIds: string[];
};

/** What opens a topic's stage, worked out on the server from `opensWith`. */
export type WorldGate = {
  /** Progress key of the opening Lektion. */
  progressKey: string;
  /** Parts of that Lektion's first practice node. The stage opens when the node is done. */
  practiceParts: WorldPracticePart[];
  /** The learner may open the Lektion's level. */
  access: boolean;
  /** Admins and teachers skip the path, as on the Lektion trail. */
  unlocked: boolean;
  /** Where "go to the Lektion" leads. */
  lessonHref: string;
  /** "A1.1 · Lektion 3". */
  lessonLabel: string;
};

/**
 * The first practice node is done when every part is stored, every clip in
 * those parts is completed, or the Lektion's listening counts as finished.
 */
export function firstPracticeNodeDone(
  learn: LearnProgress | undefined,
  parts: readonly WorldPracticePart[],
): boolean {
  if (!learn || parts.length === 0) return false;
  if (learn.completedAt || learn.runCount > 0) return true;
  const keys = new Set(learn.practicePartKeys ?? []);
  const clips = new Set(learn.completedClipIds);
  return parts.every(
    (part) => keys.has(part.key) || (part.clipIds.length > 0 && part.clipIds.every((id) => clips.has(id))),
  );
}

/** A stage opens when the learner finishes the first practice node of its Lektion. */
export function worldStageOpen(gate: WorldGate | undefined, progress: StoredProgress): boolean {
  if (!gate || !gate.access) return false;
  if (gate.unlocked) return true;
  return firstPracticeNodeDone(progress.learn[gate.progressKey], gate.practiceParts);
}
