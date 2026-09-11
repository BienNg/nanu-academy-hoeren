"use client";

import Link from "next/link";
import { ProfileButton } from "@/components/ProfileButton";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { useProgress } from "@/lib/useProgress";

type Chapter = {
  id: string;
  slug: string;
  label: string;
  hasAudio?: boolean;
  clipCount?: number;
};

type Level = {
  level: string;
  slug: string;
};

const springTransition = {
  type: "spring" as const,
  stiffness: 100,
  damping: 20,
  mass: 1,
};

export default function LevelViewClient({
  level,
  chapters,
}: {
  level: Level;
  chapters: Chapter[];
}) {
  const containerRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const {
    completedLearnRunClipIdsFor,
    learnChapterCompleted,
    learnRunCountFor,
  } = useProgress();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", shouldReduceMotion ? "0%" : "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, shouldReduceMotion ? 1 : 0]);

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: shouldReduceMotion ? { duration: 0 } : springTransition,
    },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
        delayChildren: shouldReduceMotion ? 0 : 0.1,
      },
    },
  };

  return (
    <main 
      ref={containerRef}
      data-layout="wide"
      className="relative flex w-full max-w-none flex-1 flex-col items-center bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* Navigation Bar */}
      <header className="fixed top-0 left-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link
            href="/"
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

      {/* Parallax Background Elements */}
      <motion.div 
        className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden"
        style={{ y: backgroundY, opacity }}
      >
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </motion.div>

      {/* Hero Section */}
      <section className="relative z-10 w-full flex flex-col items-center justify-center pt-[160px] pb-[100px] px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { ...springTransition, delay: 0.1 }}
          className="max-w-3xl flex flex-col items-center"
        >
          <span className="text-xs md:text-sm font-bold tracking-[0.2em] uppercase text-[#86868b] mb-6">
            Luyện tập theo trình độ
          </span>
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-[#1d1d1f] mb-8" style={{ letterSpacing: "-0.03em" }}>
            Trình độ {level.level}
          </h1>
          <p className="text-xl md:text-2xl text-[#86868b] max-w-2xl font-medium leading-relaxed">
            {chapters.length === 0
              ? "Chưa có chương nào. Thêm Lektion trong chapters.json và file nội dung tương ứng."
              : `Khám phá ${chapters.length} chương học được thiết kế tỉ mỉ giúp bạn làm chủ tiếng Đức.`}
          </p>
        </motion.div>
      </section>

      {/* Chapters Section */}
      <section className="relative z-10 w-full max-w-4xl px-6 pb-[160px]">
        <motion.ul
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col gap-6"
        >
          {chapters.map((chapter, index) => {
            const isAvailable = chapter.hasAudio !== false;
            const chapterKey = chapter.slug;
            const isCompleted = isAvailable && learnChapterCompleted(chapterKey);
            const runCount = learnRunCountFor(chapterKey);
            const clipCount = chapter.clipCount ?? 0;
            const startedRunCompleted = Math.min(
              clipCount,
              completedLearnRunClipIdsFor(chapterKey).length,
            );
            const startedRun =
              clipCount > 0 &&
              startedRunCompleted > 0 &&
              startedRunCompleted < clipCount;
            
            const content = (
              <>
                <div className="flex flex-col gap-2 z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[#86868b] uppercase tracking-wider">
                      Chương {index + 1}
                    </span>
                    {!isAvailable && (
                      <span className="inline-flex items-center rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                        Coming soon
                      </span>
                    )}
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f8ed] px-2 py-0.5 text-[11px] font-semibold text-[#248a3d] uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                          check_circle
                        </span>
                        Đã hoàn thành
                      </span>
                    )}
                    {runCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#1d1d1f] uppercase tracking-wider">
                        {runCount} lượt
                      </span>
                    )}
                  </div>
                  <h2 className={`text-2xl md:text-3xl font-semibold tracking-tight transition-colors duration-300 ${isAvailable ? 'text-[#1d1d1f] group-hover:text-[#0066cc]' : 'text-[#86868b]'}`} style={{ letterSpacing: "-0.015em" }}>
                    {level.level} - {chapter.label}
                  </h2>
                </div>
                
                <div className="flex items-center gap-4 z-10">
                  {startedRun && (
                    <div className="relative flex items-center justify-center w-12 h-12">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                        <circle
                          className="text-[#f5f5f7]"
                          strokeWidth="4"
                          stroke="currentColor"
                          fill="transparent"
                          r="20"
                          cx="24"
                          cy="24"
                        />
                        <circle
                          className="text-[#0066cc] transition-all duration-500 ease-out"
                          strokeWidth="4"
                          strokeDasharray={20 * 2 * Math.PI}
                          strokeDashoffset={20 * 2 * Math.PI * (1 - startedRunCompleted / clipCount)}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                          r="20"
                          cx="24"
                          cy="24"
                        />
                      </svg>
                      <span className="text-[11px] font-bold text-[#1d1d1f] tracking-tighter">
                        {startedRunCompleted}/{clipCount}
                      </span>
                    </div>
                  )}
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isAvailable ? 'bg-[#f5f5f7] text-[#86868b] group-hover:bg-[#0066cc] group-hover:text-white group-hover:scale-110 group-hover:shadow-md' : 'bg-[#f5f5f7]/50 text-[#d2d2d7]'}`}>
                    <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                      {isCompleted ? "replay" : isAvailable ? "arrow_forward" : "lock"}
                    </span>
                  </div>
                </div>
              </>
            );

            const itemClassName = `group relative flex items-center justify-between overflow-hidden rounded-[24px] backdrop-blur-xl border border-white/20 p-6 md:p-8 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isAvailable 
                ? 'bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 active:scale-[0.97] cursor-pointer' 
                : 'bg-white/40 shadow-none cursor-not-allowed'
            }`;

            return (
              <motion.li key={chapter.id} variants={itemVariants}>
                {isAvailable ? (
                  <Link href={`/learn/${level.slug}/${chapter.slug}`} className={itemClassName}>
                    {content}
                  </Link>
                ) : (
                  <div className={itemClassName}>
                    {content}
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      </section>
    </main>
  );
}
