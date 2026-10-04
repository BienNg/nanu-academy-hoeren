"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent,
} from "react";
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
import { QuitDialog } from "@/components/session/QuitDialog";
import { SessionContentSkeleton } from "@/components/RouteLoading";
import {
  currentLessonNode,
  firstIncompleteStudyPart,
  lessonPathNodeLocked,
  lessonPathNodes,
  nextNodePart,
  settledStudyReviewedIds,
  splitStudyParts,
} from "@/lib/progress";
import { isAdminUser } from "@/lib/admins";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";
import { revealStreakCelebration, useProgress, useStreakCelebrationPending } from "@/lib/useProgress";
import { ChunkyButton } from "@/components/chunkyButton";
import {
  cardShortcutsBlocked,
  FOCUS_RING,
  hasModifier,
  isCardEnter,
  isTextEntry,
} from "@/lib/keyboard";

type StudyViewMode = "cards" | "list";
type StudyCardPhase = "study" | "recall";

type StudySessionProps = {
  course: SessionCourse;
  clips: SessionClip[];
  initialViewMode?: StudyViewMode;
  /** Open a finished lesson again from part 1. */
  startReplay?: boolean;
  /**
   * Trail node to play on a CEFR Lektion. Only that node's parts are played.
   * Leave it out for a lesson that is one Study node.
   */
  node?: number | "current";
};

