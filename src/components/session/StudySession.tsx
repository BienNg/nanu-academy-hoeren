"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { flushSync } from "react-dom";
import { motion, useAnimation, useReducedMotion } from "framer-motion";
import type { SessionCourse } from "@/lib/session-course";
import type { SessionClip } from "@/lib/content";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { ClipContentCard } from "@/components/session/ClipContentCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { StudyClipList } from "@/components/session/StudyClipList";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { ProfileButton } from "@/components/ProfileButton";
import { TodayXpChip } from "@/components/TodayXpChip";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import {
  firstIncompleteStudyPart,
  settledStudyReviewedIds,
  splitStudyParts,
} from "@/lib/progress";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";
import { revealStreakCelebration, useProgress, useStreakCelebrationPending } from "@/lib/useProgress";

type StudyViewMode = "cards" | "list";
type StudyCardPhase = "study" | "recall";

type StudySessionProps = {
  course: SessionCourse;
  clips: SessionClip[];
  initialViewMode?: StudyViewMode;
  /** Open a finished lesson again from part 1. */
  startReplay?: boolean;
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

export function StudySession({
  course,
  clips: allClips,
  initialViewMode = "cards",
  startReplay = false,
}: StudySessionProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const cardTurn = useAnimation();
  const {
    resetLearnStudyProgress,
    reviewedLearnClipIdsFor,
    learnStudyCompleted,
    absorbLessonClips,
    progressReady,
    commitStudyPartDone,
    settleStudyReviews,
    streakDays,
  } = useProgress();
  const streakCelebrationPending = useStreakCelebrationPending();

  const chapterProgressKey = course.progressKey;
  const lessonKey = course.lessonKey;
  const storedReviewedIds = reviewedLearnClipIdsFor(chapterProgressKey);
  const studyFinished = learnStudyCompleted(chapterProgressKey);
  const parts = useMemo(() => splitStudyParts(allClips), [allClips]);
  const partCount = parts.length;
  const settledIds = useMemo(
    () =>
      studyFinished
        ? storedReviewedIds
        : settledStudyReviewedIds(allClips, storedReviewedIds),
    [allClips, storedReviewedIds, studyFinished],
  );
  const replaying = studyFinished && storedReviewedIds.length === 0;
  const openPart = replaying ? 1 : firstIncompleteStudyPart(parts, settledIds);
  const lessonAlreadyDone = !replaying && (studyFinished || openPart > partCount);
  const allClipIds = useMemo(() => allClips.map((clip) => clip.id), [allClips]);
  const pathHref = course.pathHref;

  const [viewMode, setViewMode] = useState<StudyViewMode>(initialViewMode);
  const [visitPart, setVisitPart] = useState<number | "done" | null>(null);
  const [clipIndex, setClipIndex] = useState(0);
  const [phase, setPhase] = useState<StudyCardPhase>("study");
  const [shownPhase, setShownPhase] = useState<StudyCardPhase>("study");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [xpTotal, setXpTotal] = useState<number | null>(null);
  const [xpGrant, setXpGrant] = useState<{
    xp: number | null;
    kind: string | null;
    pending: boolean;
  } | null>(null);
  const [summary, setSummary] = useState<{
    questionCount: number;
    accuracy: number;
    elapsedMs: number;
    finishRun: boolean;
    partNumber: number;
  } | null>(null);
  const awardedXpRef = useRef(0);
  const xpRequestedRef = useRef(false);
  const partStartedAtRef = useRef(0);
  const committedRef = useRef(false);
  const scoresRef = useRef<number[]>([]);
  const touchStartX = useRef<number | null>(null);
  const shownClipIdRef = useRef<string | null>(null);
  const phaseRef = useRef<StudyCardPhase>("study");
  const shownPhaseRef = useRef<StudyCardPhase>("study");
  const flipRunRef = useRef(0);
  phaseRef.current = phase;
  shownPhaseRef.current = shownPhase;

  const activePart = typeof visitPart === "number" ? visitPart : openPart;
  const clips = parts[activePart - 1] ?? [];
  const partClipIds = useMemo(() => clips.map((clip) => clip.id), [clips]);

  useEffect(() => {
    absorbLessonClips(chapterProgressKey, allClipIds);
  }, [absorbLessonClips, chapterProgressKey, allClipIds]);

  useEffect(() => {
    if (!progressReady || studyFinished) return;
    settleStudyReviews(chapterProgressKey, allClips);
  }, [progressReady, studyFinished, settleStudyReviews, chapterProgressKey, allClips]);

  useEffect(() => {
    if (!progressReady || visitPart != null) return;
    if (startReplay && studyFinished && storedReviewedIds.length > 0) {
      resetLearnStudyProgress(chapterProgressKey);
      setVisitPart(1);
      partStartedAtRef.current = Date.now();
      committedRef.current = false;
      setClipIndex(0);
      setPhase("study");
      setScoreResult(null);
      setDraft("");
      setXpGrant(null);
      setReady(true);
      return;
    }
    setVisitPart(lessonAlreadyDone ? "done" : openPart);
    partStartedAtRef.current = Date.now();
    committedRef.current = false;
    setClipIndex(0);
    setPhase("study");
    setScoreResult(null);
    setDraft("");
    setXpGrant(null);
    setReady(true);
  }, [
    progressReady,
    visitPart,
    lessonAlreadyDone,
    openPart,
    startReplay,
    studyFinished,
    storedReviewedIds,
    resetLearnStudyProgress,
    chapterProgressKey,
  ]);

  const [furthest, setFurthest] = useState(0);
  const currentClip = clips[clipIndex];
  const complete =
    visitPart === "done" || (ready && clips.length > 0 && clipIndex >= clips.length);
  const lastPart = partCount > 0 && activePart >= partCount;
  const isReviewed = furthest > clipIndex;

  const progressSegments = useMemo(() => {
    return clips.map((_, index) => (index < furthest ? "done" : "todo"));
  }, [clips, furthest]);

  const clearAttempt = useCallback(() => {
    setScoreResult(null);
    setDraft("");
  }, []);

  const openRecall = useCallback(() => {
    if (!currentClip) return;
    clearAttempt();
    setPhase("recall");
  }, [currentClip, clearAttempt]);

  const handleRecallSubmit = useCallback(
    (value: string) => {
      if (!currentClip) return;
      setDraft(value);
      const result = scoreAttempt(value, currentClip.script);
      setScoreResult(result);
      if (result.accuracy === 100) playSuccessSound();
    },
    [currentClip],
  );

  const finishRecall = useCallback(() => {
    if (!currentClip) return;
    const next = clipIndex + 1;
    scoresRef.current[clipIndex] = scoreResult?.accuracy ?? 0;
    if (next >= clips.length && clips.length > 0) {
      const count = clips.length;
      const total = scoresRef.current
        .slice(0, count)
        .reduce((sum, value) => sum + (value ?? 0), 0);
      if (!committedRef.current && partClipIds.length > 0) {
        committedRef.current = true;
        commitStudyPartDone(chapterProgressKey, partClipIds, lessonKey, lastPart);
        if (lastPart) revealStreakCelebration();
      }
      setSummary({
        questionCount: count,
        accuracy: Math.round(total / count),
        elapsedMs: Math.max(0, Date.now() - partStartedAtRef.current),
        finishRun: lastPart,
        partNumber: activePart,
      });
    }
    clearAttempt();
    setPhase("study");
    setFurthest((value) => Math.max(value, next));
    setClipIndex(next);
  }, [
    currentClip,
    clearAttempt,
    clipIndex,
    clips.length,
    scoreResult,
    lastPart,
    activePart,
    partClipIds,
    commitStudyPartDone,
    chapterProgressKey,
    lessonKey,
  ]);

  const goPrev = useCallback(() => {
    if (phase === "recall") {
      clearAttempt();
      setPhase("study");
      return;
    }
    if (clipIndex <= 0) return;
    clearAttempt();
    setPhase("study");
    setClipIndex((index) => index - 1);
  }, [phase, clipIndex, clearAttempt]);

  const beginReview = () => {
    resetLearnStudyProgress(chapterProgressKey);
    committedRef.current = false;
    xpRequestedRef.current = false;
    partStartedAtRef.current = Date.now();
    setXpGrant(null);
    clearAttempt();
    setPhase("study");
    setShownPhase("study");
    setFurthest(0);
    setClipIndex(0);
    setSummary(null);
    scoresRef.current = [];
    setVisitPart(1);
  };

  useEffect(() => {
    if (!ready || !complete || visitPart === "done" || partClipIds.length === 0) {
      return;
    }
    if (!committedRef.current) {
      committedRef.current = true;
      commitStudyPartDone(chapterProgressKey, partClipIds, lessonKey, lastPart);
      if (lastPart) revealStreakCelebration();
    }
    if (xpRequestedRef.current) return;
    xpRequestedRef.current = true;
    const elapsedMs = Math.max(0, Date.now() - partStartedAtRef.current);
    setXpGrant({ xp: null, kind: null, pending: true });
    playCelebrationSound();
    void fetch("/api/study-xp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lessonKey,
        partNumber: activePart,
        partCount,
        elapsedMs,
        clipIds: partClipIds,
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { xp?: unknown; kind?: unknown } | null) => {
        setXpGrant({
          xp: data && typeof data.xp === "number" ? data.xp : null,
          kind: data && typeof data.kind === "string" ? data.kind : null,
          pending: false,
        });
      })
      .catch(() => {
        setXpGrant({ xp: null, kind: null, pending: false });
      });
  }, [
    ready,
    complete,
    visitPart,
    partClipIds,
    commitStudyPartDone,
    chapterProgressKey,
    lessonKey,
    lastPart,
    activePart,
    partCount,
  ]);

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

  useEffect(() => {
    if (viewMode !== "cards" || complete || !currentClip) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey || event.isComposing) return;
      if (phase === "recall") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goPrev();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        openRecall();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, complete, currentClip, phase, openRecall, goPrev]);

  if (currentClip) {
    const clipChanged =
      shownClipIdRef.current !== null && shownClipIdRef.current !== currentClip.id;
    shownClipIdRef.current = currentClip.id;
    if (clipChanged || shouldReduceMotion) {
      if (shownPhase !== phase) {
        shownPhaseRef.current = phase;
        setShownPhase(phase);
      }
    }
  }

  useEffect(() => {
    if (!currentClip) return;
    if (shouldReduceMotion || phase === shownPhaseRef.current) {
      flipRunRef.current += 1;
      void cardTurn.set({ rotateY: 0 });
      if (shouldReduceMotion) setShownPhase(phase);
      return;
    }

    const run = ++flipRunRef.current;
    void (async () => {
      await cardTurn.start({
        rotateY: 90,
        transition: { duration: 0.34, ease: [0.55, 0, 1, 0.45] },
      });
      if (flipRunRef.current !== run) return;
      flushSync(() => {
        setShownPhase(phaseRef.current);
      });
      cardTurn.set({ rotateY: -90 });
      await cardTurn.start({
        rotateY: 0,
        transition: { duration: 0.34, ease: [0, 0, 0.2, 1] },
      });
    })();

    return () => {
      flipRunRef.current += 1;
    };
  }, [cardTurn, currentClip, phase, shouldReduceMotion]);

  const handleTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (touchStartX.current == null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX == null) return;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (delta < -56 && phase === "study") openRecall();
    if (delta > 56) goPrev();
  };

  const earnedXp =
    xpGrant && !xpGrant.pending && typeof xpGrant.xp === "number" && xpGrant.xp > 0
      ? xpGrant.xp
      : 0;
  if (earnedXp > 0) awardedXpRef.current = earnedXp;
  const recallPerfect = scoreResult?.accuracy === 100;
  const openedFinishedLesson = visitPart === "done" && summary == null;
  const modeToggle = (
    <div
      role="tablist"
      aria-label="Chế độ học"
      className="inline-flex w-fit items-center gap-1 rounded-full border border-white/60 bg-white/70 p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.06)] backdrop-blur-xl"
    >
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "cards"}
        aria-label="Chế độ thẻ"
        onClick={() => setViewMode("cards")}
        className={`group relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300 ${
          viewMode === "cards"
            ? "bg-[#0066cc] text-white shadow-[0_3px_10px_rgba(0,102,204,0.3)]"
            : "text-[#86868b] hover:bg-white/70 hover:text-[#1d1d1f]"
        }`}
      >
        <MaterialIcon
          name="view_carousel"
          className="text-[19px] transition-transform duration-300 group-hover:scale-105"
          filled={viewMode === "cards"}
        />
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "list"}
        aria-label="Chế độ danh sách"
        onClick={() => setViewMode("list")}
        className={`group relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300 ${
          viewMode === "list"
            ? "bg-[#0066cc] text-white shadow-[0_3px_10px_rgba(0,102,204,0.3)]"
            : "text-[#86868b] hover:bg-white/70 hover:text-[#1d1d1f]"
        }`}
      >
        <MaterialIcon
          name="view_list"
          className="text-[19px] transition-transform duration-300 group-hover:scale-105"
          filled={viewMode === "list"}
        />
      </button>
    </div>
  );

  return (
    <div
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh overflow-x-hidden selection:bg-[#0066cc] selection:text-white"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
        <div
          className={`mx-auto flex h-14 w-full max-w-4xl items-center px-6 ${
            visitPart === "done" || complete ? "justify-end" : "justify-between"
          }`}
        >
          {visitPart === "done" || complete ? null : (
            <>
              <Link
                href={pathHref}
                aria-label="Quay lại"
                className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#0066cc] transition-colors hover:bg-[#f5f5f7] active:scale-95"
              >
                <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
              </Link>
              <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#86868b] mb-0.5">
                  {partCount > 1 && typeof visitPart === "number"
                    ? `Học nội dung · Phần ${activePart}/${partCount}`
                    : "Học nội dung"}
                </span>
                <h1
                  className="truncate font-headline-sm text-[15px] font-bold tracking-tight text-[#1d1d1f]"
                  style={{ letterSpacing: "-0.015em" }}
                >
                  {course.title}
                </h1>
              </div>
            </>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <TodayXpChip total={xpTotal} gain={awardedXpRef.current} />
            <ProfileButton />
          </div>
        </div>
      </header>

      {!ready || !progressReady || visitPart == null ? (
        <SessionContentSkeleton kind="study" />
      ) : visitPart === "done" || complete ? (
        summary?.finishRun && streakCelebrationPending ? null : (
        <PartCompleteScreen
          partNumber={summary?.partNumber ?? partCount}
          partCount={partCount}
          levelLabel={course.groupLabel}
          chapterLabel={course.lessonLabel}
          questionCount={summary?.questionCount ?? allClips.length}
          accuracy={summary?.accuracy ?? null}
          elapsedMs={summary?.elapsedMs ?? null}
          xp={openedFinishedLesson ? null : (xpGrant?.xp ?? null)}
          xpKind={openedFinishedLesson ? null : (xpGrant?.kind ?? null)}
          xpPending={openedFinishedLesson ? false : Boolean(xpGrant?.pending)}
          streakDays={streakDays}
          finishRun={summary?.finishRun ?? visitPart === "done"}
          failed={false}
          continueLabel="Về bài học"
          onContinue={() => router.push(pathHref)}
          secondaryLabel={openedFinishedLesson ? "Xem lại" : undefined}
          onSecondary={openedFinishedLesson ? beginReview : undefined}
        />
        )
      ) : clips.length === 0 ? (
        <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
          <p className="text-lg font-medium text-[#86868b]">
            Chưa có nội dung cho Lektion này.
          </p>
        </main>
      ) : viewMode === "list" ? (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <header className="flex items-center justify-between gap-2 pt-6 pb-4">
              {modeToggle}
              <span className="shrink-0 text-[13px] font-medium text-[#86868b]">
                {clips.length} câu
              </span>
            </header>
            <StudyClipList clips={clips} />
          </div>
        </main>
      ) : (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <header className="flex flex-col items-start gap-4 pt-6 pb-4">
              {modeToggle}

              <div
                aria-label="Tiến độ học nội dung"
                className="grid w-full self-stretch gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(clips.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {progressSegments.map((segment, index) => (
                  <div
                    key={`seg-${index}`}
                    className="relative h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]"
                  >
                    <div
                      className="h-full origin-left rounded-full bg-[#0066cc] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                      style={{ transform: segment === "done" ? "scaleX(1)" : "scaleX(0)" }}
                    />
                  </div>
                ))}
              </div>
            </header>

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="flex flex-col"
            >
              <AudioPlayerCard
                key={`${currentClip.id}-${shownPhase}`}
                audioPath={currentClip.audioPath}
              />

              <div className="mt-4" style={{ perspective: "1200px" }}>
                <motion.div
                  initial={{ rotateY: 0 }}
                  animate={cardTurn}
                  style={{ transformOrigin: "center center", backfaceVisibility: "hidden" }}
                >
                  {shownPhase === "study" ? (
                    <ClipContentCard
                      clip={currentClip}
                      badge={
                        isReviewed ? (
                          <div className="flex items-center">
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#34C759]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#34C759]">
                              <span className="material-symbols-outlined text-[16px]">
                                check_circle
                              </span>
                              <span>Đã xem</span>
                            </div>
                          </div>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="-mt-4">
                      {recallPerfect && scoreResult ? (
                        <FeedbackResultCard
                          result={scoreResult}
                          clip={currentClip}
                          onNext={finishRecall}
                        />
                      ) : (
                        <>
                          {scoreResult ? (
                            <FeedbackResultCard
                              result={scoreResult}
                              clip={currentClip}
                              onNext={finishRecall}
                            />
                          ) : null}
                          <DictationInputCard
                            key={`dictation-${currentClip.id}`}
                            value={draft}
                            onChange={setDraft}
                            onSubmit={handleRecallSubmit}
                          />
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>

            {shownPhase === "study" ? (
              <div className="flex gap-3 pt-6">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={clipIndex === 0}
                  className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-[16px] bg-[#f5f5f7] text-[#1d1d1f] transition-all hover:bg-[#e8e8ed] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Thẻ trước"
                >
                  <MaterialIcon name="arrow_back" className="text-[22px]" />
                </button>
                <button
                  type="button"
                  onClick={openRecall}
                  className="group flex h-[56px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98]"
                >
                  <span>Tiếp theo</span>
                  <span className="material-symbols-outlined text-[20px] transition-transform duration-300 group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </button>
              </div>
            ) : (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[15px] font-semibold text-[#0066cc] transition-colors hover:bg-[#f5f5f7]"
                >
                  <MaterialIcon name="arrow_back" className="text-[18px]" />
                  Xem lại thẻ
                </button>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
