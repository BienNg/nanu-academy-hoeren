"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionCourse } from "@/lib/session-course";
import type { GrammarTopicContent, TenseTables } from "@/lib/grammar-lessons";
import {
  checkStudyTranslate,
  grammarStudyParts,
  isStudyTask,
  type GrammarStudyScreen,
  type GrammarStudyTask,
} from "@/lib/grammar-node";
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
  /** Which authored script this page plays. Practice uses the same screens. */
  node?: "study" | "practice";
};

/**
 * Steps of one authored screen share a scene: the card stays, and only the new
 * piece slides. A different screen is a new slide.
 */
function studyScene(screen: GrammarStudyScreen): string {
  if (
    screen.kind === "known" ||
    screen.kind === "table" ||
    screen.kind === "beispiele" ||
    screen.kind === "timeline" ||
    screen.kind === "hook"
  ) {
    return screen.key.replace(/:\d+$/, "");
  }
  return screen.key;
}

/** A checked task: whether it was right, and the sentence to show. */
type Answered = { correct: boolean; answer: string; mc?: McResult };

/** The sheet under a checked task: the right sentence, the rule after a miss. */
function TaskFeedback({ screen, answered }: { screen: GrammarStudyTask; answered: Answered }) {
  const rule = answered.correct ? null : <p className="opacity-90">{screen.ruleVi}</p>;
  if (screen.kind === "choice") {
    return (
      <>
        <SheetLine script={screen.script} translation={screen.cue.vi} audioPath={screen.audioPath} autoPlay />
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
        autoPlay
      />
      {others.length > 0 ? <p className="opacity-90">Cũng đúng: {others.join(" · ")}</p> : null}
      {rule}
    </>
  );
}

/**
 * One study part of a grammar topic, screen by screen as on the class slides.
 * Tasks have no hearts. A wrong answer stays until the right one is given.
 */
export function GrammarStudySession({
  course,
  topic,
  tables,
  partNumber,
  grammarHref,
  lessonGrammar,
  node = "study",
}: GrammarStudySessionProps) {
  const router = useRouter();
  const { finishPart, streakDays } = useGrammarProgress(course, lessonGrammar);
  const parts = useMemo(() => grammarStudyParts(course.lessonKey, topic, node), [course.lessonKey, topic, node]);
  const partIndex = Math.min(Math.max(partNumber, 1), Math.max(parts.length, 1)) - 1;
  const part = parts[partIndex];
  const shownPart = partIndex + 1;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  /** True when this step opens a different slide. A later step of the same slide does not. */
  const [slideScene, setSlideScene] = useState(false);
  const [answered, setAnswered] = useState<Answered | null>(null);
  /** Bumps so a missed task remounts empty and has to be answered again. */
  const [attempt, setAttempt] = useState(0);
  /** The opening screen stays put; a new slide then enters from the direction of travel. */
  const hasMoved = useRef(false);
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
  const isLastPart = shownPart >= parts.length;
  const progress = screens.length === 0 ? 0 : (index + (answered ? 1 : 0)) / screens.length;

  const next = () => {
    setAnswered(null);
    if (index + 1 >= screens.length) {
      finishPart(topic.id, part.key, checks.asked);
      setElapsedMs(Date.now() - startedAtRef.current);
      setPhase("complete");
      return;
    }
    hasMoved.current = true;
    setDirection(1);
    setAttempt(0);
    const upcoming = screens[index + 1];
    setSlideScene(screen != null && upcoming != null && studyScene(screen) !== studyScene(upcoming));
    setIndex(index + 1);
  };

  const back = () => {
    if (index === 0) return;
    hasMoved.current = true;
    setDirection(-1);
    setAttempt(0);
    const previous = screens[index - 1];
    setSlideScene(screen != null && previous != null && studyScene(screen) !== studyScene(previous));
    setAnswered(null);
    setIndex(index - 1);
  };

  const retry = () => {
    setAnswered(null);
    setAttempt((current) => current + 1);
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
          partNumber={shownPart}
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
          subtitle={isLastPart ? (node === "study" ? "Giờ luyện tập nhé!" : "Xong bài ngữ pháp.") : `Phần ${shownPart} / ${parts.length}`}
          // A replay starts at part 1 too, so the next part is always one tap away.
          {...(!isLastPart
            ? {
                continueLabel: "Phần tiếp theo",
                onContinue: () =>
                  leave(`${grammarHref}/${node}?topic=${encodeURIComponent(topic.id)}&part=${shownPart + 1}`),
                secondaryLabel: "Về bài học",
                onSecondary: () => leave(course.pathHref),
              }
            : { continueLabel: "Về bài học", onContinue: () => leave(course.pathHref) })}
        />
      </GrammarPage>
    );
  }

  const scene = screen ? studyScene(screen) : "empty";
  // A new slide moves as a whole. A step of the same slide only reveals what it adds.
  const revealStep = !slideScene && direction === 1 && hasMoved.current;

  return (
    <GrammarPage header={<GrammarHeader progress={progress} onClose={() => leave(course.pathHref)} />}>
      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-lg flex-1 flex-col overflow-x-clip px-4 pt-4 sm:px-6">
          {screen ? (
            <div key={scene} className={["flex w-full flex-1 flex-col", slideScene ? (direction < 0 ? "study-scene-back" : "study-scene-in") : ""].filter(Boolean).join(" ")}>
          {isStudyTask(screen) ? (
            <>
              {screen.kind === "choice" ? (
                <McCard
                  key={`${screen.key}:${attempt}`}
                  onBack={back}
                  backDisabled={index === 0}
                  speaker={Boolean(screen.prompt)}
                  eyebrow={screen.cue.tense ? "Übung · Präteritum" : topic.titleVi}
                  icon="edit_note"
                  prompt={
                    screen.prompt ?? (
                      <span className="block text-[17px] font-medium text-[#3a3a3c]">
                        <CueText cue={screen.cue} />
                      </span>
                    )
                  }
                  hint={screen.prompt ? <CueText cue={screen.cue} /> : undefined}
                  layout={screen.prompt ? "grid" : "list"}
                  options={screen.options}
                  onSubmit={answerChoice}
                  result={answered?.mc ?? null}
                />
              ) : (
                <SentenceOrderCard
                  key={`${screen.key}:${attempt}`}
                  onBack={back}
                  backDisabled={index === 0}
                  eyebrow={screen.cue.tense ? "Übung · Präteritum" : topic.titleVi}
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
                  actionLabel={answered.correct ? "Tiếp tục" : "Thử lại"}
                  onAction={answered.correct ? next : retry}
                  onBack={back}
                  backDisabled={index === 0}
                >
                  <TaskFeedback screen={screen} answered={answered} />
                </FeedbackSheet>
              ) : null}
            </>
          ) : (
            <GrammarReadScreen screen={screen} tables={tables} reveal={revealStep} />
          )}
            </div>
          ) : null}
          {screen && !isStudyTask(screen) ? (
            <ContinueBar onContinue={next} onBack={back} backDisabled={index === 0} />
          ) : null}
        </div>
      </main>
    </GrammarPage>
  );
}
