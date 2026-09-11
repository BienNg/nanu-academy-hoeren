"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Ausbildungsberuf, SessionClip } from "@/lib/content";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";

import { catalogCompletedCount, practiceQueue } from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { ProfileButton } from "@/components/ProfileButton";

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
  onReset,
}: {
  berufLabel: string;
  clipCount: number;
  completedCount: number;
  onReset: () => void;
}) {
  const allDone = clipCount > 0 && completedCount >= clipCount;

  return (
    <main className="relative flex w-full flex-1 flex-col items-center justify-center pb-32 px-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 text-center">
        {/* Animated Success Badge */}
        <div className="relative mb-2 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-[#34C759]/20" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-2 rounded-full bg-[#34C759]/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#34C759] to-[#2EAD4F] text-white shadow-[0_8px_32px_rgba(52,199,89,0.4)]">
            <MaterialIcon name="check" className="text-[32px]" filled />
          </div>
        </div>

        {/* Text Content */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-4xl font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
            {allDone ? "Hoàn thành xuất sắc!" : "Session complete"}
          </h2>
          <p className="mx-auto max-w-[280px] text-lg font-medium leading-relaxed text-[#86868b] sm:max-w-sm">
            Bạn đã chinh phục {Math.min(completedCount, clipCount)} / {clipCount} câu phỏng vấn cho <span className="font-semibold text-[#1d1d1f]">{berufLabel}</span>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row-reverse sm:px-6">
          <Link
            href="/"
            className="group relative flex h-[56px] w-full items-center justify-center gap-2 overflow-hidden rounded-[16px] bg-[#0066cc] px-6 text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98] sm:flex-1"
          >
            Về trang chủ
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#f5f5f7] px-6 text-[17px] font-semibold text-[#1d1d1f] transition-all hover:bg-[#e8e8ed] active:scale-[0.98] sm:flex-1"
          >
            <MaterialIcon name="replay" className="text-[20px]" />
            Luyện lại
          </button>
        </div>
      </div>
    </main>
  );
}

function SessionLoading() {
  return (
    <main className="relative flex w-full flex-1 flex-col items-center justify-center pb-32 px-6">
      <p className="text-lg font-medium text-[#86868b]">
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

  const { completedClipIdsFor, markClipDone, resetProgress } = useProgress();
  const completedIds = completedClipIdsFor(beruf.slug);
  const completedClips = useMemo(() => new Set(completedIds), [completedIds]);

  const catalogTotal = clips.length;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(practiceQueue(clips, completedIds));
     
    setStartingCompleted(catalogCompletedCount(clips, completedIds));
     
    setClipIndex(0);
     
    setScoreResult(null);
     
    setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const beginReplay = () => {
    resetProgress(beruf.slug);
    setQueue(practiceQueue(clips, []));
    setStartingCompleted(0);
    setClipIndex(0);
    setScoreResult(null);
    setDraft("");
  };

  return (
    <div 
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* Parallax Background Elements */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
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
          <div className="flex-1 truncate px-4 text-center">
            <h1 className="truncate font-headline-sm text-[17px] font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
              {beruf.label}
            </h1>
          </div>
          <ProfileButton />
        </div>
      </header>

      {!ready ? (
        <SessionLoading />
      ) : complete || !currentClip ? (
        <SessionComplete
          berufLabel={beruf.label}
          clipCount={catalogTotal}
          completedCount={catalogCompletedCount(clips, completedIds)}
          onReset={beginReplay}
        />
      ) : (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <header className="flex flex-col gap-3 pt-6 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
                    Ausbildung
                  </span>
                  <span className="max-w-[200px] truncate text-sm font-semibold text-[#1d1d1f] sm:max-w-none">
                    {beruf.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#e8f2fc] px-3 py-1">
                  <MaterialIcon
                    name="headphones"
                    className="text-[14px] text-[#0066cc]"
                    filled
                  />
                  <span className="text-[12px] font-bold text-[#0066cc]">
                    Câu {displayNumber} / {catalogTotal}
                  </span>
                </div>
              </div>

              <div
                aria-label="Tiến độ bài học"
                className="grid w-full gap-1.5 mt-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(catalogTotal, 1)}, minmax(0, 1fr))`,
                }}
              >
                {progressSegments.map((segment, index) => (
                  <div
                    key={`seg-${index}`}
                    className={`relative h-1.5 overflow-hidden rounded-full ${
                      segment === "todo"
                        ? "bg-[#e8e8ed]"
                        : "bg-[#0066cc]"
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
              />
            ) : (
              <>
                {scoreResult ? (
                  <FeedbackResultCard
                    result={scoreResult}
                    clip={currentClip}
                    onNext={handleNext}
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
