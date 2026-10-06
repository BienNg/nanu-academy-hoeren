"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionCourse } from "@/lib/session-course";
import type { GrammarTopicContent, TenseTables } from "@/lib/grammar-lessons";
import { grammarStudyParts } from "@/lib/grammar-node";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import { playSuccessSound } from "@/lib/sfx";
import { FeedbackSheet, praiseFor } from "@/components/session/FeedbackSheet";
import { McCard } from "@/components/session/McCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import { ContinueBar, GrammarHeader, GrammarPage } from "@/components/session/grammar/GrammarSessionFrame";
import { GrammarReadScreen } from "@/components/session/grammar/GrammarStudyScreens";
import { useGrammarProgress, type LessonGrammar } from "@/components/session/grammar/useGrammarProgress";

type GrammarStudySessionProps = {
  course: SessionCourse;
  topic: GrammarTopicContent;
  tables: TenseTables;
  /** 1-based study part (one per verb). */
  partNumber: number;
  /** `/learn/<level>/<lektion>/grammar`, without the page. */
  grammarHref: string;
  lessonGrammar: LessonGrammar;
};

/**
 * One study part of a grammar topic: screens to read with quick checks in
 * between. Checks have no hearts; a wrong answer shows the rule and moves on.
 */
export function GrammarStudySession({
  course,
  topic,
  tables,
  partNumber,
  lessonGrammar,
}: GrammarStudySessionProps) {
  const router = useRouter();
  const { finishPart, streakDays } = useGrammarProgress(course, lessonGrammar);
  const parts = useMemo(() => grammarStudyParts(course.lessonKey, topic, tables), [course.lessonKey, topic, tables]);
  const part = parts[partNumber - 1];
  const [index, setIndex] = useState(0);
  const [mcResult, setMcResult] = useState<McResult | null>(null);
  const [phase, setPhase] = useState<"screens" | "complete" | "leaving">("screens");
  const startedAtRef = useRef(0);
  const [checks, setChecks] = useState({ asked: 0, right: 0 });
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  const leave = (href: string) => {
    setPhase("leaving");
    router.push(href);
  };

  if (!part) {
    return (
      <GrammarPage>
        <SessionContentSkeleton kind="study" />
      </GrammarPage>
    );
  }

  const screens = part.screens;
  const screen = screens[index];
  const isLastPart = partNumber >= parts.length;
  const progress = screens.length === 0 ? 0 : (index + (mcResult ? 1 : 0)) / screens.length;

  const next = () => {
    setMcResult(null);
    if (index + 1 >= screens.length) {
      finishPart(topic.id, part.key, checks.asked);
      setElapsedMs(Date.now() - startedAtRef.current);
      setPhase("complete");
      return;
    }
    setIndex(index + 1);
  };

  const answerCheck = (selectedId: string) => {
    if (!screen || screen.kind !== "check" || mcResult) return;
    const result = checkMc(selectedId, screen.question.options);
    const right = result.accuracy === 100;
    setChecks((current) => ({ asked: current.asked + 1, right: current.right + (right ? 1 : 0) }));
    if (right) playSuccessSound();
    setMcResult(result);
  };

  if (phase === "leaving") {
    return (
      <GrammarPage>
        <SessionContentSkeleton kind="study" />
      </GrammarPage>
    );
  }

  if (phase === "complete") {
    const { asked, right } = checks;
    return (
      <GrammarPage>
        <PartCompleteScreen
          partNumber={partNumber}
          partCount={parts.length}
          levelLabel={course.groupLabel}
          chapterLabel={course.lessonLabel}
          questionCount={asked}
          accuracy={asked > 0 ? Math.round((right / asked) * 100) : null}
          elapsedMs={elapsedMs}
          xp={null}
          xpKind={null}
          xpPending={false}
          streakDays={streakDays}
          finishRun={isLastPart}
          failed={false}
          title={`Xong: ${part.verb}`}
          subtitle={isLastPart ? "Giờ luyện tập nhé!" : `Phần ${partNumber} / ${parts.length}`}
          continueLabel="Về bài học"
          onContinue={() => leave(course.pathHref)}
        />
      </GrammarPage>
    );
  }

  return (
    <GrammarPage header={<GrammarHeader progress={progress} onClose={() => leave(course.pathHref)} />}>
      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-2xl flex-col px-4 pt-6 pb-24 sm:px-6 [@media(max-height:700px)]:pt-3">
          {screen?.kind === "check" ? (
            <>
              <McCard
                key={screen.key}
                eyebrow="Thử nhanh · Kurzer Check"
                icon="edit_note"
                prompt={screen.question.prompt}
                hint={screen.question.hintVi}
                options={screen.question.options}
                onSubmit={answerCheck}
                result={mcResult}
              />
              {mcResult ? (
                <FeedbackSheet
                  tone={mcResult.accuracy === 100 ? "correct" : "wrong"}
                  title={mcResult.accuracy === 100 ? praiseFor(screen.key) : "Chưa đúng"}
                  actionLabel="Tiếp tục"
                  onAction={next}
                >
                  <p className="font-bold">
                    {screen.question.prompt.replace(
                      "____",
                      screen.question.options.find((option) => option.correct)?.text ?? "",
                    )}
                  </p>
                  {mcResult.accuracy !== 100 && screen.question.ruleVi ? (
                    <p className="opacity-90">{screen.question.ruleVi}</p>
                  ) : null}
                </FeedbackSheet>
              ) : null}
            </>
          ) : screen ? (
            <>
              <GrammarReadScreen key={screen.key} screen={screen} tables={tables} />
              <ContinueBar onContinue={next} />
            </>
          ) : null}
        </div>
      </main>
    </GrammarPage>
  );
}
