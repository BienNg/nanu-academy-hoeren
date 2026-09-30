"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { McCard } from "@/components/session/McCard";
import { McFeedbackCard } from "@/components/session/McFeedbackCard";
import { PairingCard } from "@/components/session/PairingCard";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { ProfileButton } from "@/components/ProfileButton";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import { TodayXpChip } from "@/components/TodayXpChip";
import { requeueMissedClip } from "@/lib/progress";
import { reviewKey } from "@/lib/review";
import type { ReviewCard, ReviewClip } from "@/lib/review-store";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import { checkOrder } from "@/lib/sentence-order";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";
import { useProgress } from "@/lib/useProgress";

type ReviewSessionProps = {
  /** Clips graded by this session. */
  clips: ReviewClip[];
  /** Mixed cards for those clips: listening, order, multiple choice, pairing. */
  cards: ReviewCard[];
  /** All clips due today, including ones beyond this session. */
  dueCount: number;
  /** False when the review tables are not set up yet. */
  ready: boolean;
};

type ReviewSummaryState = {
  questionCount: number;
  accuracy: number;
  elapsedMs: number;
  xp: number | null;
  xpKind: string | null;
  xpPending: boolean;
  missedCount: number;
};

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function clipKeyOf(clip: ReviewClip): string {
  return reviewKey(clip.lessonKey, clip.id);
}

/**
 * One spaced-repetition session with the same card kinds as practice.
 * No hearts. A wrong answer sends the card further back in the queue, and
 * its clip counts as missed (back to box 0) when the session is stored.
 * Pairing mistakes are not graded: a wrong pair does not say which clip was
 * forgotten, and each paired clip has its own listening card anyway.
 */
