"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SessionClip } from "@/lib/content";
import type { SessionCourse } from "@/lib/session-course";
import { isAdminUser } from "@/lib/admins";
import { useProgress } from "@/lib/useProgress";
import {
  buildJumpDeck,
  checkJumpAnswer,
  JUMP_HEARTS,
  JUMP_XP,
  jumpSeed,
  type JumpAnswer,
} from "@/lib/lesson-jump";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import { checkOrder, type PracticeCard } from "@/lib/sentence-order";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { questZoneHeaders, readQuestUpdate, type QuestUpdate } from "@/lib/quests";
import { playHeartLostSound, playSuccessSound } from "@/lib/sfx";
import { FOCUS_RING } from "@/lib/keyboard";
import { chunkyButton } from "@/components/chunkyButton";
import { CheeringPingu } from "@/components/session/Pingu";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import { PartHearts } from "@/components/session/PartHearts";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { McCard } from "@/components/session/McCard";
import { McFeedbackCard } from "@/components/session/McFeedbackCard";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { PartCompleteScreen } from "@/components/session/PartCompleteScreen";
import { QuitDialog } from "@/components/session/QuitDialog";
import { SessionContentSkeleton } from "@/components/RouteLoading";

type JumpSessionProps = {
  /** The Lektion this test skips. */
  course: SessionCourse;
  clips: SessionClip[];
  /** Progress keys of this Lektion's videos, marked watched on a pass. */
  videoKeys: string[];
  /** Playable Lektionen before this one. Each must be finished before a learner can jump. */
  earlierChapterKeys: string[];
  targetLabel: string;
  targetHref: string;
};

type JumpSummary = {
  questionCount: number;
  accuracy: number;
  elapsedMs: number;
  failed: boolean;
  xp: number | null;
  xpKind: string | null;
  xpPending: boolean;
  quests: QuestUpdate | null;
  totalXp: number | null;
};

type JumpGrant = {
  xp: number | null;
  kind: string | null;
  quests: QuestUpdate | null;
  total: number | null;
};

async function submitLessonJump(input: {
  id: string;
  lessonKey: string;
  elapsedMs: number;
  answers: JumpAnswer[];
}): Promise<JumpGrant | null> {
  try {
    const response = await fetch("/api/lesson-jump", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...questZoneHeaders() },
      body: JSON.stringify(input),
      keepalive: true,
    });
    if (!response.ok) {
      console.error("Jump test was not saved", response.status);
      return null;
    }
    const data = (await response.json()) as {
      xp?: unknown;
      kind?: unknown;
      quests?: unknown;
      total?: unknown;
    };
    return {
      xp: typeof data.xp === "number" ? data.xp : null,
      kind: typeof data.kind === "string" ? data.kind : null,
      quests: readQuestUpdate(data.quests),
      total: typeof data.total === "number" ? data.total : null,
    };
  } catch (error) {
    console.error("Jump test was not saved", error);
    return null;
  }
}

function jumpXpNote(kind: string | null): string | undefined {
  if (kind === "repeat") return "Lektion này đã được tính XP.";
  if (kind === "rejected") return "Lần này chưa cộng XP.";
  return undefined;
}

/** The pad from the trail's jump node, with Pingu hopping on it. */
function JumpHero() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="relative flex h-[230px] w-[220px] flex-col items-center justify-end"
      initial={reduceMotion ? false : { y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 18 }}
      aria-hidden="true"
    >
      <div className="absolute bottom-[34px] left-1/2 z-10 -translate-x-1/2">
        <CheeringPingu />
      </div>
      <svg viewBox="0 0 200 64" className="w-[200px]">
        <ellipse cx="100" cy="36" rx="92" ry="24" fill="#1899d6" />
        <rect x="8" y="22" width="184" height="14" fill="#1899d6" />
        <ellipse cx="100" cy="22" rx="92" ry="22" fill="#1cb0f6" />
        <path d="M78 13 L96 22 L78 31 Z M100 13 L118 22 L100 31 Z" fill="#ffffff" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

