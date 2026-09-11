"use client";

import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";

type Chapter = {
  id: string;
  slug: string;
  label: string;
};

type Level = {
  level: string;
  slug: string;
};

const springTransition = {
  type: "spring",
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
      className="relative flex flex-1 flex-col items-center bg-[#fbfbfd] min-h-screen selection:bg-[#0066cc] selection:text-white overflow-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* Parallax Background Elements */}
      <motion.div 
        className="pointer-events-none absolute left-0 top-0 w-full h-[800px] overflow-hidden"
        style={{ y: backgroundY, opacity }}
      >
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
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
          {chapters.map((chapter, index) => (
            <motion.li key={chapter.id} variants={itemVariants}>
              <Link
                href={`/learn/${level.slug}/${chapter.slug}`}
                className="group relative flex items-center justify-between overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 active:scale-[0.97]"
              >
                <div className="flex flex-col gap-2 z-10">
                  <span className="text-sm font-medium text-[#86868b] uppercase tracking-wider">
                    Chương {index + 1}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors duration-300" style={{ letterSpacing: "-0.015em" }}>
                    {level.level} - {chapter.label}
                  </h2>
                </div>
                
                <div className="z-10 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[#0066cc] group-hover:text-white group-hover:scale-110 group-hover:shadow-md">
                  <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                    arrow_forward
                  </span>
                </div>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      </section>
    </main>
  );
}