export function ReviewSession({ clips, cards, dueCount, ready }: ReviewSessionProps) {
  const router = useRouter();
  const { recordWrongAttempt, recordPracticeDay, streakDays } = useProgress();
  const [queue, setQueue] = useState<ReviewCard[]>(cards);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [mcResult, setMcResult] = useState<McResult | null>(null);
  const [pairingSolved, setPairingSolved] = useState(false);
  const [summary, setSummary] = useState<ReviewSummaryState | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [xpTotal, setXpTotal] = useState<number | null>(null);
  const startedAtRef = useRef(0);
  const missedRef = useRef(new Set<string>());
  const finishedRef = useRef(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    let cancelled = false;
    void fetch("/api/xp")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: unknown } | null) => {
        if (cancelled || !data || typeof data.total !== "number") return;
        setXpTotal(Math.max(0, data.total));
      })
      .catch(() => {
        // The chip stays on a dash when the total cannot be read.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentCard = queue[index];
  const current = currentCard?.clip;
  const isPerfect =
    scoreResult?.accuracy === 100 || mcResult?.accuracy === 100 || pairingSolved;
  const remainingToday = Math.max(0, dueCount - clips.length);
  const xpGain = summary && !summary.xpPending && summary.xp ? summary.xp : 0;

  const progressSegments = useMemo(
    () =>
      Array.from({ length: Math.max(queue.length, 1) }, (_, position) => {
        if (position < index) return "done";
        if (position === index && currentCard) return "current";
        return "todo";
      }),
    [queue.length, index, currentCard],
  );

  const applyResult = (accuracy: number) => {
    if (!current) return;
    if (accuracy === 100) {
      playSuccessSound();
      return;
    }
    recordWrongAttempt();
    missedRef.current.add(clipKeyOf(current));
  };

  const handleSubmit = (value: string) => {
    if (!current) return;
    setDraft(value);
    const result = scoreAttempt(value, current.script);
    setScoreResult(result);
    applyResult(result.accuracy);
  };

  const handleOrderSubmit = (selected: string[]) => {
    if (!current) return;
    const result = checkOrder(selected, current.script);
    setScoreResult(result);
    applyResult(result.accuracy);
  };

  const handleMcSubmit = (selectedId: string) => {
    if (!currentCard?.options) return;
    const result = checkMc(selectedId, currentCard.options);
    setMcResult(result);
    applyResult(result.accuracy);
  };

  const handlePairingSolved = () => {
    if (pairingSolved) return;
    setPairingSolved(true);
    playSuccessSound();
  };

  const resetCardResults = () => {
    setScoreResult(null);
    setMcResult(null);
    setPairingSolved(false);
    setDraft("");
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const elapsedMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0;
    const outcomes = clips.map((clip) => ({
      lessonKey: clip.lessonKey,
      clipId: clip.id,
      missed: missedRef.current.has(clipKeyOf(clip)),
    }));
    const missedCount = outcomes.filter((clip) => clip.missed).length;
    const firstTry = outcomes.length - missedCount;
    setSummary({
      questionCount: outcomes.length,
      accuracy: outcomes.length === 0 ? 0 : Math.round((firstTry / outcomes.length) * 100),
      elapsedMs,
      xp: null,
      xpKind: null,
      xpPending: true,
      missedCount,
    });
    recordPracticeDay();
    playCelebrationSound();

    void fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), elapsedMs, clips: outcomes }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { xp?: unknown; kind?: unknown } | null) => {
        const xp = typeof data?.xp === "number" ? data.xp : null;
        setSummary((state) =>
          state
            ? {
                ...state,
                xp,
                xpKind: typeof data?.kind === "string" ? data.kind : null,
                xpPending: false,
              }
            : state,
        );
      })
      .catch(() => {
        setSummary((state) => (state ? { ...state, xpPending: false } : state));
      });
  };

  const handleNext = () => {
    if (!currentCard) return;
    if (!isPerfect) {
      setQueue((deck) => requeueMissedClip(deck, index));
      resetCardResults();
      return;
    }
    if (index + 1 >= queue.length) {
      finish();
      return;
    }
    resetCardResults();
    setIndex((position) => position + 1);
  };

  const leave = () => {
    setLeaving(true);
    // A refresh loads the next deck; the page keys this component by its clips.
    if (remainingToday > 0) router.refresh();
    else router.push("/");
  };

  return (
    <div
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-violet-100/40 to-blue-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <Link
            href="/"
            aria-label="Quay lại"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#0066cc] transition-colors hover:bg-[#f5f5f7] active:scale-95"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 text-center">
            <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#86868b]">
              Ôn tập · Wiederholen
            </span>
            <h1
              className="truncate font-headline-sm text-[15px] font-bold tracking-tight text-[#1d1d1f]"
              style={{ letterSpacing: "-0.015em" }}
            >
              {current && !summary ? current.lessonLabel : "Ôn tập hôm nay"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <TodayXpChip total={xpTotal} gain={xpGain} />
            <ProfileButton />
          </div>
        </div>
      </header>

      {leaving ? (
        <SessionContentSkeleton kind="practice" />
      ) : summary ? (
        <PartCompleteScreen
          partNumber={1}
          partCount={1}
          levelLabel="Ôn tập"
          chapterLabel={`${summary.questionCount} câu`}
          questionCount={summary.questionCount}
          accuracy={summary.accuracy}
          elapsedMs={summary.elapsedMs}
          xp={summary.xp}
          xpKind={summary.xpKind}
          xpPending={summary.xpPending}
          streakDays={streakDays}
          finishRun
          failed={false}
          title="Ôn tập xong!"
          subtitle={
            remainingToday > 0
              ? `Còn ${remainingToday} câu cần ôn hôm nay.`
              : "Bạn đã ôn hết các câu của hôm nay."
          }
          note={
            summary.missedCount > 0
              ? `${summary.missedCount} câu sai sẽ quay lại vào ngày mai`
              : null
          }
          continueLabel={remainingToday > 0 ? "Ôn tiếp" : "Về trang chủ"}
          onContinue={leave}
          secondaryLabel={remainingToday > 0 ? "Về trang chủ" : undefined}
          onSecondary={
            remainingToday > 0
              ? () => {
                  setLeaving(true);
                  router.push("/");
                }
              : undefined
          }
        />
      ) : !currentCard || !current ? (
        <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#dcfce7] text-[#16a34a]">
              <MaterialIcon name="task_alt" className="text-[34px]" filled />
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">
              {ready ? "Không có câu nào cần ôn" : "Ôn tập chưa sẵn sàng"}
            </h2>
            <p className="text-[16px] font-medium text-[#86868b]">
              {ready
                ? "Học bài mới hoặc quay lại vào ngày mai."
                : "Hãy thử lại sau."}
            </p>
            <Link
              href="/"
              className="mt-2 flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#0066cc] px-6 text-[17px] font-semibold text-white"
            >
              Về trang chủ
            </Link>
          </div>
        </main>
      ) : (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <header className="flex flex-col pt-6 pb-4">
              <div
                aria-label="Tiến độ ôn tập"
                className="grid w-full gap-1.5"
                style={{ gridTemplateColumns: `repeat(${progressSegments.length}, minmax(0, 1fr))` }}
              >
                {progressSegments.map((segment, position) => {
                  const filled = segment === "done" || (segment === "current" && isPerfect);
                  return (
                    <div
                      key={`seg-${position}`}
                      className="relative h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]"
                    >
                      <div
                        className="h-full origin-left rounded-full bg-[#7c3aed] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                        style={{ transform: filled ? "scaleX(1)" : "scaleX(0)" }}
                      />
                    </div>
                  );
                })}
              </div>
            </header>

            {currentCard.kind === "order" && !scoreResult ? (
              // Order cards hide the audio until checked, then it plays with the feedback.
              <SentenceOrderCard
                key={`order-${currentCard.key}:${index}`}
                translation={current.translationVi}
                chips={currentCard.bank ?? []}
                onSubmit={handleOrderSubmit}
              />
            ) : currentCard.kind === "multiple-choice" && !mcResult ? (
              <McCard
                key={`mc-${currentCard.key}:${index}`}
                prompt={current.script}
                options={currentCard.options ?? []}
                onSubmit={handleMcSubmit}
              />
            ) : currentCard.kind === "pairing" ? (
              <PairingCard
                key={`pairing-${currentCard.key}:${index}`}
                items={(currentCard.pairItems ?? []).map((clip) => ({
                  id: clip.id,
                  vi: clip.translationVi ?? "",
                  de: clip.script,
                }))}
                onMistake={recordWrongAttempt}
                onSolved={handlePairingSolved}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : currentCard.kind === "multiple-choice" && mcResult ? (
              <McFeedbackCard
                result={mcResult}
                options={currentCard.options ?? []}
                clip={current}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : (
              <>
                <AudioPlayerCard key={`${currentCard.key}:${index}`} audioPath={current.audioPath} />

                {scoreResult ? (
                  <FeedbackResultCard
                    result={scoreResult}
                    clip={current}
                    onNext={handleNext}
                    nextLabel="Tiếp theo"
                    skipOnMistake
                  />
                ) : (
                  <DictationInputCard
                    key={`dictation-${currentCard.key}:${index}`}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={handleSubmit}
                  />
                )}
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