export function JumpSession({
  course,
  clips,
  videoKeys,
  earlierChapterKeys,
  targetLabel,
  targetHref,
}: JumpSessionProps) {
  const router = useRouter();
  const { data: authSession, status } = useSession();
  const {
    progressReady,
    learnChapterCompleted,
    completeLessonJump,
    recordWrongAttempt,
    streakDays,
  } = useProgress();
  const adminBypass = status === "authenticated" && isAdminUser(authSession?.user ?? {});
  const [phase, setPhase] = useState<"intro" | "quiz" | "complete" | "leaving">("intro");
  const [deck, setDeck] = useState<PracticeCard<SessionClip>[]>([]);
  const [index, setIndex] = useState(0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [mcResult, setMcResult] = useState<McResult | null>(null);
  const [heartsLeft, setHeartsLeft] = useState(JUMP_HEARTS);
  const [breakingIndex, setBreakingIndex] = useState<number | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [summary, setSummary] = useState<JumpSummary | null>(null);
  /** Bumped per attempt so a retry remounts every card. */
  const [attemptCount, setAttemptCount] = useState(0);
  const attemptIdRef = useRef("");
  const answersRef = useRef<JumpAnswer[]>([]);
  const startedAtRef = useRef(0);
  const finishingRef = useRef(false);

  // The card count does not depend on the seed, so the intro can show it before a test is dealt.
  const cardCount = useMemo(
    () => buildJumpDeck(clips, jumpSeed(course.lessonKey, "preview")).length,
    [clips, course.lessonKey],
  );
  const lessonDone = learnChapterCompleted(course.progressKey);
  const earlierOpen = earlierChapterKeys.every((key) => learnChapterCompleted(key));
  const blocked = !adminBypass && (lessonDone || !earlierOpen);

  useEffect(() => {
    if (status === "loading" || !progressReady || phase !== "intro" || !blocked) return;
    router.replace(course.pathHref);
  }, [status, progressReady, phase, blocked, router, course.pathHref]);

  useEffect(() => {
    if (breakingIndex === null) return;
    const timeout = window.setTimeout(() => setBreakingIndex(null), 560);
    return () => window.clearTimeout(timeout);
  }, [breakingIndex]);

  const currentCard = deck[index];
  const currentClip = currentCard?.clip;
  const answered = scoreResult !== null || mcResult !== null;
  const progressFill = deck.length === 0 ? 0 : Math.min(1, (index + (answered ? 1 : 0)) / deck.length);

  const start = () => {
    const id = crypto.randomUUID();
    attemptIdRef.current = id;
    answersRef.current = [];
    startedAtRef.current = Date.now();
    finishingRef.current = false;
    setDeck(buildJumpDeck(clips, jumpSeed(course.lessonKey, id)));
    setIndex(0);
    setScoreResult(null);
    setMcResult(null);
    setHeartsLeft(JUMP_HEARTS);
    setBreakingIndex(null);
    setQuitOpen(false);
    setSummary(null);
    setAttemptCount((count) => count + 1);
    setPhase("quiz");
  };

  const leave = (href: string) => {
    setPhase("leaving");
    router.push(href);
  };

  /** Stores this card's answer once. A wrong answer costs a heart and the test moves on. */
  const recordAnswer = (answer: JumpAnswer) => {
    if (!currentCard || answersRef.current.length > index) return;
    answersRef.current.push(answer);
    if (checkJumpAnswer(currentCard, answer)) {
      playSuccessSound();
      return;
    }
    recordWrongAttempt();
    const nextHearts = heartsLeft - 1;
    setHeartsLeft(Math.max(0, nextHearts));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) setBreakingIndex(nextHearts);
    playHeartLostSound();
  };

  const handleOrderSubmit = (selected: string[]) => {
    if (!currentClip || scoreResult) return;
    setScoreResult(checkOrder(selected, currentClip.script));
    recordAnswer(selected);
  };

  const handleTypedSubmit = (typed: string) => {
    if (!currentClip || scoreResult) return;
    setScoreResult(scoreAttempt(typed, currentClip.script));
    recordAnswer(typed);
  };

  const handleMcSubmit = (selectedId: string) => {
    if (!currentCard?.options || mcResult) return;
    setMcResult(checkMc(selectedId, currentCard.options));
    recordAnswer(selectedId);
  };

  const finish = (failed: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const answers = [...answersRef.current];
    const mistakes = answers.filter((answer, at) => {
      const card = deck[at];
      return card ? !checkJumpAnswer(card, answer) : false;
    }).length;
    const elapsedMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0;
    const accuracy =
      answers.length === 0 ? 0 : Math.round(((answers.length - mistakes) / answers.length) * 100);
    setSummary({
      questionCount: answers.length,
      accuracy,
      elapsedMs,
      failed,
      xp: null,
      xpKind: null,
      xpPending: !failed,
      quests: null,
      totalXp: null,
    });
    setPhase("complete");
    if (failed) return;

    // A Lektion already finished keeps its own stamps; only a real skip is recorded.
    if (!learnChapterCompleted(course.progressKey)) {
      completeLessonJump(
        course.progressKey,
        clips.map((clip) => clip.id),
        videoKeys,
      );
    }
    void submitLessonJump({
      id: attemptIdRef.current,
      lessonKey: course.lessonKey,
      elapsedMs,
      answers,
    }).then((grant) => {
      setSummary((current) =>
        current
          ? {
              ...current,
              xp: grant?.xp ?? null,
              xpKind: grant?.kind ?? null,
              xpPending: false,
              quests: grant?.quests ?? null,
              totalXp: grant?.total ?? null,
            }
          : current,
      );
    });
  };

  const handleNext = () => {
    if (!currentCard) return;
    if (heartsLeft <= 0) {
      finish(true);
      return;
    }
    if (index + 1 >= deck.length) {
      finish(false);
      return;
    }
    setScoreResult(null);
    setMcResult(null);
    setIndex((value) => value + 1);
  };

  const waiting = status === "loading" || !progressReady || (phase === "intro" && blocked);

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col overflow-x-hidden bg-[#fbfbfd] selection:bg-[#0066cc] selection:text-white"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {phase === "quiz" ? (
        <header className="sticky top-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
          <div className="mx-auto w-full max-w-4xl px-4 pt-3 pb-3 sm:px-6">
            <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3">
              <button
                type="button"
                aria-label="Quay lại"
                onClick={() => {
                  if (answersRef.current.length === 0) {
                    leave(course.pathHref);
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
                aria-label="Tiến độ bài kiểm tra"
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
              <PartHearts remaining={heartsLeft} total={JUMP_HEARTS} breakingIndex={breakingIndex} />
            </div>
          </div>
        </header>
      ) : null}

      {quitOpen && phase === "quiz" ? (
        <QuitDialog
          message="Bạn sẽ mất tiến độ của bài kiểm tra này nếu dừng bây giờ."
          onStay={() => setQuitOpen(false)}
          onQuit={() => leave(course.pathHref)}
        />
      ) : null}

      {waiting || phase === "leaving" ? (
        <SessionContentSkeleton kind="practice" />
      ) : phase === "intro" ? (
        <main className="relative flex w-full flex-1 flex-col items-center px-4 pt-safe">
          <div className="flex w-full max-w-4xl justify-start pt-3">
            <Link
              href={course.pathHref}
              aria-label="Quay lại"
              className={`flex h-11 w-11 items-center justify-center rounded-full text-[#c7c7cc] transition-colors hover:bg-[#f5f5f7] hover:text-[#aeaeb2] ${FOCUS_RING}`}
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                close
              </span>
            </Link>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 pb-10 text-center">
            <JumpHero />
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-[#86868b]">
                {course.groupLabel} · {course.lessonLabel}
              </p>
              <h1 className="text-[26px] font-extrabold leading-8 tracking-tight text-[#1d1d1f]">
                Vượt qua bài kiểm tra này để nhảy tới {targetLabel}!
              </h1>
            </div>
            {cardCount > 0 ? (
              <ul className="flex w-full flex-col gap-2 rounded-2xl border border-[#e5e5ea] bg-white p-4 text-left text-[15px] font-semibold text-[#3a3a3c]">
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px] text-[#0066cc]" aria-hidden="true">
                    quiz
                  </span>
                  {cardCount} câu hỏi từ {course.lessonLabel}
                </li>
                <li className="flex items-center gap-3">
                  <span
                    className="material-symbols-outlined text-[22px] text-[#ff3b30]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                  >
                    favorite
                  </span>
                  {JUMP_HEARTS} tim — sai {JUMP_HEARTS} câu là phải làm lại
                </li>
                <li className="flex items-center gap-3">
                  <span
                    className="material-symbols-outlined text-[22px] text-[#f59e0b]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                  >
                    bolt
                  </span>
                  +{JUMP_XP} XP khi vượt qua
                </li>
              </ul>
            ) : (
              <p className="text-[15px] font-medium text-[#86868b]">
                Lektion này chưa có câu hỏi cho bài kiểm tra.
              </p>
            )}
            <div className="flex w-full flex-col gap-3">
              {cardCount > 0 ? (
                <button type="button" onClick={start} className={chunkyButton("primary", "w-full")}>
                  Bắt đầu
                </button>
              ) : null}
              <Link href={course.pathHref} className={chunkyButton("secondary", "w-full")}>
                Để sau
              </Link>
            </div>
          </div>
        </main>
      ) : phase === "complete" && summary ? (
        <PartCompleteScreen
          key={`complete-${attemptCount}`}
          partNumber={1}
          partCount={1}
          levelLabel={course.groupLabel}
          chapterLabel={course.lessonLabel}
          questionCount={summary.questionCount}
          accuracy={summary.accuracy}
          elapsedMs={summary.elapsedMs}
          xp={summary.xp}
          xpKind={summary.xpKind}
          xpPending={summary.xpPending}
          totalXp={summary.totalXp}
          xpNote={jumpXpNote(summary.xpKind)}
          questUpdate={summary.quests}
          streakDays={streakDays}
          celebrateStreak={!summary.failed}
          finishRun={!summary.failed}
          failed={summary.failed}
          title={summary.failed ? undefined : "Nhảy thành công!"}
          subtitle={
            summary.failed
              ? "Thử lại ngay với bộ câu hỏi mới."
              : `${course.lessonLabel} đã hoàn thành. ${targetLabel} đã mở khóa.`
          }
          continueLabel={summary.failed ? "Thử lại" : `Tới ${targetLabel}`}
          onContinue={summary.failed ? start : () => leave(targetHref)}
          secondaryLabel={summary.failed ? "Về bài học" : undefined}
          onSecondary={summary.failed ? () => leave(course.pathHref) : undefined}
        />
      ) : currentCard && currentClip ? (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pt-6 pb-24">
            {currentCard.kind === "order" ? (
              <SentenceOrderCard
                key={`order-${attemptCount}-${currentCard.key}`}
                translation={currentClip.translationVi}
                chips={currentCard.bank ?? []}
                onSubmit={handleOrderSubmit}
                locked={scoreResult !== null}
              />
            ) : currentCard.kind === "listening-order" ? (
              <SentenceOrderCard
                key={`listen-order-${attemptCount}-${currentCard.key}`}
                chips={currentCard.bank ?? []}
                onSubmit={handleOrderSubmit}
                locked={scoreResult !== null}
                afterPrompt={
                  <div className="mt-4">
                    <AudioPlayerCard
                      key={`listen-order-audio-${attemptCount}-${currentCard.key}`}
                      audioPath={currentClip.audioPath}
                    />
                  </div>
                }
              />
            ) : currentCard.kind === "vi-input" ? (
              <DictationInputCard
                key={`vi-input-${attemptCount}-${currentCard.key}`}
                prompt={currentClip.translationVi}
                onSubmit={handleTypedSubmit}
                disabled={scoreResult !== null}
                showSubmit={scoreResult === null}
              />
            ) : (
              <McCard
                key={`mc-${attemptCount}-${currentCard.key}`}
                prompt={
                  currentCard.kind === "vi-choice" ? currentClip.translationVi : currentClip.script
                }
                options={currentCard.options ?? []}
                onSubmit={handleMcSubmit}
                result={mcResult}
              />
            )}

            {mcResult ? (
              <McFeedbackCard
                result={mcResult}
                options={currentCard.options ?? []}
                clip={currentClip}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : null}
            {scoreResult ? (
              <FeedbackResultCard
                result={scoreResult}
                clip={currentClip}
                onNext={handleNext}
                nextLabel="Tiếp theo"
                skipOnMistake
                speak={currentCard.kind === "vi-input"}
              />
            ) : null}
          </div>
        </main>
      ) : (
        <SessionContentSkeleton kind="practice" />
      )}
    </div>
  );
}
