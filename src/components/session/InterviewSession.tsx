"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Ausbildungsberuf, SessionClip } from "@/lib/content";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";

import { catalogCompletedCount, practiceQueue } from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";

type InterviewSessionProps = {
  beruf: Ausbildungsberuf;
  clips: SessionClip[];
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

function SessionComplete({
  berufLabel,
  clipCount,
  completedCount,
}: {
  berufLabel: string;
  clipCount: number;
  completedCount: number;
}) {
  const allDone = clipCount > 0 && completedCount >= clipCount;

  return (
    <main className="relative flex w-full flex-1 flex-col bg-surface">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-space-16 px-margin-mobile pb-space-32 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-fixed text-primary">
          <MaterialIcon name="check_circle" className="text-[32px]" filled />
        </div>
        <h2 className="font-headline-md text-headline-md text-on-surface">
          {allDone ? "Đã hoàn thành" : "Session complete"}
        </h2>
        <p className="max-w-md font-body-md text-body-md text-on-surface-variant">
          Bạn đã luyện {Math.min(completedCount, clipCount)} / {clipCount} câu
          cho{" "}
          <span className="font-semibold text-on-surface">{berufLabel}</span>
          {allDone ? ". Những câu đúng sẽ không xuất hiện lại." : "."}
        </p>
        <Link
          href="/"
          className="mt-space-8 inline-flex h-[52px] items-center justify-center gap-space-8 rounded-2xl bg-primary-container px-space-24 font-label-lg text-label-lg text-on-primary shadow-[0_2px_8px_rgba(0,113,227,0.25)] transition-all hover:opacity-95 active:scale-[0.98]"
        >
          Về trang chủ
          <MaterialIcon name="arrow_forward" className="text-[18px]" />
        </Link>
      </div>
    </main>
  );
}

function SessionLoading() {
  return (
    <main className="relative flex w-full flex-1 flex-col items-center justify-center bg-surface px-margin-mobile pb-space-32">
      <p className="font-body-md text-body-md text-on-surface-variant">
        Đang tải tiến độ…
      </p>
    </main>
  );
}

export function InterviewSession({ beruf, clips }: InterviewSessionProps) {
  const [queue, setQueue] = useState<SessionClip[] | null>(null);
  const [startingCompleted, setStartingCompleted] = useState(0);
  const [clipIndex, setClipIndex] = useState(0);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [draft, setDraft] = useState("");

  const { completedClipIdsFor, markClipDone } = useProgress();
  const completedIds = completedClipIdsFor(beruf.slug);
  const completedIdsRef = useRef(completedIds);
  completedIdsRef.current = completedIds;
  const completedClips = useMemo(() => new Set(completedIds), [completedIds]);

  const catalogTotal = clips.length;

  useEffect(() => {
    const ids = completedIdsRef.current;
    setQueue(practiceQueue(clips, ids));
    setStartingCompleted(catalogCompletedCount(clips, ids));
    setClipIndex(0);
    setScoreResult(null);
    setDraft("");
  }, [beruf.slug, clips]);

  const remaining = queue ?? [];
  const currentClip = remaining[clipIndex];
  const ready = queue !== null;
  const complete = ready && clipIndex >= remaining.length;
  const isPerfect = scoreResult?.accuracy === 100;
  const displayNumber = Math.min(startingCompleted + clipIndex + 1, catalogTotal);

  const progressSegments = useMemo(() => {
    const doneCount = startingCompleted + clipIndex;
    return Array.from({ length: catalogTotal }, (_, index) => {
      if (index < doneCount) return "done";
      if (index === doneCount && currentClip) return "current";
      return "todo";
    });
  }, [catalogTotal, startingCompleted, clipIndex, currentClip]);

  const rememberClip = (clip: SessionClip) => {
    markClipDone(beruf.slug, clip.id);
  };

  const handleSubmit = (value: string) => {
    if (!currentClip) return;
    setDraft(value);
    const result = scoreAttempt(value, currentClip.script);
    setScoreResult(result);
    if (result.accuracy === 100) {
      rememberClip(currentClip);
    }
  };

  const handleNext = () => {
    if (currentClip) {
      rememberClip(currentClip);
    }
    setScoreResult(null);
    setDraft("");
    setClipIndex((index) => {
      if (!queue) return index + 1;
      let next = index + 1;
      while (next < queue.length && completedClips.has(queue[next]!.id)) {
        next += 1;
      }
      return next;
    });
  };

  const handleRetry = () => {
    setScoreResult(null);
    setDraft("");
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-surface/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="flex h-14 w-full items-center justify-between px-margin-mobile">
          <Link
            href="/"
            aria-label="Quay lại"
            className="-ml-space-8 flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container active:scale-95"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[24px]" />
          </Link>
          <div className="flex-1 truncate px-space-8 text-center">
            <h1 className="truncate font-headline-sm text-headline-sm tracking-tight text-on-surface">
              {beruf.label}
            </h1>
          </div>
          <div className="flex items-center gap-space-4">
            <button
              type="button"
              aria-label="Ngữ pháp và cài đặt phát âm"
              className="flex h-11 w-11 items-center justify-center rounded-full text-secondary transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <MaterialIcon name="tune" className="text-[22px]" />
            </button>
            <Link
              href="/account"
              className="ml-space-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary"
              aria-label="Tài khoản"
            >
              <MaterialIcon name="person" className="text-[18px]" />
            </Link>
          </div>
        </div>
      </header>

      {!ready ? (
        <SessionLoading />
      ) : complete || !currentClip ? (
        <SessionComplete
          berufLabel={beruf.label}
          clipCount={catalogTotal}
          completedCount={catalogCompletedCount(clips, completedIds)}
        />
      ) : (
        <main className="relative flex w-full flex-1 flex-col bg-surface">
          <div className="flex w-full flex-col px-margin-mobile pb-space-24">
            <header className="flex flex-col gap-space-12 pt-space-12 pb-space-8">
              <div className="flex items-center justify-between gap-space-8">
                <div className="flex min-w-0 items-center gap-space-8">
                  <span className="shrink-0 rounded-full bg-secondary-fixed px-space-8 py-space-2 font-label-sm text-label-sm text-on-secondary-fixed">
                    Ausbildung
                  </span>
                  <span className="max-w-[200px] truncate font-body-sm text-body-sm text-secondary sm:max-w-none">
                    {beruf.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-space-4 rounded-full bg-surface-container-high px-space-12 py-space-4">
                  <MaterialIcon
                    name="headphones"
                    className="text-[16px] text-primary"
                    filled
                  />
                  <span className="font-label-sm text-label-sm text-on-surface">
                    Câu {displayNumber} / {catalogTotal}
                  </span>
                </div>
              </div>

              <div
                aria-label="Tiến độ bài học"
                className="grid w-full gap-space-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(catalogTotal, 1)}, minmax(0, 1fr))`,
                }}
              >
                {progressSegments.map((segment, index) => (
                  <div
                    key={`seg-${index}`}
                    className={`relative h-1 overflow-hidden rounded-full ${
                      segment === "todo"
                        ? "bg-secondary-container"
                        : "bg-primary"
                    }`}
                  >
                    {segment === "current" ? (
                      <div className="absolute inset-0 animate-pulse bg-primary" />
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
                onRetry={handleRetry}
              />
            ) : (
              <>
                {scoreResult ? (
                  <FeedbackResultCard
                    result={scoreResult}
                    clip={currentClip}
                    onNext={handleNext}
                    onRetry={handleRetry}
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
    </>
  );
}
