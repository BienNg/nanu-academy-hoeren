"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionCourse } from "@/lib/session-course";
import type { GrammarTopicContent, TenseTables } from "@/lib/grammar-lessons";
import { checkStudyTranslate, grammarStudyParts, isStudyTask, type GrammarStudyTask } from "@/lib/grammar-node";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import { playSuccessSound } from "@/lib/sfx";
import { FeedbackSheet, praiseFor, SheetLine } from "@/components/session/FeedbackSheet";
import { McCard } from "@/components/session/McCard";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import { ContinueBar, GrammarHeader, GrammarPage } from "@/components/session/grammar/GrammarSessionFrame";
import { CueText, GrammarReadScreen } from "@/components/session/grammar/GrammarStudyScreens";
import { useGrammarProgress, type LessonGrammar } from "@/components/session/grammar/useGrammarProgress";

type GrammarStudySessionProps = {
  course: SessionCourse;
  topic: GrammarTopicContent;
  tables: TenseTables;
  /** 1-based study part. */
  partNumber: number;
  /** `/learn/<level>/<lektion>/grammar`, without the page. */
  grammarHref: string;
  lessonGrammar: LessonGrammar;
};

/** A checked task: whether it was right, and the sentence to show. */
type Answered = { correct: boolean; answer: string; mc?: McResult };

/** The sheet under a checked task: the right sentence, the rule after a miss. */
function TaskFeedback({ screen, answered }: { screen: GrammarStudyTask; answered: Answered }) {
  const rule = answered.correct ? null : <p className="opacity-90">{screen.ruleVi}</p>;
  if (screen.kind === "choice") {
    return (
      <>
        <SheetLine script={screen.script} translation={screen.cue.vi} audioPath={screen.audioPath} />
        {rule}
      </>
    );
  }
  // Other word orders are right too, so they are shown after the one given.
  const others = screen.answers.filter((answer) => answer !== answered.answer);
  return (
    <>
      <SheetLine
        script={answered.answer}
        translation={screen.cue.vi}
        audioPath={screen.audioPaths[screen.answers.indexOf(answered.answer)] ?? null}
      />
      {others.length > 0 ? <p className="opacity-90">Cũng đúng: {others.join(" · ")}</p> : null}
      {rule}
    </>
  );
}

/**
 * One study part of a grammar topic, screen by screen as on the class slides.
 * Tasks have no hearts; a wrong answer shows the rule and moves on.
 */
export function GrammarStudySession({
  course,
  topic,
  tables,
  partNumber,
  grammarHref,
  lessonGrammar,
}: GrammarStudySessionProps) {
  const router = useRouter();
  const { finishPart, streakDays } = useGrammarProgress(course, lessonGrammar);
  const parts = useMemo(() => grammarStudyParts(course.lessonKey, topic), [course.lessonKey, topic]);
  const part = parts[partNumber - 1];
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered | null>(null);
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
  const progress = screens.length === 0 ? 0 : (index + (answered ? 1 : 0)) / screens.length;

  const next = () => {
    setAnswered(null);
    if (index + 1 >= screens.length) {
      finishPart(topic.id, part.key, checks.asked);
      setElapsedMs(Date.now() - startedAtRef.current);
      setPhase("complete");
      return;
    }
    setIndex(index + 1);
  };

  const settle = (result: Answered) => {
    setChecks((current) => ({ asked: current.asked + 1, right: current.right + (result.correct ? 1 : 0) }));
    if (result.correct) playSuccessSound();
    setAnswered(result);
  };

  const answerChoice = (selectedId: string) => {
    if (!screen || screen.kind !== "choice" || answered) return;
    const mc = checkMc(selectedId, screen.options);
    settle({ correct: mc.accuracy === 100, answer: screen.script, mc });
  };

  const answerTranslate = (selected: string[]) => {
    if (!screen || screen.kind !== "translate" || answered) return;
    const result = checkStudyTranslate(selected, screen.answers);
    settle({ correct: result.accuracy === 100, answer: result.answer });
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
          title={`Xong: ${part.titleVi}`}
          subtitle={isLastPart ? "Giờ luyện tập nhé!" : `Phần ${partNumber} / ${parts.length}`}
          // A replay starts at part 1 too, so the next part is always one tap away.
          {...(!isLastPart
            ? {
                continueLabel: "Phần tiếp theo",
                onContinue: () =>
                  leave(`${grammarHref}/study?topic=${encodeURIComponent(topic.id)}&part=${partNumber + 1}`),
                secondaryLabel: "Về bài học",
                onSecondary: () => leave(course.pathHref),
              }
            : { continueLabel: "Về bài học", onContinue: () => leave(course.pathHref) })}
        />
      </GrammarPage>
    );
  }

  return (
    <GrammarPage header={<GrammarHeader progress={progress} onClose={() => leave(course.pathHref)} />}>
      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-2xl flex-col px-4 pt-6 pb-24 sm:px-6 [@media(max-height:700px)]:pt-3">
          {screen && isStudyTask(screen) ? (
            <>
              {screen.kind === "choice" ? (
                <McCard
                  key={screen.key}
                  eyebrow="Übung · Präteritum"
                  icon="edit_note"
                  prompt={
                    <>
                      <span className="block text-[17px] font-medium text-[#3a3a3c]">
                        <CueText cue={screen.cue} />
                      </span>
                      {screen.prompt ? <span className="mt-1 block">{screen.prompt}</span> : null}
                    </>
                  }
                  layout={screen.prompt ? "grid" : "list"}
                  options={screen.options}
                  onSubmit={answerChoice}
                  result={answered?.mc ?? null}
                />
              ) : (
                <SentenceOrderCard
                  key={screen.key}
                  eyebrow="Übung · Präteritum"
                  translation={<CueText cue={screen.cue} />}
                  chips={screen.bank}
                  locked={answered !== null}
                  onSubmit={answerTranslate}
                  afterPrompt={
                    screen.hints.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2 px-1">
                        {screen.hints.map((hint) => (
                          <li
                            key={hint.de}
                            className="rounded-full bg-[#f0f0f3] px-3 py-1 text-[14px] text-[#3a3a3c]"
                          >
                            <strong className="font-bold text-[#1d1d1f]">{hint.de}</strong>: {hint.vi}
                          </li>
                        ))}
                      </ul>
                    ) : null
                  }
                />
              )}
              {answered ? (
                <FeedbackSheet
                  tone={answered.correct ? "correct" : "wrong"}
                  title={answered.correct ? praiseFor(screen.key) : "Chưa đúng"}
                  actionLabel="Tiếp tục"
                  onAction={next}
                >
                  <TaskFeedback screen={screen} answered={answered} />
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
