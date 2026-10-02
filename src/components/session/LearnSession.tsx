"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionCourse } from "@/lib/session-course";
import type { SessionClip } from "@/lib/content";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { McCard } from "@/components/session/McCard";
import { McFeedbackCard } from "@/components/session/McFeedbackCard";
import { PairingCard } from "@/components/session/PairingCard";
import { NumberInputCard } from "@/components/session/NumberInputCard";
import { checkNumberAnswer } from "@/lib/living-content";
import {
  catalogCompletedCount,
  clipsInStoredOrder,
  firstIncompletePartIndex,
  learnQueue,
  openListeningParts,
  preservedReviewOrder,
  sameClipOrderSet,
  requeueMissedClip,
  splitListeningParts,
  withFinishedCatalogClips,
} from "@/lib/progress";
import { isAdminUser } from "@/lib/admins";
import { revealStreakCelebration, useProgress, useStreakCelebrationPending } from "@/lib/useProgress";
import {
  buildListeningRunRecord,
  clipResultsForCardDeck,
  missedAttempt,
  submitListeningRun,
  type MissedAnswers,
  type MissedAttempt,
} from "@/lib/listening-runs";
import type { CardKind } from "@/lib/card-kinds";
import { buildPracticeDeck, checkOrder, statsCardKind, type PracticeCard } from "@/lib/sentence-order";
import { insertDiscreteCards } from "@/lib/practice-deck";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import type { PairingResult } from "@/lib/pairing";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { playCelebrationSound, playHeartLostSound, playSuccessSound } from "@/lib/sfx";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { TodayXpChip } from "@/components/TodayXpChip";
import { ProfileButton } from "@/components/ProfileButton";
import { SessionContentSkeleton } from "@/components/RouteLoading";

type LearnSessionProps = {
  course: SessionCourse;
  clips: SessionClip[];
  nextChapterHref: string;
  hasNextChapter: boolean;
};

const LISTENING_HEARTS = 3;
const PRACTICE_FOCUS_KEY = "nanu-focus-luyen-nghe";
const pendingRunOrders = new Map<string, string[]>();
const replacementRunOrders = new Map<string, string[]>();

type PartSummary = {
  questionCount: number;
  accuracy: number;
  elapsedMs: number;
  failed: boolean;
  xp: number | null;
  xpKind: string | null;
  xpPending: boolean;
};

