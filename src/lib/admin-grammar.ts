import grammarTopicsFile from "@/data/grammar/topics.json";
import { topicSets, type GrammarTopic } from "@/lib/grammar-gaps";
import {
  getAvailableChapters,
  getCefrLevels,
  getChapterClips,
  getGrammarVerbs,
  grammarTopicsForLesson,
} from "@/lib/levels";

export type AdminGrammarGapRow = {
  clipId: string;
  script: string;
  translationVi: string;
  /** Token index of the blanked word. */
  index: number;
  word: string;
  topicId: string | null;
  labelVi: string;
  /** The right word first, then every distractor a card can draw from. */
  options: string[];
  fresh: boolean;
};

export type AdminGrammarLesson = {
  key: string;
  label: string;
  clipCount: number;
  clipsWithGaps: number;
  topicIds: string[];
  gaps: AdminGrammarGapRow[];
};

export type AdminGrammarLevel = {
  slug: string;
  label: string;
  lessons: AdminGrammarLesson[];
};

export type AdminGrammarTopicRow = {
  id: string;
  labelVi: string;
  from: string;
  auto: boolean;
  onlyBeforeNoun: boolean;
  setCount: number;
  gapCount: number;
};

export type AdminGrammarBoard = {
  levels: AdminGrammarLevel[];
  topics: AdminGrammarTopicRow[];
  verbCount: number;
};

/** Every grammar gap the practice decks can deal, per playable Lektion, for review. */
export function buildAdminGrammarBoard(): AdminGrammarBoard {
  const topics = (grammarTopicsFile as { topics: GrammarTopic[] }).topics;
  const verbs = getGrammarVerbs();
  const gapCounts = new Map<string, number>();

  const levels = getCefrLevels().flatMap((level) => {
    const lessons = getAvailableChapters(level.slug).map((chapter): AdminGrammarLesson => {
      const clips = getChapterClips(level.slug, chapter.slug);
      const gaps = clips.flatMap((clip) =>
        (clip.gaps ?? []).map((gap) => ({
          clipId: clip.id,
          script: clip.script,
          translationVi: clip.translationVi,
          index: gap.index,
          word: gap.word,
          topicId: gap.topicId,
          labelVi: gap.labelVi,
          options: [gap.word, ...gap.distractors],
          fresh: gap.fresh === true,
        })),
      );
      for (const gap of gaps) {
        if (gap.topicId) gapCounts.set(gap.topicId, (gapCounts.get(gap.topicId) ?? 0) + 1);
      }
      return {
        key: `${level.slug}/${chapter.slug}`,
        label: chapter.label,
        clipCount: clips.length,
        clipsWithGaps: clips.filter((clip) => clip.gaps?.length).length,
        topicIds: grammarTopicsForLesson(level.slug, chapter.slug).map((topic) => topic.id),
        gaps,
      };
    });
    return lessons.length > 0 ? [{ slug: level.slug, label: level.level, lessons }] : [];
  });

  return {
    levels,
    topics: topics.map((topic) => ({
      id: topic.id,
      labelVi: topic.labelVi,
      from: topic.from,
      auto: topic.auto === true,
      onlyBeforeNoun: topic.onlyBeforeNoun === true,
      setCount: topicSets(topic, verbs).length,
      gapCount: gapCounts.get(topic.id) ?? 0,
    })),
    verbCount: Object.keys(verbs).length,
  };
}
