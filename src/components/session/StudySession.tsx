"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { CefrLevel, LevelChapterMeta } from "@/lib/levels";
import type { SessionClip } from "@/lib/content";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { ClipContentCard } from "@/components/session/ClipContentCard";
import { ProfileButton } from "@/components/ProfileButton";
import {
  catalogCompletedCount,
  firstUnreviewedIndex,
} from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";

type StudySessionProps = {
  level: CefrLevel;
  chapter: LevelChapterMeta;
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

function StudyComplete({
  chapterLabel,
  clipCount,
  reviewedCount,
  hubHref,
  onReview,
}: {
  chapterLabel: string;
  clipCount: number;
  reviewedCount: number;
  hubHref: string;
  onReview: () => void;
}) {
  return (
    <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="relative mb-2 flex h-24 w-24 items-center justify-center">
          <div
            className="absolute inset-0 animate-ping rounded-full bg-[#0066cc]/15"
            style={{ animationDuration: "3s" }}
          />
          <div className="absolute inset-2 rounded-full bg-[#0066cc]/10" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#0066cc] text-white shadow-[0_8px_32px_rgba(0,102,204,0.28)]">
            <MaterialIcon name="menu_book" className="text-[32px]" filled />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2
            className="text-4xl font-bold tracking-tight text-[#1d1d1f]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Đã xem hết thẻ
          </h2>
          <p className="mx-auto max-w-[280px] text-lg font-medium leading-relaxed text-[#86868b] sm:max-w-sm">
            Bạn đã xem {Math.min(reviewedCount, clipCount)} / {clipCount} câu
            trong <span className="font-semibold text-[#1d1d1f]">{chapterLabel}</span>.
          </p>
        </div>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row-reverse sm:px-6">
          <Link
            href={`${hubHref}/practice`}
            className="flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] px-6 text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98] sm:flex-1"
          >
            Luyện nghe
          </Link>
          <button
            type="button"
            onClick={onReview}
            className="flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#f5f5f7] px-6 text-[17px] font-semibold text-[#1d1d1f] transition-all hover:bg-[#e8e8ed] active:scale-[0.98] sm:flex-1"
          >
            <MaterialIcon name="replay" className="text-[20px]" />
            Xem lại
          </button>
        </div>
      </div>
    </main>
  );
}

export function StudySession({ level, chapter, clips }: StudySessionProps) {
  const shouldReduceMotion = useReducedMotion();
  const {
    markLearnClipReviewed,
    resetLearnStudyProgress,
    reviewedLearnClipIdsFor,
  } = useProgress();

  const chapterProgressKey = chapter.slug;
  const reviewedIds = reviewedLearnClipIdsFor(chapterProgressKey);
  const reviewedCount = catalogCompletedCount(clips, reviewedIds);
  const hubHref = `/learn/${level.slug}/${chapter.slug}`;

  const [clipIndex, setClipIndex] = useState(() =>
    firstUnreviewedIndex(clips, reviewedIds),
  );
  const [direction, setDirection] = useState(1);
  const [ready, setReady] = useState(false);
  const initializedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setClipIndex(firstUnreviewedIndex(clips, reviewedIds));
    setReady(true);
  }, [clips, reviewedIds]);

  const currentClip = clips[clipIndex];
  const complete = ready && (clips.length === 0 || clipIndex >= clips.length);
  const isReviewed = currentClip
    ? reviewedIds.includes(currentClip.id)
    : false;

  const progressSegments = useMemo(() => {
    return clips.map((clip, index) => {
      if (reviewedIds.includes(clip.id)) return "done";
      if (index === clipIndex && currentClip) return "current";
      return "todo";
    });
  }, [clips, reviewedIds, clipIndex, currentClip]);

  const rememberCurrent = useCallback(() => {
    if (!currentClip) return;
    markLearnClipReviewed(chapterProgressKey, currentClip.id);
  }, [currentClip, chapterProgressKey, markLearnClipReviewed]);

  const goNext = useCallback(() => {
    if (!currentClip) return;
    rememberCurrent();
    setDirection(1);
    setClipIndex((index) => index + 1);
  }, [currentClip, rememberCurrent]);

  const goPrev = useCallback(() => {
    if (clipIndex <= 0) return;
    setDirection(-1);
    setClipIndex((index) => index - 1);
  }, [clipIndex]);

  const beginReview = () => {
    resetLearnStudyProgress(chapterProgressKey);
    setDirection(1);
    setClipIndex(0);
  };

  useEffect(() => {
    if (complete || !currentClip) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey || event.isComposing) return;
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        goNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [complete, currentClip, goNext, goPrev]);

  const handleTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (touchStartX.current == null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX == null) return;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (delta < -56) goNext();
    if (delta > 56) goPrev();
  };

  const displayNumber = Math.min(clipIndex + 1, clips.length);

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
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <Link
            href={hubHref}
            aria-label="Quay lại"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#0066cc] transition-colors hover:bg-[#f5f5f7] active:scale-95"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
          </Link>
          <div className="flex-1 truncate px-4 text-center">
            <h1
              className="truncate font-headline-sm text-[17px] font-bold tracking-tight text-[#1d1d1f]"
              style={{ letterSpacing: "-0.015em" }}
            >
              {level.level} - {chapter.label}
            </h1>
          </div>
          <ProfileButton />
        </div>
      </header>

      {!ready ? (
        <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
          <p className="text-lg font-medium text-[#86868b]">Đang tải tiến độ…</p>
        </main>
      ) : clips.length === 0 ? (
        <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 pb-32">
          <p className="text-lg font-medium text-[#86868b]">
            Chưa có nội dung cho Lektion này.
          </p>
        </main>
      ) : complete || !currentClip ? (
        <StudyComplete
          chapterLabel={`${level.level} - ${chapter.label}`}
          clipCount={clips.length}
          reviewedCount={reviewedCount}
          hubHref={hubHref}
          onReview={beginReview}
        />
      ) : (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <header className="flex flex-col gap-3 pt-6 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
                    Học nội dung
                  </span>
                  <span className="max-w-[200px] truncate text-sm font-semibold text-[#1d1d1f] sm:max-w-none">
                    {chapter.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#e8f2fc] px-3 py-1">
                  <MaterialIcon
                    name="menu_book"
                    className="text-[14px] text-[#0066cc]"
                    filled
                  />
                  <span className="text-[12px] font-bold text-[#0066cc]">
                    Thẻ {displayNumber} / {clips.length}
                  </span>
                </div>
              </div>

              <div
                aria-label="Tiến độ học nội dung"
                className="mt-2 grid w-full gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(clips.length, 1)}, minmax(0, 1fr))`,
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

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="flex flex-col"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentClip.id}
                  initial={
                    shouldReduceMotion
                      ? { opacity: 1 }
                      : { opacity: 0, x: direction > 0 ? 28 : -28 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 1 }
                      : { opacity: 0, x: direction > 0 ? -28 : 28 }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 280, damping: 32 }
                  }
                >
                  <AudioPlayerCard
                    key={currentClip.id}
                    audioPath={currentClip.audioPath}
                  />

                  <div className="mt-4">
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
                        ) : (
                          <div className="flex items-center">
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0066cc]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#0066cc]">
                              <span className="material-symbols-outlined text-[16px]">
                                translate
                              </span>
                              <span>Từ và bản dịch</span>
                            </div>
                          </div>
                        )
                      }
                    />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

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
                onClick={goNext}
                className="group flex h-[56px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98]"
              >
                <span>{clipIndex === clips.length - 1 ? "Hoàn thành" : "Tiếp theo"}</span>
                <span className="material-symbols-outlined text-[20px] transition-transform duration-300 group-hover:translate-x-1">
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
