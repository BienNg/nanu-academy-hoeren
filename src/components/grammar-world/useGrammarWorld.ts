"use client";

import { useMemo } from "react";
import {
  unannouncedStages,
  unpractisedStages,
  worldAreaViews,
  worldStageOpen,
  type WorldAreaView,
  type WorldTopic,
} from "@/lib/grammar-world";
import type { GrammarWorldData } from "@/lib/grammar-world-content";
import { useProgress } from "@/lib/useProgress";

export type GrammarWorldState = {
  views: WorldAreaView[];
  /** Some stage is open, so the portal shows. */
  anyOpen: boolean;
  /** Open stages with nothing finished: the portal badge. */
  unpractised: WorldTopic[];
  /** Open stages whose "new stage" screen has not shown yet. */
  unannounced: WorldTopic[];
  /** Stars over every open stage, for the portal ring. */
  stars: number;
  starsTotal: number;
  progressReady: boolean;
};

/** The world as this learner sees it, from their stored progress. */
export function useGrammarWorld(data: GrammarWorldData | null): GrammarWorldState {
  const { progress, progressReady } = useProgress();
  return useMemo(() => {
    if (!data) {
      return { views: [], anyOpen: false, unpractised: [], unannounced: [], stars: 0, starsTotal: 0, progressReady };
    }
    const views = worldAreaViews(data.tables, data.areas, progress.grammarWorld, (topic) =>
      worldStageOpen(data.gates[topic.id], progress),
    );
    const openStages = views.flatMap((view) => view.stages.filter((stage) => stage.open));
    return {
      views,
      anyOpen: openStages.length > 0,
      unpractised: unpractisedStages(views),
      unannounced: unannouncedStages(views, progress.grammarWorld),
      stars: openStages.reduce((total, stage) => total + stage.stars, 0),
      starsTotal: openStages.reduce((total, stage) => total + stage.starsTotal, 0),
      progressReady,
    };
  }, [data, progress, progressReady]);
}

/** Where tapping a stage's next step leads: its current part, or its review. */
export function stagePlayHref(topicId: string, current: { node: number; part: number } | null): string {
  const topic = encodeURIComponent(topicId);
  return current
    ? `/grammar/practice?topic=${topic}&node=${current.node}&part=${current.part}`
    : `/grammar/practice?topic=${topic}&review=1`;
}
