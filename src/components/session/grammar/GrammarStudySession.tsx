"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionCourse } from "@/lib/session-course";
import type { GrammarTopicContent, TenseTables } from "@/lib/grammar-lessons";
import { grammarStudyParts, type GrammarStudyScreen } from "@/lib/grammar-node";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import { playSuccessSound } from "@/lib/sfx";
import { useProgress } from "@/lib/useProgress";
import { FeedbackSheet, praiseFor, SpeakButton } from "@/components/session/FeedbackSheet";
import { McCard } from "@/components/session/McCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import { ConjugationTableView, TENSE_TONE } from "@/components/session/grammar/ConjugationTableView";
import { ContinueBar, GrammarHeader, GrammarPage } from "@/components/session/grammar/GrammarSessionFrame";
import { SentenceBracketView } from "@/components/session/grammar/SentenceBracketView";

type GrammarStudySessionProps = {
  course: SessionCourse;
  topic: GrammarTopicContent;
  tables: TenseTables;
  /** 1-based study part (one per verb). */
  partNumber: number;
  /** `/learn/<level>/<lektion>/grammar`, without the page. */
  grammarHref: string;
};

const TENSE_INTRO_VI: Record<string, string> = {
  praesens: "Hiện tại: ich habe, ich bin",
  perfekt: "Quá khứ (nói): haben/sein + Partizip II",
  praeteritum: "Quá khứ (1 từ): ich hatte, ich war",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">{children}</span>;
}

/** Every screen except quick checks: read, then continue. */
function ReadScreen({ screen, tables }: { screen: Exclude<GrammarStudyScreen, { kind: "check" }>; tables: TenseTables }) {
  switch (screen.kind) {
    case "intro":
      return (
        <Card>
          <Eyebrow>Ngữ pháp · Grammatik</Eyebrow>
          <h1 className="text-[26px] font-extrabold leading-8 tracking-tight text-[#1d1d1f]">{screen.titleVi}</h1>
          <p className="text-[16px] leading-snug text-[#3a3a3c]">Tiếng Đức có 2 cách nói về quá khứ. Bạn sẽ học cả hai, cùng với hiện tại:</p>
          <ul className="flex flex-col gap-2">
            {screen.tenses.map((tense) => {
              const meta = tables.tenses.find((entry) => entry.id === tense);
              return (
                <li key={tense} className="flex items-center gap-3">
                  <span className={`w-[112px] shrink-0 rounded-xl px-2 py-1.5 text-center text-[14px] font-extrabold ${TENSE_TONE[tense].head}`}>
                    {meta?.label ?? tense}
                  </span>
                  <span className="text-[15px] text-[#3a3a3c]">{TENSE_INTRO_VI[tense] ?? meta?.labelVi}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      );
    case "table":
      return <ConjugationTableView table={screen.table} />;
    case "bracket":
      return (
        <SentenceBracketView
          bracket={screen.bracket}
          script={screen.example.script}
          translationVi={screen.example.translationVi}
          audioPath={screen.example.audioPath}
        />
      );
    case "tips":
      return (
        <Card>
          <Eyebrow>Ghi nhớ · Merken</Eyebrow>
          <ul className="flex flex-col gap-3">
            {screen.tips.map((tip) => (
              <li key={tip.id} className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
                <p className="text-[16px] font-bold text-[#1d1d1f]">{tip.titleVi}</p>
                <p className="mt-1 text-[15px] leading-snug text-[#3a3a3c]">{tip.textVi}</p>
              </li>
            ))}
          </ul>
        </Card>
      );
    case "examples":
      return (
        <Card>
          <Eyebrow>Ví dụ · Beispiele</Eyebrow>
          <ul className="flex flex-col gap-2">
            {screen.examples.map((example) => (
              <li key={example.id} className="flex items-start gap-3 rounded-2xl bg-[#f5f5f7] px-4 py-3">
                {example.audioPath ? <SpeakButton audioPath={example.audioPath} /> : null}
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold text-[#1d1d1f]">{example.script}</p>
                  <p className="text-[14px] italic text-[#6e6e73]">“{example.translationVi}”</p>
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${TENSE_TONE[example.tense].head}`}
                >
                  {tables.tenses.find((tense) => tense.id === example.tense)?.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      );
  }
}

/**
 * One study part of a grammar topic: screens to read with quick checks in
 * between. Checks have no hearts; a wrong answer shows the rule and moves on.
 */
export function GrammarStudySession({ course, topic, tables, partNumber, grammarHref }: GrammarStudySessionProps) {
  const router = useRouter();
  const { streakDays } = useProgress();
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
  const topicQuery = `topic=${encodeURIComponent(topic.id)}`;
  const progress = screens.length === 0 ? 0 : (index + (mcResult ? 1 : 0)) / screens.length;

  const next = () => {
    setMcResult(null);
    if (index + 1 >= screens.length) {
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
          continueLabel={isLastPart ? "Luyện ngữ pháp" : "Phần tiếp theo"}
          onContinue={() =>
            leave(
              isLastPart
                ? `${grammarHref}/practice?${topicQuery}`
                : `${grammarHref}/study?${topicQuery}&part=${partNumber + 1}`,
            )
          }
          secondaryLabel="Về bài học"
          onSecondary={() => leave(course.pathHref)}
        />
      </GrammarPage>
    );
  }

  return (
    <GrammarPage header={<GrammarHeader progress={progress} onClose={() => leave(course.pathHref)} />}>
      <main className="relative flex w-full flex-1 flex-col items-center">
        <div className="flex w-full max-w-2xl flex-col px-4 pt-6 pb-24 sm:px-6">
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
              <ReadScreen key={screen.key} screen={screen} tables={tables} />
              <ContinueBar onContinue={next} />
            </>
          ) : null}
        </div>
      </main>
    </GrammarPage>
  );
}
