"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CefrLevel, LevelChapterMeta } from "@/lib/levels";
import type { SessionClip } from "@/lib/content";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import {
  catalogCompletedCount,
  clipsInStoredOrder,
  firstIncompletePartIndex,
  learnQueue,
  sameClipOrderSet,
  splitListeningParts,
} from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { playSuccessSound } from "@/lib/sfx";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { ProfileButton } from "@/components/ProfileButton";
import { SessionContentSkeleton } from "@/components/RouteLoading";

type LearnSessionProps = {
  level: CefrLevel;
  chapter: LevelChapterMeta;
  clips: SessionClip[];
  nextChapterHref: string;
  hasNextChapter: boolean;
};

const PRACTICE_FOCUS_KEY = "nanu-focus-luyen-nghe";
const pendingRunOrders = new Map<string, string[]>();
const replacementRunOrders = new Map<string, string[]>();

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
  level,
  chapter,
  clips,
  nextChapterHref,
  hasNextChapter,
}: LearnSessionProps) {
  const router = useRouter();
  const { status } = useSession();
  const [partClips, setPartClips] = useState<SessionClip[] | null>(null);
  const [partNumber, setPartNumber] = useState(1);
  const [partCount, setPartCount] = useState(0);
  const [clipIndex, setClipIndex] = useState(0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"practice" | "leaving">("practice");
  const initializedSourceRef = useRef("");
  const committedRef = useRef(false);

  const {
    completedLearnClipIdsFor,
    completedLearnRunClipIdsFor,
    learnRunClipOrderFor,
    learnChapterCompleted,
    markLearnChapterDone,
    setLearnRunOrder,
    commitLearnListeningPart,
    recordWrongAttempt,
  } = useProgress();
  const chapterProgressKey = chapter.slug;
  const lessonKey = `${level.slug}/${chapter.slug}`;
  const hubHref = `/learn/${level.slug}/${chapter.slug}?focus=luyen-nghe#luyen-nghe`;
  const completedIds = completedLearnClipIdsFor(chapterProgressKey);
  const runCompletedIds = completedLearnRunClipIdsFor(chapterProgressKey);
  const runOrder = learnRunClipOrderFor(chapterProgressKey);
  const chapterMarkedDone = learnChapterCompleted(chapterProgressKey);
  const completedKey = completedIds.join("\n");
  const runCompletedKey = runCompletedIds.join("\n");
  const runOrderKey = runOrder.join("\n");
  const clipKey = clips.map((clip) => `${clip.id}\t${clip.script}`).join("\n");

  // One part per visit. Ordered on the first pass, shuffled once per review run.
  // Progress is written only when the part ends, so leaving early restarts it.
  useEffect(() => {
    if (status === "loading") return;
    if (phase !== "practice") return;
    if (clipIndex !== 0 || scoreResult !== null || draft.length > 0) return;

    if (clips.length === 0) {
      if (initializedSourceRef.current === "empty") return;
      initializedSourceRef.current = "empty";
      setPartClips([]);
      setPartCount(0);
      setPartNumber(1);
      return;
    }

    const catalogDone =
      chapterMarkedDone ||
      catalogCompletedCount(clips, completedIds) >= clips.length;
    if (catalogDone && !chapterMarkedDone) {
      markLearnChapterDone(chapterProgressKey);
    }

    const review = catalogDone;
    let order = runOrder;
    let doneIds = review ? runCompletedIds : completedIds;

    if (review && !sameClipOrderSet(clips, order)) {
      order = stableRunOrder(chapterProgressKey, clips);
      setLearnRunOrder(chapterProgressKey, order);
      doneIds = [];
    }

    let ordered = review ? clipsInStoredOrder(clips, order) : clips;
    let parts = splitListeningParts(ordered);
    let partIndex = firstIncompletePartIndex(parts, doneIds);

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
    }

    if (partIndex < 0) partIndex = 0;

    const signature = [
      review ? "review" : "first",
      String(partIndex),
      String(parts.length),
      ordered.map((clip) => clip.id).join("|"),
      doneIds.join("|"),
    ].join("~");
    if (initializedSourceRef.current === signature) return;

    initializedSourceRef.current = signature;
    setPartClips(parts[partIndex] ?? []);
    setPartNumber(partIndex + 1);
    setPartCount(parts.length);
    setClipIndex(0);
    setScoreResult(null);
    setDraft("");
  }, [
    status,
    phase,
    clipIndex,
    scoreResult,
    draft,
    clipKey,
    chapterProgressKey,
    chapterMarkedDone,
    completedKey,
    runCompletedKey,
    runOrderKey,
    markLearnChapterDone,
    setLearnRunOrder,
  ]);

  const currentClip = partClips?.[clipIndex];
  const ready = partClips !== null;
  const isPerfect = scoreResult?.accuracy === 100;
  const atEndOfPart = Boolean(partClips && clipIndex >= partClips.length - 1);
  const isLastPart = partCount > 0 && partNumber >= partCount;
  const nextLabel = !atEndOfPart
    ? "Tiếp theo"
    : isLastPart
      ? hasNextChapter
        ? "Lektion tiếp theo"
        : "Về trình độ"
      : "Về bài học";

  const progressSegments = useMemo(() => {
    const total = partClips?.length ?? 0;
    return Array.from({ length: Math.max(total, 1) }, (_, index) => {
      if (index < clipIndex) return "done";
      if (index === clipIndex && currentClip) return "current";
      return "todo";
    });
  }, [partClips, clipIndex, currentClip]);

  const handleSubmit = (value: string) => {
    if (!currentClip) return;
    setDraft(value);
    const result = scoreAttempt(value, currentClip.script);
    setScoreResult(result);
    if (result.accuracy === 100) {
      playSuccessSound();
    } else {
      recordWrongAttempt();
    }
  };

  const finishPart = () => {
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
    setPhase("leaving");
    router.push(finishRun ? nextChapterHref : hubHref);
  };

  const handleNext = () => {
    if (!partClips || !currentClip) return;
    if (clipIndex + 1 >= partClips.length) {
      finishPart();
      return;
    }
    setScoreResult(null);
    setDraft("");
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
            href={hubHref}
            aria-label="Quay lại"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#0066cc] transition-colors hover:bg-[#f5f5f7] active:scale-95"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
          </Link>
          <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#86868b] mb-0.5">
              Luyện tập
            </span>
            <h1 className="truncate font-headline-sm text-[15px] font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
              {level.level} - {chapter.label}
            </h1>
          </div>
          <ProfileButton />
        </div>
      </header>

      {!ready || phase === "leaving" ? (
        <SessionContentSkeleton kind="practice" />
      ) : !currentClip ? (
        <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">
              Chưa có bài nghe
            </h2>
            <Link
              href={hubHref}
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
                  gridTemplateColumns: `repeat(${Math.max(partClips.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {progressSegments.map((segment, index) => (
                  <div
                    key={`seg-${index}`}
                    className={`relative h-1.5 overflow-hidden rounded-full ${
                      segment === "todo" ? "bg-[#e8e8ed]" : "bg-[#0066cc]"
                    }`}
                  >
                    {segment === "current" ? (
                      <div className="absolute inset-0 animate-pulse bg-[#0066cc]" />
                    ) : null}
                  </div>
                ))}
              </div>
            </header>

            <AudioPlayerCard
              key={currentClip.id}
              audioPath={currentClip.audioPath}
            />

            {isPerfect && scoreResult ? (
              <FeedbackResultCard
                result={scoreResult}
                clip={currentClip}
                onNext={handleNext}
                nextLabel={nextLabel}
              />
            ) : (
              <>
                {scoreResult ? (
                  <FeedbackResultCard
                    result={scoreResult}
                    clip={currentClip}
                    onNext={handleNext}
                    nextLabel={nextLabel}
                  />
                ) : null}
                <DictationInputCard
                  key={`dictation-${currentClip.id}`}
                  value={draft}
                  onChange={setDraft}
                  onSubmit={handleSubmit}
                />
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