function PartHearts({
  remaining,
  breakingIndex,
}: {
  remaining: number;
  breakingIndex: number | null;
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${remaining} trên ${LISTENING_HEARTS} tim`}
    >
      {Array.from({ length: LISTENING_HEARTS }, (_, index) => {
        const filled = index < remaining || index === breakingIndex;
        return (
          <span
            key={index}
            className={`material-symbols-outlined text-[20px] ${
              filled ? "text-[#ff3b30]" : "text-[#d2d2d7]"
            } ${index === breakingIndex ? "heart-break" : ""}`}
            style={{ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
            aria-hidden="true"
          >
            favorite
          </span>
        );
      })}
    </div>
  );
}

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

function freshRunOrder(chapterSlug: string, clips: readonly SessionClip[]): string[] {
  const order = learnQueue(clips, [], true).map((clip) => clip.id);
  pendingRunOrders.set(chapterSlug, order);
  return order;
}

function stableRunOrder(chapterSlug: string, clips: readonly SessionClip[]): string[] {
  const pending = pendingRunOrders.get(chapterSlug);
  if (pending && sameClipOrderSet(clips, pending)) return pending;
  return freshRunOrder(chapterSlug, clips);
}

export function LearnSession({
  course,
  clips,
  nextChapterHref,
  hasNextChapter,
}: LearnSessionProps) {
  const router = useRouter();
  const { data: authSession, status } = useSession();
  const [partClips, setPartClips] = useState<SessionClip[] | null>(null);
  const [partCards, setPartCards] = useState<PracticeCard<SessionClip>[] | null>(null);
  const [partNumber, setPartNumber] = useState(1);
  const [partCount, setPartCount] = useState(0);
  const [clipIndex, setClipIndex] = useState(0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [mcResult, setMcResult] = useState<McResult | null>(null);
  const [pairingResult, setPairingResult] = useState<PairingResult | null>(null);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<PartSummary | null>(null);
  const [heartsLeft, setHeartsLeft] = useState(LISTENING_HEARTS);
  const [breakingIndex, setBreakingIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<"practice" | "complete" | "leaving">("practice");
  const [xpTotal, setXpTotal] = useState<number | null>(null);
  const awardedXpRef = useRef(0);
  const initializedSourceRef = useRef("");
  const committedRef = useRef(false);
  const completingRef = useRef(false);
  const failedRef = useRef(false);
  const partStartedAtRef = useRef(0);
  const missedClipIdsRef = useRef(new Set<string>());
  const missedKindsRef = useRef(new Map<string, Set<CardKind>>());
  const missedAnswersRef = useRef(new Map<string, MissedAnswers>());
  const missedCardKeysRef = useRef(new Set<string>());
  const pairingSolvedKeyRef = useRef<string | null>(null);

  const {
    completedLearnClipIdsFor,
    completedLearnRunClipIdsFor,
    learnRunClipOrderFor,
    learnChapterCompleted,
    learnStudyCompleted,
    progressReady,
    absorbLessonClips,
    markLearnChapterDone,
    setLearnRunOrder,
    commitLearnListeningPart,
    recordWrongAttempt,
    streakDays,
  } = useProgress();
  const streakCelebrationPending = useStreakCelebrationPending();
  const chapterProgressKey = course.progressKey;
  const lessonKey = course.lessonKey;
  const pathHref = course.pathHref;
  const completedIds = completedLearnClipIdsFor(chapterProgressKey);
  const runCompletedIds = completedLearnRunClipIdsFor(chapterProgressKey);
  const runOrder = learnRunClipOrderFor(chapterProgressKey);
  const chapterMarkedDone = learnChapterCompleted(chapterProgressKey);
  const adminBypass =
    status === "authenticated" && isAdminUser(authSession?.user ?? {});
  const practiceLocked =
    status !== "loading" &&
    !adminBypass &&
    clips.length > 0 &&
    !learnStudyCompleted(chapterProgressKey);
  const completedKey = completedIds.join("\n");
  const runCompletedKey = runCompletedIds.join("\n");
  const runOrderKey = runOrder.join("\n");
  const clipKey = clips.map((clip) => `${clip.id}\t${clip.script}`).join("\n");

  // One part per visit. Ordered on the first pass, shuffled once per review run.
  // Progress is written only when the part ends, so leaving early restarts it.
  useEffect(() => {
    if (!progressReady || !practiceLocked) return;
    router.replace(pathHref);
  }, [progressReady, practiceLocked, router, pathHref]);

  useEffect(() => {
    if (status === "loading" || !progressReady || practiceLocked) return;
    if (phase !== "practice") return;
    if (
      clipIndex !== 0 ||
      scoreResult !== null ||
      mcResult !== null ||
      pairingResult !== null ||
      draft.length > 0
    ) {
      return;
    }

    if (clips.length === 0) {
      if (initializedSourceRef.current === "empty") return;
      initializedSourceRef.current = "empty";
      setPartClips([]);
      setPartCards([]);
      setPartCount(0);
      setPartNumber(1);
      return;
    }

    const clipIds = clips.map((clip) => clip.id);
    const absorbedCompleted = withFinishedCatalogClips(
      clipIds,
      completedIds,
      chapterMarkedDone,
    );
    absorbLessonClips(chapterProgressKey, clipIds);

    const catalogDone =
      chapterMarkedDone ||
      catalogCompletedCount(clips, absorbedCompleted) >= clips.length;
    if (catalogDone && !chapterMarkedDone) {
      markLearnChapterDone(chapterProgressKey);
    }

    const review = catalogDone;
    let order = runOrder;
    let doneIds = review ? runCompletedIds : absorbedCompleted;

    if (review && !sameClipOrderSet(clips, order)) {
      const preserved = preservedReviewOrder(clipIds, order, absorbedCompleted);
      if (preserved) {
        order = preserved;
      } else {
        order = stableRunOrder(chapterProgressKey, clips);
        setLearnRunOrder(chapterProgressKey, order);
        doneIds = [];
      }
    }

    let ordered = review ? clipsInStoredOrder(clips, order) : clips;
    let parts = splitListeningParts(ordered);
    let partIndex = firstIncompletePartIndex(parts, doneIds);
    let partNumber = partIndex + 1;
    let listeningPartCount = parts.length;
    if (!review) {
      const open = openListeningParts(ordered, doneIds);
      parts = open.parts;
      partIndex = 0;
      partNumber = open.partNumber;
      listeningPartCount = open.partCount;
    }

    if (review && partIndex < 0) {
      const staleKey = `${chapterProgressKey}:${order.join("|")}`;
      let nextOrder = replacementRunOrders.get(staleKey);
      if (!nextOrder) {
        pendingRunOrders.delete(chapterProgressKey);
        nextOrder = freshRunOrder(chapterProgressKey, clips);
        replacementRunOrders.set(staleKey, nextOrder);
      }
      order = nextOrder;
      setLearnRunOrder(chapterProgressKey, order);
      doneIds = [];
      ordered = clipsInStoredOrder(clips, order);
      parts = splitListeningParts(ordered);
      partIndex = 0;
      partNumber = 1;
      listeningPartCount = parts.length;
    }

    if (partIndex < 0) partIndex = 0;

    const signature = [
      review ? "review" : "first",
      String(partIndex),
      String(partNumber),
      String(listeningPartCount),
      ordered.map((clip) => clip.id).join("|"),
      doneIds.join("|"),
    ].join("~");
    if (initializedSourceRef.current === signature) return;

    initializedSourceRef.current = signature;
    partStartedAtRef.current = Date.now();
    missedClipIdsRef.current = new Set();
    missedKindsRef.current = new Map();
    missedAnswersRef.current = new Map();
    missedCardKeysRef.current = new Set();
    pairingSolvedKeyRef.current = null;
    failedRef.current = false;
    setHeartsLeft(LISTENING_HEARTS);
    setBreakingIndex(null);
    const nextPartClips = parts[partIndex] ?? [];
    setPartClips(nextPartClips);
    setPartCards(insertDiscreteCards(buildPracticeDeck(nextPartClips, clips), nextPartClips, clips, []));
    setPartNumber(partNumber);
    setPartCount(listeningPartCount);
    setClipIndex(0);
    setScoreResult(null);
    setMcResult(null);
    setPairingResult(null);
    setDraft("");
  }, [
    status,
    phase,
    clipIndex,
    scoreResult,
    mcResult,
    pairingResult,
    draft,
    clipKey,
    chapterProgressKey,
    chapterMarkedDone,
    completedKey,
    runCompletedKey,
    runOrderKey,
    absorbLessonClips,
    markLearnChapterDone,
    setLearnRunOrder,
  ]);

  useEffect(() => {
    if (breakingIndex === null) return;
    const timeout = window.setTimeout(() => setBreakingIndex(null), 560);
    return () => window.clearTimeout(timeout);
  }, [breakingIndex]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/xp")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: unknown } | null) => {
        if (cancelled || !data || typeof data.total !== "number") return;
        setXpTotal(Math.max(0, data.total - awardedXpRef.current));
      })
      .catch(() => {
        // The chip stays on a dash when the total cannot be read.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentCard = partCards?.[clipIndex];
  const currentClip = currentCard?.clip;
  const ready = partCards !== null;
  const isPerfect =
    scoreResult?.accuracy === 100 || mcResult?.accuracy === 100 || pairingResult?.accuracy === 100;
  const isLastPart = partCount > 0 && partNumber >= partCount;
  const failedRun = summary?.failed === true;
  const exitLabel =
    failedRun || !isLastPart
      ? "Về bài học"
      : hasNextChapter
        ? course.nextLessonLabel
        : course.finishLabel;
  const showHearts = Boolean(partCards && partCards.length > 0 && phase !== "leaving");
  if (
    phase === "complete" &&
    summary &&
    !summary.xpPending &&
    !summary.failed &&
    typeof summary.xp === "number" &&
    summary.xp > 0
  ) {
    awardedXpRef.current = summary.xp;
  }

  const progressSegments = useMemo(() => {
    const total = partCards?.length ?? 0;
    return Array.from({ length: Math.max(total, 1) }, (_, index) => {
      if (index < clipIndex) return "done";
      if (index === clipIndex && currentCard) return "current";
      return "todo";
    });
  }, [partCards, clipIndex, currentCard]);

  const rememberMiss = (card: PracticeCard, attempt?: MissedAttempt | null) => {
    missedClipIdsRef.current.add(card.clip.id);
    const kinds = missedKindsRef.current.get(card.clip.id) ?? new Set<CardKind>();
    kinds.add(statsCardKind(card.kind));
    missedKindsRef.current.set(card.clip.id, kinds);
    if (!attempt) return;
    const answers = missedAnswersRef.current.get(card.clip.id) ?? {};
    if (answers[card.kind]) return;
    missedAnswersRef.current.set(card.clip.id, { ...answers, [card.kind]: attempt });
  };

  /** Kind-agnostic hearts/streak bookkeeping. Each handler sets its own result state first. */
  const applyResult = (accuracy: number, attempt?: MissedAttempt | null) => {
    if (!currentCard) return;
    if (accuracy === 100) {
      playSuccessSound();
      return;
    }

    recordWrongAttempt();
    rememberMiss(currentCard, attempt);
    // The first miss of each card costs a heart.
    if (missedCardKeysRef.current.has(currentCard.key)) return;

    missedCardKeysRef.current.add(currentCard.key);
    const nextHearts = heartsLeft - 1;
    setHeartsLeft(Math.max(0, nextHearts));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) setBreakingIndex(nextHearts);
    playHeartLostSound();
  };

  const handleSubmit = (value: string) => {
    if (!currentClip) return;
    setDraft(value);
    const result = scoreAttempt(value, currentClip.script);
    setScoreResult(result);
    applyResult(result.accuracy, missedAttempt(value, currentClip.script));
  };

  const handleNumberSubmit = (value: string) => {
    if (!currentClip?.answer) return;
    setDraft(value);
    const correct = checkNumberAnswer(value, currentClip.answer);
    const result: ScoreResult = {
      accuracy: correct ? 100 : 0,
      words: [
        {
          word: currentClip.answer,
          status: correct ? "correct" : "incorrect",
          typed: value.trim(),
        },
      ],
    };
    setScoreResult(result);
    applyResult(
      result.accuracy,
      currentClip.answer ? missedAttempt(value, currentClip.answer) : null,
    );
  };

  const handleOrderSubmit = (selected: string[]) => {
    if (!currentClip) return;
    const result = checkOrder(selected, currentClip.script);
    setScoreResult(result);
    applyResult(result.accuracy, missedAttempt(selected.join(" "), currentClip.script));
  };

  const handleMcSubmit = (selectedId: string) => {
    if (!currentCard?.options) return;
    const result = checkMc(selectedId, currentCard.options);
    setMcResult(result);
    const selected = currentCard.options.find((option) => option.id === selectedId);
    const correct = currentCard.options.find((option) => option.correct);
    applyResult(
      result.accuracy,
      selected && correct ? missedAttempt(selected.text, correct.text) : null,
    );
  };

  /** One heart for the first miss on this card. Later wrong pairs only shake. */
  const handlePairingMistake = (entered: string, correct: string) => {
    if (!currentCard) return;
    if (missedCardKeysRef.current.has(currentCard.key)) return;

    recordWrongAttempt();
    rememberMiss(currentCard, missedAttempt(entered, correct));
    missedCardKeysRef.current.add(currentCard.key);
    const nextHearts = heartsLeft - 1;
    setHeartsLeft(Math.max(0, nextHearts));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) setBreakingIndex(nextHearts);
    playHeartLostSound();
  };

  const handlePairingSolved = () => {
    if (!currentCard?.pairItems) return;
    if (pairingSolvedKeyRef.current === currentCard.key) return;
    pairingSolvedKeyRef.current = currentCard.key;
    const pairs = currentCard.pairItems.map((clip) => ({
      viClipId: clip.id,
      deClipId: clip.id,
      correct: true,
    }));
    setPairingResult({
      accuracy: 100,
      correctCount: pairs.length,
      total: pairs.length,
      pairs,
    });
    playSuccessSound();
  };

  const commitPart = () => {
    if (committedRef.current || !partClips || partClips.length === 0) return;
    committedRef.current = true;
    const finishRun = partCount > 0 && partNumber >= partCount;
    commitLearnListeningPart(
      chapterProgressKey,
      partClips.map((clip) => clip.id),
      lessonKey,
      finishRun,
    );
    if (finishRun) pendingRunOrders.delete(chapterProgressKey);
    if (!finishRun) {
      try {
        sessionStorage.setItem(PRACTICE_FOCUS_KEY, chapterProgressKey);
      } catch {
        // Session storage can be blocked. The return URL still asks for focus.
      }
    }
  };

  const openCompleteScreen = (failed = false) => {
    if (
      completingRef.current ||
      !partClips ||
      !partCards ||
      partClips.length === 0 ||
      phase === "complete"
    ) {
      return;
    }
    completingRef.current = true;
    failedRef.current = failed;
    const total = partClips.length;
    const results = clipResultsForCardDeck(
      partCards,
      missedClipIdsRef.current,
      failed,
      clipIndex,
      missedKindsRef.current,
      missedAnswersRef.current,
    );
    const answered = results.length;
    const firstTry = results.filter((clip) => !clip.missed).length;
    const startedAt = partStartedAtRef.current;
    const accuracy = answered === 0 ? 0 : Math.round((firstTry / answered) * 100);
    const elapsedMs = startedAt > 0 ? Date.now() - startedAt : 0;
    const run = buildListeningRunRecord({
      lessonKey,
      partNumber,
      partCount,
      failed,
      accuracy,
      clipCount: total,
      cardCount: partCards.length,
      elapsedMs,
      clips: partClips,
      missedClipIds: missedClipIdsRef.current,
      clipIndex,
      results,
    });
    if (!run) console.error("Listening run was not saved");
    setSummary({
      questionCount: answered,
      accuracy,
      elapsedMs,
      failed,
      xp: null,
      xpKind: null,
      xpPending: Boolean(run) && !failed,
    });
    if (!failed) {
      commitPart();
      playCelebrationSound();
      if (isLastPart) revealStreakCelebration();
    }
    setPhase("complete");
    if (!run) return;
    void submitListeningRun(run).then((grant) => {
      if (failed) return;
      setSummary((current) =>
        current
          ? {
              ...current,
              xp: grant?.xp ?? null,
              xpKind: grant?.kind ?? null,
              xpPending: false,
            }
          : current,
      );
    });
  };

  const continueAfterPart = () => {
    const finishRun =
      !failedRef.current && partCount > 0 && partNumber >= partCount;
    setPhase("leaving");
    router.push(finishRun ? nextChapterHref : pathHref);
  };

  const resetCardResults = () => {
    setScoreResult(null);
    setMcResult(null);
    setPairingResult(null);
    setDraft("");
  };

  const handleNext = () => {
    if (!partCards || !currentCard) return;
    if (heartsLeft <= 0) {
      openCompleteScreen(true);
      return;
    }
    if (!isPerfect) {
      setPartCards(requeueMissedClip(partCards, clipIndex));
      resetCardResults();
      return;
    }
    if (clipIndex + 1 >= partCards.length) {
      openCompleteScreen();
      return;
    }
    resetCardResults();
    setClipIndex((index) => index + 1);
  };

  return (
    <div
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <Link
            href={pathHref}
            aria-label="Quay lại"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#0066cc] transition-colors hover:bg-[#f5f5f7] active:scale-95"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#86868b] mb-0.5">
              Luyện tập
            </span>
            <h1 className="truncate font-headline-sm text-[15px] font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
              {course.title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <TodayXpChip total={xpTotal} gain={awardedXpRef.current} />
            {showHearts ? (
              <PartHearts remaining={heartsLeft} breakingIndex={breakingIndex} />
            ) : null}
            <ProfileButton />
          </div>
        </div>
      </header>

      {!ready || phase === "leaving" ? (
        <SessionContentSkeleton kind="practice" />
      ) : phase === "complete" && summary ? (
        isLastPart && !failedRun && streakCelebrationPending ? null : (
        <PartCompleteScreen
          partNumber={partNumber}
          partCount={partCount}
          levelLabel={course.groupLabel}
          chapterLabel={course.lessonLabel}
          questionCount={summary.questionCount}
          accuracy={summary.accuracy}
          elapsedMs={summary.elapsedMs}
          xp={summary.xp}
          xpKind={summary.xpKind}
          xpPending={summary.xpPending}
          streakDays={streakDays}
          finishRun={isLastPart && !failedRun}
          failed={failedRun}
          continueLabel={exitLabel}
          onContinue={continueAfterPart}
        />
        )
      ) : !currentClip ? (
        <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">
              Chưa có bài nghe
            </h2>
            <Link
              href={pathHref}
              className="flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#0066cc] px-6 text-[17px] font-semibold text-white"
            >
              Về bài học
            </Link>
          </div>
        </main>
      ) : (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <header className="flex flex-col pt-6 pb-4">
              <div
                aria-label="Tiến độ phần này"
                className="grid w-full gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(partCards?.length ?? 0, 1)}, minmax(0, 1fr))`,
                }}
              >
                {progressSegments.map((segment, index) => {
                  const filled =
                    segment === "done" || (segment === "current" && isPerfect);
                  return (
                    <div
                      key={`seg-${index}`}
                      className="relative h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]"
                    >
                      <div
                        className="h-full origin-left rounded-full bg-[#0066cc] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                        style={{ transform: filled ? "scaleX(1)" : "scaleX(0)" }}
                      />
                    </div>
                  );
                })}
              </div>
            </header>

            {currentCard?.kind === "order" && !scoreResult ? (
              // Order cards hide the audio until checked, then it plays with the feedback.
              <SentenceOrderCard
                key={`order-${currentCard.key}`}
                translation={currentClip.translationVi}
                chips={currentCard.bank ?? []}
                onSubmit={handleOrderSubmit}
              />
            ) : currentCard?.kind === "reply-choice" && !mcResult ? (
              <>
                <AudioPlayerCard
                  key={`reply-audio-${currentCard.key}`}
                  audioPath={currentClip.audioPath}
                />
                <div className="mt-4">
                  <McCard
                    key={`reply-${currentCard.key}`}
                    prompt="Was sagst du? · Bạn trả lời thế nào?"
                    options={currentCard.options ?? []}
                    onSubmit={handleMcSubmit}
                    layout="list"
                    icon="forum"
                  />
                </div>
              </>
            ) : currentCard?.kind === "reply-choice" && mcResult ? (
              <McFeedbackCard
                result={mcResult}
                options={currentCard.options ?? []}
                clip={currentClip}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : (currentCard?.kind === "multiple-choice" || currentCard?.kind === "vi-choice") && !mcResult ? (
              <McCard
                key={`mc-${currentCard.key}`}
                prompt={currentCard.kind === "vi-choice" ? (currentClip.translationVi ?? "") : currentClip.script}
                options={currentCard.options ?? []}
                onSubmit={handleMcSubmit}
              />
            ) : currentCard?.kind === "pairing" ? (
              <PairingCard
                key={`pairing-${currentCard.key}`}
                items={(currentCard.pairItems ?? []).map((clip) => ({
                  id: clip.id,
                  vi: clip.translationVi ?? "",
                  de: clip.script,
                  ...(clip.imageUrl ? { image: clip.imageUrl } : {}),
                }))}
                onMistake={handlePairingMistake}
                onSolved={handlePairingSolved}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : currentCard?.kind === "vi-input" ? (
              <>
                {scoreResult ? (
                  <>
                    <AudioPlayerCard
                      key={`vi-audio-${currentCard.key}`}
                      audioPath={currentClip.audioPath}
                    />
                    <FeedbackResultCard
                      result={scoreResult}
                      clip={currentClip}
                      onNext={handleNext}
                      nextLabel="Tiếp theo"
                      skipOnMistake
                    />
                  </>
                ) : (
                  <DictationInputCard
                    key={`vi-input-${currentCard.key}`}
                    prompt={currentClip.translationVi}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={handleSubmit}
                  />
                )}
              </>
            ) : (currentCard?.kind === "multiple-choice" || currentCard?.kind === "vi-choice") && mcResult ? (
              <McFeedbackCard
                result={mcResult}
                options={currentCard.options ?? []}
                clip={currentClip}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : (
              <>
                <AudioPlayerCard
                  key={currentCard?.key ?? currentClip.id}
                  audioPath={currentClip.audioPath}
                />

                {scoreResult ? (
                  <FeedbackResultCard
                    result={scoreResult}
                    clip={currentClip}
                    onNext={handleNext}
                    nextLabel="Tiếp theo"
                    skipOnMistake
                  />
                ) : currentCard?.kind === "number-input" ? (
                  <NumberInputCard
                    key={`number-${currentCard.key}`}
                    onSubmit={handleNumberSubmit}
                  />
                ) : (
                  <DictationInputCard
                    key={`dictation-${currentClip.id}`}
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