function SessionActions({
  onBack,
  backDisabled = false,
  backLabel,
  actionLabel,
  actionDisabled = false,
  onAction,
}: {
  onBack: () => void;
  backDisabled?: boolean;
  backLabel: string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-[#fbfbfd]/95 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl gap-3 px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <ChunkyButton
          variant={backDisabled ? "disabled" : "secondary"}
          disabled={backDisabled}
          onClick={onBack}
          className="w-[52px] shrink-0 px-0"
          aria-label={backLabel}
        >
          <MaterialIcon name="arrow_back" className="text-[22px]" />
        </ChunkyButton>
        <ChunkyButton
          variant={actionDisabled ? "disabled" : "primary"}
          disabled={actionDisabled}
          onClick={onAction}
          className="min-w-0 flex-1"
        >
          {actionLabel}
        </ChunkyButton>
      </div>
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

export function StudySession({
  course,
  clips: allClips,
  initialViewMode = "cards",
  startReplay = false,
  node,
}: StudySessionProps) {
  const router = useRouter();
  const { data: authSession, status: authStatus } = useSession();
  const shouldReduceMotion = useReducedMotion();
  const cardTurn = useAnimation();
  const {
    resetLearnStudyProgress,
    reviewedLearnClipIdsFor,
    completedLearnClipIdsFor,
    learnChapterCompleted,
    learnRunCountFor,
    learnStudyCompleted,
    absorbLessonClips,
    progressReady,
    commitStudyPartDone,
    settleStudyReviews,
    recordLeftSession,
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
  const allClipIds = useMemo(() => allClips.map((clip) => clip.id), [allClips]);
  const pathHref = course.pathHref;

  const nodeMode = node !== undefined;
  const completedIds = completedLearnClipIdsFor(chapterProgressKey);
  const practiceFinished =
    learnChapterCompleted(chapterProgressKey) || learnRunCountFor(chapterProgressKey) > 0;
  const pathNodes = useMemo(
    () =>
      nodeMode
        ? lessonPathNodes(allClips, {
            reviewedClipIds: settledIds,
            completedClipIds: completedIds,
            studyFinished,
            practiceFinished,
          })
        : null,
    [nodeMode, allClips, settledIds, completedIds, studyFinished, practiceFinished],
  );
  const studyNodeCount = pathNodes?.filter((entry) => entry.kind === "study").length ?? 0;
  const nodeNumber = !pathNodes
    ? null
    : node === "current" || node === undefined
      ? currentLessonNode(pathNodes, "study")
      : Math.min(Math.max(1, node), Math.max(1, studyNodeCount));
  const studyNode =
    pathNodes?.find((entry) => entry.kind === "study" && entry.node === nodeNumber) ?? null;
  const adminBypass =
    authStatus === "authenticated" && isAdminUser(authSession?.user ?? {});
  const nodeLocked =
    authStatus !== "loading" &&
    !adminBypass &&
    pathNodes != null &&
    nodeNumber != null &&
    studyNode != null &&
    !studyNode.done &&
    lessonPathNodeLocked(pathNodes, "study", nodeNumber);
  const nodeFirstPart = studyNode?.firstPart ?? 1;
  const nodeLastPart = studyNode ? studyNode.firstPart + studyNode.parts.length - 1 : partCount;
  const nodeOpenPart = studyNode ? nextNodePart(studyNode, settledIds)?.partNumber ?? null : null;

  const openPart = nodeMode
    ? (nodeOpenPart ?? nodeFirstPart)
    : replaying
      ? 1
      : firstIncompleteStudyPart(parts, settledIds);
  const lessonAlreadyDone =
    !nodeMode && !replaying && (studyFinished || openPart > partCount);

  const [viewMode, setViewMode] = useState<StudyViewMode>(initialViewMode);
  /** This visit replays a finished node. Fixed when the visit starts. */
  const [nodeReplay, setNodeReplay] = useState(false);
  const [visitPart, setVisitPart] = useState<number | "done" | null>(null);
  const [clipIndex, setClipIndex] = useState(0);
  const [phase, setPhase] = useState<StudyCardPhase>("study");
  const [shownPhase, setShownPhase] = useState<StudyCardPhase>("study");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
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
  const xpRequestedRef = useRef(false);
  const partStartedAtRef = useRef(0);
  const committedRef = useRef(false);
  const leftRecordedRef = useRef(false);
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
    if (!progressReady || !nodeLocked) return;
    router.replace(pathHref);
  }, [progressReady, nodeLocked, router, pathHref]);

  useEffect(() => {
    if (!progressReady || visitPart != null || nodeLocked) return;
    if (nodeMode && (authStatus === "loading" || (!studyNode && allClips.length > 0))) return;
    if (!nodeMode && startReplay && studyFinished && storedReviewedIds.length > 0) {
      resetLearnStudyProgress(chapterProgressKey);
      setVisitPart(1);
      partStartedAtRef.current = Date.now();
      committedRef.current = false;
      leftRecordedRef.current = false;
      setClipIndex(0);
      setPhase("study");
      setScoreResult(null);
      setDraft("");
      setXpGrant(null);
      setReady(true);
      return;
    }
    setVisitPart(lessonAlreadyDone ? "done" : openPart);
    setNodeReplay(nodeMode && nodeOpenPart == null);
    partStartedAtRef.current = Date.now();
    committedRef.current = false;
    leftRecordedRef.current = false;
    setClipIndex(0);
    setQuitOpen(false);
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
    nodeLocked,
    nodeMode,
    authStatus,
    studyNode,
    nodeOpenPart,
    allClips.length,
  ]);

  const [furthest, setFurthest] = useState(0);
  const currentClip = clips[clipIndex];
  const complete =
    visitPart === "done" || (ready && clips.length > 0 && clipIndex >= clips.length);
  const lastPart = partCount > 0 && activePart >= partCount;
  // On a trail node the study pass is finished by whichever part reviews the last
  // unreviewed clip, which is not always the lesson's last part.
  const finishesStudy = nodeMode
    ? !studyFinished &&
      !nodeReplay &&
      partClipIds.length > 0 &&
      allClipIds.every(
        (id) => storedReviewedIds.includes(id) || partClipIds.includes(id),
      )
    : lastPart;
  const nodeHasNextPart = nodeMode && activePart < nodeLastPart;
  const isReviewed = furthest > clipIndex;
  const progressFill = clips.length === 0 ? 0 : Math.min(1, furthest / clips.length);
  const leaveStateRef = useRef({
    record: false,
    lessonKey,
    partNumber: activePart,
    partCount,
    clipsDone: furthest,
    clipCount: clips.length,
    startedAt: 0,
  });
  leaveStateRef.current = {
    record:
      ready &&
      visitPart !== "done" &&
      !complete &&
      !committedRef.current &&
      partStartedAtRef.current > 0 &&
      clips.length > 0 &&
      partCount > 0,
    lessonKey,
    partNumber: activePart,
    partCount,
    clipsDone: furthest,
    clipCount: clips.length,
    startedAt: partStartedAtRef.current,
  };
  const recordLeftSessionRef = useRef(recordLeftSession);
  recordLeftSessionRef.current = recordLeftSession;
  const noteLeftSession = () => {
    const state = leaveStateRef.current;
    if (!state.record || leftRecordedRef.current) return;
    leftRecordedRef.current = true;
    recordLeftSessionRef.current({
      lessonKey: state.lessonKey,
      kind: "study",
      partNumber: state.partNumber,
      partCount: state.partCount,
      clipsDone: state.clipsDone,
      clipCount: state.clipCount,
      startedAt: new Date(state.startedAt).toISOString(),
    });
  };
  const noteLeftSessionRef = useRef(noteLeftSession);
  noteLeftSessionRef.current = noteLeftSession;

  useEffect(() => {
    let armed = false;
    const timer = window.setTimeout(() => {
      armed = true;
    }, 0);
    const onPageHide = () => noteLeftSessionRef.current();
    window.addEventListener("pagehide", onPageHide, true);
    return () => {
      window.removeEventListener("pagehide", onPageHide, true);
      window.clearTimeout(timer);
      if (armed) noteLeftSessionRef.current();
    };
  }, []);
  const showSessionHeader = visitPart !== "done" && !complete;

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
        commitStudyPartDone(chapterProgressKey, partClipIds, lessonKey, finishesStudy);
        if (finishesStudy) revealStreakCelebration();
      }
      setSummary({
        questionCount: count,
        accuracy: Math.round(total / count),
        elapsedMs: Math.max(0, Date.now() - partStartedAtRef.current),
        finishRun: finishesStudy,
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
    finishesStudy,
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

  /** Next part of the same trail node, without leaving the session. */
  const startNextNodePart = () => {
    committedRef.current = false;
    leftRecordedRef.current = false;
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
    setVisitPart(activePart + 1);
  };

  const beginReview = () => {
    resetLearnStudyProgress(chapterProgressKey);
    committedRef.current = false;
    leftRecordedRef.current = false;
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
      commitStudyPartDone(chapterProgressKey, partClipIds, lessonKey, finishesStudy);
      if (finishesStudy) revealStreakCelebration();
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
    finishesStudy,
    activePart,
    partCount,
  ]);

  // ← / → turn cards and Enter opens recall, unless a focused control owns
  // the key (a button for Enter, the recall textarea for arrows). Escape
  // leaves recall from inside the textarea.
  useEffect(() => {
    if (viewMode !== "cards" || complete || !currentClip) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey || hasModifier(event) || cardShortcutsBlocked(event)) return;
      if (event.key === "Escape" && phase === "recall") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (isTextEntry(event.target)) return;
        event.preventDefault();
        if (event.key === "ArrowLeft") goPrev();
        else if (phase === "study") openRecall();
        return;
      }
      if (phase === "study" && isCardEnter(event)) {
        event.preventDefault();
        openRecall();
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

  const recallPerfect = scoreResult?.accuracy === 100;
  const openedFinishedLesson = visitPart === "done" && summary == null;
  const handleModeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "cards"
        : event.key === "ArrowRight" || event.key === "End"
          ? "list"
          : null;
    if (!next) return;
    // Arrows here move between tabs, never between cards.
    event.preventDefault();
    event.stopPropagation();
    setViewMode(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  };
  const modeToggle = (
    <div
      role="tablist"
      aria-label="Chế độ học"
      onKeyDown={handleModeKeyDown}
      className="inline-flex w-fit items-center gap-1 rounded-full border border-white/60 bg-white/70 p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.06)] backdrop-blur-xl"
    >
      <button
        type="button"
        role="tab"
        data-mode="cards"
        aria-selected={viewMode === "cards"}
        aria-label="Chế độ thẻ"
        tabIndex={viewMode === "cards" ? 0 : -1}
        onClick={() => setViewMode("cards")}
        className={`group relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300 ${FOCUS_RING} ${
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
        data-mode="list"
        aria-selected={viewMode === "list"}
        aria-label="Chế độ danh sách"
        tabIndex={viewMode === "list" ? 0 : -1}
        onClick={() => setViewMode("list")}
        className={`group relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300 ${FOCUS_RING} ${
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

      {showSessionHeader ? (
        <header className="sticky top-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
          <div className="mx-auto w-full max-w-4xl px-4 pt-2 pb-3 sm:px-6">
            <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3">
              <button
                type="button"
                aria-label="Quay lại"
                onClick={() => {
                  const nothingToLose = furthest === 0 && clipIndex === 0 && phase === "study" && !scoreResult;
                  if (nothingToLose) {
                    noteLeftSession();
                    router.push(pathHref);
                    return;
                  }
                  setQuitOpen(true);
                }}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-[#c7c7cc] transition-colors hover:bg-[#f5f5f7] hover:text-[#aeaeb2] active:scale-95 ${FOCUS_RING}`}
              >
                <span
                  className="material-symbols-outlined translate-y-px text-[22px]"
                  style={{ fontVariationSettings: "'wght' 260" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
              <div
                aria-label="Tiến độ học nội dung"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressFill * 100)}
                role="progressbar"
                className="h-[18px] w-full overflow-hidden rounded-full border-b-4 border-[#d5d5d5] bg-[#e8e8e8]"
              >
                <div
                  className="h-full rounded-full border-b-4 border-[#005bb5] bg-gradient-to-b from-[#7ec4ff] to-[#1a8cff] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ width: `${progressFill * 100}%` }}
                />
              </div>
              <span className="w-11" aria-hidden="true" />
            </div>
          </div>
        </header>
      ) : null}

      {quitOpen && showSessionHeader ? (
        <QuitDialog
          message="Bạn sẽ mất tiến độ của phần này nếu dừng bây giờ."
          onStay={() => setQuitOpen(false)}
          onQuit={() => {
            noteLeftSession();
            router.push(pathHref);
          }}
        />
      ) : null}

      {!ready || !progressReady || visitPart == null ? (
        <SessionContentSkeleton kind="study" />
      ) : visitPart === "done" || complete ? (
        summary?.finishRun && streakCelebrationPending ? null : (
        <PartCompleteScreen
          partNumber={
            nodeMode
              ? (summary?.partNumber ?? activePart) - nodeFirstPart + 1
              : (summary?.partNumber ?? partCount)
          }
          partCount={nodeMode ? nodeLastPart - nodeFirstPart + 1 : partCount}
          levelLabel={course.groupLabel}
          chapterLabel={course.lessonLabel}
          questionCount={summary?.questionCount ?? allClips.length}
          accuracy={summary?.accuracy ?? null}
          elapsedMs={summary?.elapsedMs ?? null}
          xp={openedFinishedLesson ? null : (xpGrant?.xp ?? null)}
          xpKind={openedFinishedLesson ? null : (xpGrant?.kind ?? null)}
          xpPending={openedFinishedLesson ? false : Boolean(xpGrant?.pending)}
          streakDays={streakDays}
          finishRun={nodeMode ? false : (summary?.finishRun ?? visitPart === "done")}
          failed={false}
          continueLabel={nodeHasNextPart ? "Phần tiếp theo" : "Về bài học"}
          onContinue={nodeHasNextPart ? startNextNodePart : () => router.push(pathHref)}
          secondaryLabel={
            nodeHasNextPart ? "Về bài học" : openedFinishedLesson ? "Xem lại" : undefined
          }
          onSecondary={
            nodeHasNextPart
              ? () => router.push(pathHref)
              : openedFinishedLesson
                ? beginReview
                : undefined
          }
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
                      <DictationInputCard
                        key={`dictation-${currentClip.id}`}
                        value={draft}
                        onChange={setDraft}
                        onSubmit={handleRecallSubmit}
                        disabled={recallPerfect}
                        showSubmit={false}
                      />
                    </div>
                  )}
                </motion.div>
              </div>
            </div>

            {shownPhase === "recall" && scoreResult ? (
              <FeedbackResultCard
                result={scoreResult}
                clip={currentClip}
                onNext={finishRecall}
                secondaryLabel={recallPerfect ? "Xem lại thẻ" : undefined}
                onSecondary={recallPerfect ? goPrev : undefined}
              />
            ) : null}

            {shownPhase === "study" ? (
              <SessionActions
                onBack={goPrev}
                backDisabled={clipIndex === 0}
                backLabel="Thẻ trước"
                actionLabel="Tiếp theo"
                onAction={openRecall}
              />
            ) : recallPerfect ? null : (
              <SessionActions
                onBack={goPrev}
                backLabel="Xem lại thẻ"
                actionLabel="Kiểm tra · Prüfen"
                actionDisabled={draft.trim().length === 0}
                onAction={() => handleRecallSubmit(draft)}
              />
            )}
          </div>
        </main>
      )}
    </div>
  );
}
