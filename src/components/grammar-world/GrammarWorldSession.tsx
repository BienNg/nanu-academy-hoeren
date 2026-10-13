"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import { GrammarCardDeck, type GrammarDeckSummary } from "@/components/session/grammar/GrammarPracticeSession";
import { GrammarPage } from "@/components/session/grammar/GrammarSessionFrame";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import type { TenseTables } from "@/lib/grammar-lessons";
import {
  EMPTY_STAGE,
  withWorldPartDone,
  withWorldReviewDone,
  worldNodes,
  worldReviewCards,
  worldStageOpen,
  type WorldGate,
  type WorldTopic,
} from "@/lib/grammar-world";
import { clearQuestBoardCache } from "@/lib/quest-badge";
import { questZoneHeaders, readQuestUpdate, type QuestUpdate } from "@/lib/quests";
import { useProgress } from "@/lib/useProgress";

/**
 * One part of a grammar world node, or a stage's review. The same practice
 * session as a Lektion's grammar node; a finished part returns to the
 * mountain, where the next stop lights up.
 */
export function GrammarWorldSession({
  topic,
  gate,
  areaId,
  tables,
  node,
  part,
  review,
  returnHref = null,
}: {
  topic: WorldTopic;
  gate: WorldGate;
  areaId: string;
  tables: TenseTables;
  node: number;
  part: number;
  review: boolean;
  /** Where the learner came from on their first part: the path, not the mountain. */
  returnHref?: string | null;
}) {
  const router = useRouter();
  const { progress, progressReady, commitWorldStageDone, streakDays } = useProgress();
  const [phase, setPhase] = useState<"cards" | "complete" | "leaving">("cards");
  const [summary, setSummary] = useState<(GrammarDeckSummary & { nodeDone: boolean }) | null>(null);
  const [xpGrant, setXpGrant] = useState<{
    xp: number | null;
    kind: string | null;
    pending: boolean;
    quests: QuestUpdate | null;
    total: number | null;
  } | null>(null);
  const stage = progress.grammarWorld?.stages[topic.id] ?? EMPTY_STAGE;
  const mountainHref = returnHref ?? `/grammar?tab=${encodeURIComponent(areaId)}`;

  // Cards are fixed once progress has loaded, so a sync mid-session cannot reshuffle them.
  const [deal, setDeal] = useState<{
    cards: ReturnType<typeof worldReviewCards>;
    key: string | null;
    partCount: number;
    run: number;
  } | null>(null);
  const ready = useMemo(() => {
    if (!progressReady || !worldStageOpen(gate, progress)) return null;
    if (review) {
      return { cards: worldReviewCards(tables, topic, stage.reviewRuns), key: null, partCount: 1, run: stage.reviewRuns };
    }
    const found = worldNodes(tables, topic, stage.nodeEnds).find((entry) => entry.node === node && entry.ready);
    const target = found?.parts.find((entry) => entry.part === part);
    return target ? { cards: target.cards, key: target.key, partCount: found!.parts.length, run: 0 } : null;
  }, [gate, node, part, progress, progressReady, review, stage.nodeEnds, stage.reviewRuns, tables, topic]);
  if (!deal && ready) setDeal(ready);
  const missing = progressReady && !ready && !deal;

  // A part that no longer exists, is not open yet or lacks its audio goes back to the mountain.
  useEffect(() => {
    if (missing) router.replace(mountainHref);
  }, [missing, mountainHref, router]);

  const leave = (href: string) => {
    setPhase("leaving");
    router.push(href);
  };

  if (phase === "leaving" || !deal) {
    return (
      <GrammarPage>
        <SessionContentSkeleton kind="practice" />
      </GrammarPage>
    );
  }

  if (phase === "complete" && summary) {
    return (
      <GrammarPage>
        <PartCompleteScreen
          key="complete"
          partNumber={review ? 1 : part}
          partCount={deal.partCount}
          levelLabel="Núi ngữ pháp"
          chapterLabel={topic.titleVi}
          questionCount={summary.questionCount}
          accuracy={summary.accuracy}
          elapsedMs={summary.elapsedMs}
          xp={summary.failed ? null : (xpGrant?.xp ?? null)}
          xpKind={summary.failed ? null : (xpGrant?.kind ?? null)}
          xpPending={!summary.failed && (xpGrant?.pending ?? false)}
          totalXp={summary.failed ? null : (xpGrant?.total ?? null)}
          questUpdate={summary.failed ? null : (xpGrant?.quests ?? null)}
          streakDays={streakDays}
          finishRun={false}
          failed={summary.failed}
          skipBoard
          title={summary.failed ? undefined : review ? "Ôn tập xong!" : summary.nodeDone ? "Nút hoàn thành!" : undefined}
          continueLabel={returnHref ? "Về lộ trình" : "Về núi ngữ pháp"}
          onContinue={() =>
            leave(
              summary.failed || returnHref ? mountainHref : `${mountainHref}&lit=${encodeURIComponent(topic.id)}`,
            )
          }
        />
      </GrammarPage>
    );
  }

  return (
    <GrammarCardDeck
      cards={deal.cards}
      tables={tables}
      onLeave={() => leave(mountainHref)}
      onFinish={(result) => {
        if (result.failed) {
          setSummary({ ...result, nodeDone: false });
          setPhase("complete");
          return;
        }
        const next = deal.key
          ? withWorldPartDone(tables, topic, stage, deal.key)
          : withWorldReviewDone(stage);
        commitWorldStageDone(topic.id, next, result.questionCount);
        setSummary({ ...result, nodeDone: next.nodeEnds.length > stage.nodeEnds.length });
        setXpGrant({ xp: null, kind: null, pending: true, quests: null, total: null });
        setPhase("complete");
        void fetch("/api/grammar-world-xp", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...questZoneHeaders() },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            topicId: topic.id,
            review,
            node: review ? 0 : node,
            part: review ? 0 : part,
            run: deal.run,
            elapsedMs: result.elapsedMs,
          }),
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((data: { xp?: unknown; kind?: unknown; quests?: unknown; total?: unknown } | null) => {
            const quests = data ? readQuestUpdate(data.quests) : null;
            if (quests) clearQuestBoardCache();
            setXpGrant({
              xp: data && typeof data.xp === "number" ? data.xp : null,
              kind: data && typeof data.kind === "string" ? data.kind : null,
              pending: false,
              quests,
              total: data && typeof data.total === "number" ? data.total : null,
            });
          })
          .catch(() => {
            setXpGrant({ xp: null, kind: null, pending: false, quests: null, total: null });
          });
      }}
    />
  );
}
