"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionCourse } from "@/lib/session-course";
import type { GrammarTense, GrammarTopicContent, TenseTables } from "@/lib/grammar-lessons";
import {
  checkErrorCheck,
  checkGrammarOrder,
  checkTableFill,
  grammarPracticeParts,
  type GrammarCard,
} from "@/lib/grammar-node";
import { GAP_BLANK } from "@/lib/grammar-gaps";
import { checkMc, type McOption, type McResult } from "@/lib/multiple-choice";
import { playSuccessSound } from "@/lib/sfx";
import { useProgress } from "@/lib/useProgress";
import { useGrammarProgress, type LessonGrammar } from "@/components/session/grammar/useGrammarProgress";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { FeedbackSheet, praiseFor, SheetLine } from "@/components/session/FeedbackSheet";
import { McCard } from "@/components/session/McCard";
import { PairingCard } from "@/components/session/PairingCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { QuitDialog } from "@/components/session/QuitDialog";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import { GrammarHeader, GrammarPage } from "@/components/session/grammar/GrammarSessionFrame";
import { TableFillCard } from "@/components/session/grammar/TableFillCard";

type GrammarPracticeSessionProps = {
  course: SessionCourse;
  topic: GrammarTopicContent;
  tables: TenseTables;
  /** 1-based practice part: one per verb, then the mixed part. */
  partNumber: number;
  /** `/learn/<level>/<lektion>/grammar`, without the page. */
  grammarHref: string;
  lessonGrammar: LessonGrammar;
};

/** What the student got on the card in front of them. */
type Outcome = {
  correct: boolean;
  mc?: McResult;
  table?: ReturnType<typeof checkTableFill>;
};

type Summary = {
  questionCount: number;
  accuracy: number;
  elapsedMs: number;
};

const ERROR_OK = "ok";
const ERROR_BAD = "bad";

function errorOptions(fix: string | null): McOption[] {
  return [
    { id: ERROR_OK, text: "Đúng ✓", correct: fix === null },
    { id: ERROR_BAD, text: "Sai ✗", correct: fix !== null },
  ];
}

function rightOption(options: readonly McOption[]): string {
  return options.find((option) => option.correct)?.text ?? "";
}

/** The sheet under a checked card: the right answer, and the rule after a miss. */
function FeedbackBody({
  card,
  outcome,
  tenseLabel,
}: {
  card: GrammarCard;
  outcome: Outcome;
  tenseLabel: (tense: GrammarTense) => string;
}) {
  const rule = !outcome.correct && card.ruleVi ? <p className="opacity-90">{card.ruleVi}</p> : null;
  switch (card.kind) {
    case "form-choice":
      return (
        <>
          <SheetLine
            script={card.question.prompt.replace(GAP_BLANK, rightOption(card.question.options))}
            translation={card.question.hintVi}
            audioPath={card.audioPath}
          />
          {rule}
        </>
      );
    case "tense-spot":
      return (
        <>
          <SheetLine script={card.script} translation={card.translationVi} audioPath={card.audioPath} />
          {outcome.correct ? null : <p className="opacity-90">Đây là {rightOption(card.options)}.</p>}
        </>
      );
    case "error-check":
      return card.fix ? (
        <>
          <p className="line-through opacity-70">{card.script}</p>
          <p className="font-bold">{card.fix}</p>
          {card.ruleVi ? <p className="opacity-90">{card.ruleVi}</p> : null}
        </>
      ) : (
        <p className="font-bold">Câu này đúng: {card.script}</p>
      );
    case "tense-transform":
    case "bracket-order":
      return (
        <>
          <SheetLine script={card.script} translation={card.translationVi} />
          {rule}
        </>
      );
    case "table-fill":
      return (
        <>
          <p className="font-bold">
            {tenseLabel(card.tense)}:{" "}
            {card.rows
              .filter((row) => row.text === null)
              .map((row) => `${row.personLabel} ${row.answer}`)
              .join(" · ")}
          </p>
          {rule}
        </>
      );
    case "pronoun-pairing":
      return rule;
  }
}

