"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ProfileButton } from "@/components/ProfileButton";
import { useProgress } from "@/lib/useProgress";
import { catalogCompletedCount } from "@/lib/progress";
import type { CefrLevel, LevelChapterMeta } from "@/lib/levels";

type ChapterHubClientProps = {
  level: CefrLevel;
  chapter: LevelChapterMeta;
  clipIds: string[];
};

const springTransition = {
  type: "spring" as const,
  stiffness: 100,
  damping: 20,
  mass: 1,
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

function ModeCard({
  href,
  icon,
  title,
  description,
  progressLabel,
  progress,
  disabled,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  progressLabel: string;
  progress: number;
  disabled?: boolean;
}) {
  const cardClassName = `group relative flex flex-col gap-5 overflow-hidden rounded-[24px] border border-white/20 p-6 backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:p-7 ${
    disabled
      ? "cursor-not-allowed bg-white/40 shadow-none"
      : "cursor-pointer bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] active:scale-[0.97]"
  }`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-[16px] ${
            disabled ? "bg-[#f5f5f7]/70 text-[#d2d2d7]" : "bg-[#e8f2fc] text-[#0066cc]"
          }`}
        >
          <MaterialIcon name={icon} className="text-[24px]" filled />
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            disabled
              ? "bg-[#f5f5f7]/50 text-[#d2d2d7]"
              : "bg-[#f5f5f7] text-[#86868b] group-hover:scale-110 group-hover:bg-[#0066cc] group-hover:text-white group-hover:shadow-md"
          }`}
        >
          <MaterialIcon name={disabled ? "lock" : "arrow_forward"} className="text-xl" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h2
          className={`text-2xl font-semibold tracking-tight sm:text-[28px] ${
            disabled ? "text-[#86868b]" : "text-[#1d1d1f] group-hover:text-[#0066cc]"
          }`}
          style={{ letterSpacing: "-0.02em" }}
        >
          {title}
        </h2>
        <p className="text-[15px] font-medium leading-relaxed text-[#86868b] sm:text-[17px]">
          {description}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-bold uppercase tracking-wider text-[#86868b]">
            {progressLabel}
          </span>
          <span className="text-[13px] font-semibold text-[#1d1d1f]">
            {Math.round(progress * 100)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]">
          <div
            className="h-full rounded-full bg-[#0066cc] transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </>
  );

  if (disabled) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <Link href={href} className={cardClassName}>
      {content}
    </Link>
  );
}

export default function ChapterHubClient({
  level,
  chapter,
  clipIds,
}: ChapterHubClientProps) {
  const shouldReduceMotion = useReducedMotion();
  const {
    completedLearnRunClipIdsFor,
    reviewedLearnClipIdsFor,
    learnChapterCompleted,
  } = useProgress();

  const clipCount = clipIds.length;
  const isAvailable = clipCount > 0;
  const reviewedCount = catalogCompletedCount(
    clipIds.map((id) => ({ id })),
    reviewedLearnClipIdsFor(chapter.slug),
  );
  const practicedCount = catalogCompletedCount(
    clipIds.map((id) => ({ id })),
    completedLearnRunClipIdsFor(chapter.slug),
  );
  const practiceComplete = learnChapterCompleted(chapter.slug);
  const studyComplete = clipCount > 0 && reviewedCount >= clipCount;

  const studyProgress = clipCount === 0 ? 0 : reviewedCount / clipCount;
  const practiceProgress =
    clipCount === 0
      ? 0
      : practiceComplete
        ? 1
        : practicedCount / clipCount;

  return (
    <main
      data-layout="wide"
      className="relative flex w-full max-w-none flex-1 flex-col items-center bg-[#fbfbfd] min-h-dvh overflow-x-hidden selection:bg-[#0066cc] selection:text-white"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <header className="fixed top-0 left-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link
            href={`/learn/${level.slug}`}
            className="group flex items-center gap-1.5 text-[#0066cc] transition-opacity hover:opacity-80 active:opacity-60"
          >
            <span className="material-symbols-outlined text-[20px] font-medium" aria-hidden="true">
              arrow_back_ios_new
            </span>
            <span className="text-[17px] font-medium tracking-tight">Trở về</span>
          </Link>
          <ProfileButton />
        </div>
      </header>

      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>

      <section className="relative z-10 flex w-full max-w-2xl flex-col px-6 pt-[120px] pb-24">
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { ...springTransition, delay: 0.05 }}
          className="mb-10 flex flex-col gap-3"
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#86868b] md:text-sm">
            {level.level}
          </span>
          <h1
            className="text-4xl font-bold tracking-tight text-[#1d1d1f] sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            {chapter.label}
          </h1>
          <p className="max-w-md text-lg font-medium leading-relaxed text-[#86868b]">
            Học nội dung trước, hoặc luyện nghe ngay.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { ...springTransition, delay: 0.12 }}
          className="flex flex-col gap-4"
        >
          <ModeCard
            href={`/learn/${level.slug}/${chapter.slug}/study`}
            icon="menu_book"
            title="Học nội dung"
            description="Xem từng câu như thẻ ghi nhớ — audio, từ và bản dịch."
            progressLabel={
              studyComplete
                ? "Đã xem hết"
                : reviewedCount > 0
                  ? `${reviewedCount} / ${clipCount} đã xem`
                  : `${clipCount} thẻ`
            }
            progress={studyProgress}
            disabled={!isAvailable}
          />
          <ModeCard
            href={`/learn/${level.slug}/${chapter.slug}/practice`}
            icon="headphones"
            title="Luyện nghe"
            description="Nghe và chép chính tả để kiểm tra những gì bạn đã học."
            progressLabel={
              practiceComplete
                ? "Đã hoàn thành"
                : practicedCount > 0
                  ? `${practicedCount} / ${clipCount} đã luyện`
                  : `${clipCount} câu`
            }
            progress={practiceProgress}
            disabled={!isAvailable}
          />
        </motion.div>
      </section>
    </main>
  );
}