/**
 * One practice part of a grammar topic. A wrong answer stays on the card
 * until the student gives the right one. There are no hearts.
 */
export function GrammarPracticeSession({
  course,
  topic,
  tables,
  partNumber,
  grammarHref,
  lessonGrammar,
}: GrammarPracticeSessionProps) {
  const router = useRouter();
  const { recordWrongAttempt } = useProgress();
  const { finishPart, streakDays } = useGrammarProgress(course, lessonGrammar);
  const parts = useMemo(
    () => grammarPracticeParts(course.lessonKey, topic, tables),
    [course.lessonKey, topic, tables],
  );
  const part = parts[partNumber - 1];

  const [queue] = useState<GrammarCard[]>(() => part?.cards ?? []);
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tally, setTally] = useState({ answered: 0, right: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [phase, setPhase] = useState<"cards" | "complete" | "leaving">("cards");
  const [quitOpen, setQuitOpen] = useState(false);
  const startedAtRef = useRef(0);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  const card = queue[index];
  const tenseLabel = (tense: GrammarTense) => tables.tenses.find((entry) => entry.id === tense)?.label ?? tense;
  const progress = queue.length === 0 ? 0 : (index + (outcome?.correct ? 1 : 0)) / queue.length;
  const isLastPart = partNumber >= parts.length;

  const leave = (href: string) => {
    setPhase("leaving");
    router.push(href);
  };

  /** Scores this try. A miss stays on the card until the answer is right. */
  const answer = (result: Outcome) => {
    if (!card || outcome) return;
    setOutcome(result);
    setTally((current) => ({ answered: current.answered + 1, right: current.right + (result.correct ? 1 : 0) }));
    if (result.correct) playSuccessSound();
    else recordWrongAttempt();
  };

  const retry = () => {
    setOutcome(null);
    setAttempt((current) => current + 1);
  };

  const finish = () => {
    const answered = tally.answered;
    if (part) finishPart(topic.id, part.key, answered);
    setSummary({
      questionCount: answered,
      accuracy: answered === 0 ? 0 : Math.round((tally.right / answered) * 100),
      elapsedMs: Date.now() - startedAtRef.current,
    });
    setPhase("complete");
  };

  const next = () => {
    if (!outcome?.correct) return;
    if (index + 1 >= queue.length) {
      finish();
      return;
    }
    setOutcome(null);
    setAttempt(0);
    setIndex(index + 1);
  };

  if (phase === "leaving" || !part) {
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
          partNumber={partNumber}
          partCount={parts.length}
          levelLabel={course.groupLabel}
          chapterLabel={course.lessonLabel}
          questionCount={summary.questionCount}
          accuracy={summary.accuracy}
          elapsedMs={summary.elapsedMs}
          xp={null}
          xpKind={null}
          xpPending={false}
          streakDays={streakDays}
          finishRun={isLastPart}
          failed={false}
          // A replay starts at part 1 too, so the next part is always one tap away.
          {...(!isLastPart
            ? {
                continueLabel: "Phần tiếp theo",
                onContinue: () =>
                  leave(`${grammarHref}/practice?topic=${encodeURIComponent(topic.id)}&part=${partNumber + 1}`),
                secondaryLabel: "Về bài học",
                onSecondary: () => leave(course.pathHref),
              }
            : { continueLabel: "Về bài học", onContinue: () => leave(course.pathHref) })}
        />
      </GrammarPage>
    );
  }

  const cardKey = `${index}-${card?.key ?? ""}-${attempt}`;
  const mcResult = outcome?.mc ?? null;

  return (
    <GrammarPage
      header={
        <GrammarHeader
          progress={progress}
          onClose={() => (tally.answered === 0 ? leave(course.pathHref) : setQuitOpen(true))}
        />
      }
    >
      {quitOpen ? (
        <QuitDialog
          message="Bạn sẽ mất tiến độ của phần này nếu dừng bây giờ."
          onStay={() => setQuitOpen(false)}
          onQuit={() => leave(course.pathHref)}
        />
      ) : null}

      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-2xl flex-col px-4 pt-6 pb-24 sm:px-6">
          {!card ? null : card.kind === "form-choice" ? (
            <McCard
              key={cardKey}
              eyebrow="Ngữ pháp · Chọn dạng đúng"
              icon="edit_note"
              prompt={card.question.prompt}
              hint={card.question.hintVi}
              options={card.question.options}
              result={mcResult}
              onSubmit={(selectedId) => {
                const mc = checkMc(selectedId, card.question.options);
                answer({ correct: mc.accuracy === 100, mc });
              }}
            />
          ) : card.kind === "tense-spot" ? (
            <McCard
              key={cardKey}
              eyebrow="Nghe · Hören"
              icon="hearing"
              prompt="Câu này ở thì nào?"
              options={card.options}
              result={mcResult}
              afterPrompt={
                <div className="mt-4">
                  <AudioPlayerCard key={`audio-${cardKey}`} audioPath={card.audioPath} />
                </div>
              }
              onSubmit={(selectedId) => {
                const mc = checkMc(selectedId, card.options);
                answer({ correct: mc.accuracy === 100, mc });
              }}
            />
          ) : card.kind === "error-check" ? (
            <McCard
              key={cardKey}
              eyebrow="Câu này đúng hay sai?"
              icon="rule"
              prompt={card.script}
              options={errorOptions(card.fix)}
              result={mcResult}
              onSubmit={(selectedId) => {
                const options = errorOptions(card.fix);
                const mc = checkMc(selectedId, options);
                answer({ correct: checkErrorCheck(card.fix, selectedId === ERROR_OK).accuracy === 100, mc });
              }}
            />
          ) : card.kind === "tense-transform" ? (
            <SentenceOrderCard
              key={cardKey}
              eyebrow="Đổi thì · Zeitform"
              instruction={`Chuyển sang ${tenseLabel(card.tense)}`}
              translation={card.from}
              chips={card.bank}
              locked={outcome !== null}
              onSubmit={(selected) => answer({ correct: checkGrammarOrder(selected, card.script).accuracy === 100 })}
            />
          ) : card.kind === "bracket-order" ? (
            <SentenceOrderCard
              key={cardKey}
              eyebrow="Perfekt · Satzklammer"
              translation={card.translationVi}
              chips={card.bank}
              locked={outcome !== null}
              onSubmit={(selected) => answer({ correct: checkGrammarOrder(selected, card.script).accuracy === 100 })}
            />
          ) : card.kind === "table-fill" ? (
            <TableFillCard
              key={cardKey}
              verb={card.verb ?? ""}
              tense={card.tense}
              tenseLabel={tenseLabel(card.tense)}
              rows={card.rows}
              bank={card.bank}
              result={outcome?.table ?? null}
              onSubmit={(placed) => {
                const table = checkTableFill(card.rows, placed);
                answer({ correct: table.accuracy === 100, table });
              }}
            />
          ) : (
            <PairingCard
              key={cardKey}
              items={card.items.map((item) => ({ id: item.id, vi: item.person, de: item.form }))}
              locked={outcome !== null}
              onMistake={() => answer({ correct: false })}
              onSolved={() => answer({ correct: true })}
              onNext={next}
              nextLabel="Tiếp theo"
            />
          )}

          {card && outcome && (card.kind !== "pronoun-pairing" || !outcome.correct) ? (
            <FeedbackSheet
              tone={outcome.correct ? "correct" : "wrong"}
              title={outcome.correct ? praiseFor(cardKey) : "Chưa đúng"}
              actionLabel={outcome.correct ? "Tiếp theo" : "Thử lại"}
              onAction={outcome.correct ? next : retry}
            >
              <FeedbackBody card={card} outcome={outcome} tenseLabel={tenseLabel} />
            </FeedbackSheet>
          ) : null}
        </div>
      </main>
    </GrammarPage>
  );
}
