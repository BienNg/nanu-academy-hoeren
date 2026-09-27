"use client";

import Link from "next/link";
import { ProfileButton } from "@/components/ProfileButton";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useId, useEffect, useMemo, useRef, useState } from "react";
import {
  projectStudentDetail,
  type AdminCatalogCourse,
  type AdminLessonDetail,
} from "@/lib/admin-detail";
import { useProgress } from "@/lib/useProgress";

type Chapter = {
  id: string;
  slug: string;
  label: string;
  hasAudio?: boolean;
  clipCount?: number;
  wordCount?: number;
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

const PATH_SHIFT = [
  "-translate-x-9",
  "translate-x-9",
  "translate-x-0",
  "-translate-x-6",
  "translate-x-8",
] as const;

type TrailNode = {
  key: string;
  icon: string;
  href: string | null;
  percent: number;
  complete: boolean;
  struggling: boolean;
  primary: string | null;
  secondary: string | null;
  label: string;
};

function lessonTopic(lesson: AdminLessonDetail | undefined): string | null {
  const titles =
    lesson?.videos.map((video) => video.title.trim()).filter(Boolean) ?? [];
  return titles.length > 0 ? titles.join(" & ") : null;
}

function lessonTopicCaption(
  topic: string | null,
  state: "soon" | "completed" | "locked" | "current" | "open",
): { text: string; current: boolean } | null {
  if (state === "current") {
    return {
      text: topic ? `Lektion hiện tại • ${topic}` : "Lektion hiện tại",
      current: true,
    };
  }
  if (!topic || state === "soon" || state === "completed") {
    return topic ? { text: topic, current: false } : null;
  }
  if (state === "locked") return { text: `${topic} • Đã khóa`, current: false };
  return { text: topic, current: false };
}

function lessonTrailNodes(
  lesson: AdminLessonDetail | undefined,
  lessonHref: string,
  videoHref: (videoId: string) => string,
  wordCount: number,
): TrailNode[] {
  if (!lesson) return [];

  const videos = lesson.videos.map((video) => ({
    key: video.id,
    icon: "smart_display",
    href: videoHref(video.id),
    percent: video.status === "watched" ? 100 : 0,
    complete: video.status === "watched",
    struggling: false,
    primary: video.title,
    secondary: null,
    label: video.status === "watched" ? `${video.title}, đã xem` : video.title,
  }));

  const activities = lesson.activities.map((activity) => {
    const isStudy = activity.id.endsWith("-study");
    const wordLabel = wordCount > 0 ? `${wordCount} từ` : null;
    const note = isStudy
      ? activity.progressLabel
        ? null
        : wordLabel
      : activity.note;
    const primary = activity.progressLabel || note || null;
    const secondary = activity.progressLabel && note ? note : null;
    const label = isStudy
      ? ["Study", activity.progressLabel || null, note].filter(Boolean).join(", ")
      : `${activity.label}${
          activity.progressLabel ? ` ${activity.progressLabel}` : ", completed"
        }${activity.note ? `, ${activity.note}` : ""}`;
    return {
      key: activity.id,
      icon: isStudy ? "menu_book" : "headphones",
      href: `${lessonHref}/${isStudy ? "study" : "practice"}`,
      percent: activity.percent,
      complete: activity.status === "completed",
      struggling: activity.struggling,
      primary,
      secondary,
      label,
    };
  });

  return [...videos, ...activities];
}

function PathCircle({
  icon,
  percent,
  complete,
  locked,
  struggling,
}: {
  icon: string;
  percent: number;
  complete: boolean;
  locked: boolean;
  struggling: boolean;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  const ring = struggling ? "#ff9500" : "#0284c7";

  if (locked) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/70 bg-[#e2e8f0] text-[#94a3b8] shadow-[0_6px_0_0_#cbd5e1]">
        <span
          className="material-symbols-outlined text-[30px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#cbd5e1] text-[#475569] shadow-[0_1.5px_0_0_#94a3b8]">
          <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
            lock
          </span>
        </span>
      </span>
    );
  }

  if (complete) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/30 bg-[#0284c7] text-white shadow-[0_6px_0_0_#0369a1]">
        <span
          className="material-symbols-outlined text-[30px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#fea619] text-[#684000] shadow-[0_2px_0_0_#855300]">
          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
            check
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-white shadow-[0_6px_0_0_#bec8d2]">
      <svg
        className="absolute inset-1 -rotate-90"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        {clamped > 0 ? (
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={ring}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        ) : null}
      </svg>
      <span
        className="material-symbols-outlined text-[26px] text-[#0284c7]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>
    </span>
  );
}

function PathStop({ node, locked }: { node: TrailNode; locked: boolean }) {
  const className =
    "flex max-w-[10.5rem] flex-col items-center rounded-full text-center transition-transform active:translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0284c7]";
  const body = (
    <>
      <PathCircle
        icon={node.icon}
        percent={node.percent}
        complete={node.complete}
        locked={locked}
        struggling={node.struggling}
      />
      {node.primary ? (
        <span
          className={`mt-1.5 text-[12px] font-bold leading-4 ${
            locked ? "text-[#6e7881]" : node.complete ? "text-[#131b2e]" : "text-[#0369a1]"
          }`}
        >
          {node.primary}
        </span>
      ) : null}
      {node.secondary ? (
        <span
          className={`text-[11px] font-semibold leading-4 ${
            node.struggling && !locked ? "text-[#9a6700]" : "text-[#64748b]"
          }`}
        >
          {node.secondary}
        </span>
      ) : null}
    </>
  );

  if (!locked && node.href) {
    return (
      <Link href={node.href} aria-label={node.label} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <div className={className} aria-label={node.label}>
      {body}
    </div>
  );
}

function AchievementMedal() {
  const uid = useId().replace(/:/g, "");
  const goldId = `achievement-gold-${uid}`;
  const rimId = `achievement-rim-${uid}`;

  return (
    <span
      className="achievement-medal inline-flex h-11 w-11 shrink-0 items-center justify-center"
      title="Đã hoàn thành"
    >
      <span className="sr-only">Đã hoàn thành</span>
      <svg
        viewBox="0 0 48 48"
        className="h-11 w-11 drop-shadow-[0_2px_6px_rgba(140,96,24,0.22)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F3D48A" />
            <stop offset="100%" stopColor="#C4922A" />
          </linearGradient>
          <linearGradient id={goldId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF6DC" />
            <stop offset="48%" stopColor="#F0D48A" />
            <stop offset="100%" stopColor="#E2BE62" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="20" fill={`url(#${rimId})`} />
        <circle cx="24" cy="24" r="16" fill={`url(#${goldId})`} />
        <path
          d="M24 15.2 L26.1 20.2 L31.4 20.6 L27.2 24 L28.6 29.2 L24 26.2 L19.4 29.2 L20.8 24 L16.6 20.6 L21.9 20.2 Z"
          fill="#8C5E16"
        />
      </svg>
    </span>
  );
}

export default function LevelViewClient({
  level,
  chapters,
  cefrCatalog,
  isAdmin = false,
}: {
  level: Level;
  chapters: Chapter[];
  cefrCatalog: readonly AdminCatalogCourse[];
  isAdmin?: boolean;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const [returnSlug, setReturnSlug] = useState<string | null>(null);
  const [focusReady, setFocusReady] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { progress, completedLearnRunClipIdsFor, learnChapterCompleted } = useProgress();
  const courseDetail = useMemo(() => {
    return projectStudentDetail(cefrCatalog, progress).courses.find(
      (entry) => entry.id === level.slug,
    );
  }, [cefrCatalog, level.slug, progress]);
  const lessonById = useMemo(
    () => new Map(courseDetail?.lessons.map((lesson) => [lesson.id, lesson]) ?? []),
    [courseDetail],
  );
  const completedLessonCount = chapters.filter(
    (chapter) => chapter.hasAudio !== false && learnChapterCompleted(chapter.slug),
  ).length;
  const overallPercent =
    chapters.length === 0 ? 0 : Math.round((completedLessonCount / chapters.length) * 100);

  function firstIncompletePrevious(index: number): Chapter | undefined {
    return chapters
      .slice(0, index)
      .find(
        (chapter) =>
          chapter.hasAudio !== false &&
          !learnChapterCompleted(chapter.slug),
      );
  }

  const resumeChapterSlug =
    chapters.find((chapter, index) => {
      if (chapter.hasAudio === false) return false;
      if (learnChapterCompleted(chapter.slug)) return false;
      if (firstIncompletePrevious(index)) return false;
      const clipCount = chapter.clipCount ?? 0;
      const startedCount = Math.min(
        clipCount,
        completedLearnRunClipIdsFor(chapter.slug).length,
      );
      return clipCount > 0 && startedCount > 0 && startedCount < clipCount;
    })?.slug ?? null;

  const currentChapterSlug =
    chapters.find((chapter, index) => {
      if (chapter.hasAudio === false) return false;
      if (learnChapterCompleted(chapter.slug)) return false;
      if (firstIncompletePrevious(index)) return false;
      return true;
    })?.slug ?? null;

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lektion");
    setReturnSlug(requested);
    setFocusReady(true);
  }, []);

  const focusSlug =
    (returnSlug && chapters.some((chapter) => chapter.slug === returnSlug)
      ? returnSlug
      : null) ?? resumeChapterSlug;

  useEffect(() => {
    if (!focusReady || !focusSlug) return;
    let cancelled = false;

    const scrollToLesson = () => {
      if (cancelled) return;
      const target = document.getElementById(`lesson-${focusSlug}`);
      if (!target) return;
      const top =
        target.getBoundingClientRect().top +
        window.scrollY -
        window.innerHeight / 2 +
        target.offsetHeight / 2;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    };

    const frame = window.requestAnimationFrame(scrollToLesson);
    const timer = window.setTimeout(scrollToLesson, 400);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusReady, focusSlug, shouldReduceMotion]);

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

      <section
        className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1rem)] pb-28 sm:px-6"
        style={{ fontFamily: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif" }}
      >
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { ...springTransition, delay: 0.1 }}
          className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-4 text-white shadow-[0_6px_0_0_#0369a1]"
        >
          <div className="relative z-10 flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-sky-100">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                school
              </span>
              Luyện tập theo trình độ
            </span>
            <h1 className="text-[20px] font-extrabold leading-7 text-white">
              Trình độ {level.level}
            </h1>
            <p className="mt-1 text-[14px] font-medium leading-5 text-sky-100">
              {chapters.length === 0
                ? "Chưa có chương nào. Thêm Lektion trong chapters.json và file nội dung tương ứng."
                : `Khám phá ${chapters.length} chương học được thiết kế tỉ mỉ giúp bạn làm chủ tiếng Đức.`}
            </p>
          </div>
          <div className="relative z-10 mt-4 flex flex-col gap-1.5 border-t border-white/20 pt-3">
            <div className="flex items-center justify-between text-[12px] font-bold leading-4 text-white">
              <span className="flex items-center gap-1">
                <span
                  className="material-symbols-outlined text-[16px] text-amber-300"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  bolt
                </span>
                Tổng tiến độ
              </span>
              <span className="text-sky-50">{overallPercent}% hoàn thành</span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-black/20 p-0.5 shadow-inner"
              role="progressbar"
              aria-valuenow={overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Tổng tiến độ ${overallPercent}%`}
            >
              <div
                className="h-full rounded-full bg-amber-400 shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-700 ease-out"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
          <div className="pointer-events-none absolute -right-4 -bottom-6 text-white opacity-15">
            <span className="material-symbols-outlined text-[120px]" aria-hidden="true">
              flag_circle
            </span>
          </div>
        </motion.div>
        <motion.ul
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col gap-8"
        >
          {chapters.map((chapter, index) => {
            const isAvailable = chapter.hasAudio !== false;
            const chapterKey = chapter.slug;
            const isCompleted = isAvailable && learnChapterCompleted(chapterKey);
            const gateChapter = firstIncompletePrevious(index);
            const isLocked =
              !isAdmin && isAvailable && !isCompleted && Boolean(gateChapter);
            const isOpen = isAvailable && !isLocked;
            const isResume = chapter.slug === resumeChapterSlug;
            const lessonDetail = lessonById.get(`${level.slug}-${chapter.slug}`);
            const lessonHref = `/learn/${level.slug}/${chapter.slug}`;
            const nodes = lessonTrailNodes(
              lessonDetail,
              lessonHref,
              (videoId) =>
                `${lessonHref}/video?video=${encodeURIComponent(videoId)}`,
              chapter.wordCount ?? 0,
            );
            const topicLine = lessonTopicCaption(
              lessonTopic(lessonDetail),
              !isAvailable
                ? "soon"
                : isCompleted
                  ? "completed"
                  : isLocked
                    ? "locked"
                    : chapter.slug === currentChapterSlug
                      ? "current"
                      : "open",
            );
            const headerClassName = `flex w-full flex-col gap-2 rounded-2xl bg-white p-4 ${
              isOpen && isResume
                ? "shadow-[0_4px_0_0_#0284c7]"
                : "shadow-[0_4px_0_0_#dae2fd]"
            }`;
            const header = (
              <>
                {!isAvailable ? (
                  <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                    Coming soon
                  </span>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2
                      className={`text-[20px] font-extrabold leading-7 tracking-tight ${
                        isOpen ? "text-[#131b2e]" : "text-[#6e7881]"
                      }`}
                    >
                      {level.level} - {chapter.label}
                    </h2>
                    {topicLine ? (
                      <p
                        className={`text-[13px] leading-5 ${
                          topicLine.current
                            ? "font-bold text-[#0284c7]"
                            : "font-medium text-[#6e7881]"
                        }`}
                      >
                        {topicLine.text}
                      </p>
                    ) : null}
                  </div>
                  {isCompleted ? (
                    <AchievementMedal />
                  ) : (
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        isOpen
                          ? "bg-[#e2e7ff] text-[#131b2e] shadow-[0_2px_0_0_#bec8d2]"
                          : "bg-[#f1f5f9] text-[#94a3b8]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                        {isOpen ? "arrow_forward" : "lock"}
                      </span>
                    </div>
                  )}
                </div>
                {isLocked && gateChapter ? (
                  <div className="flex items-start gap-2 text-[14px] font-medium leading-5 text-[#6e7881]">
                    <span className="material-symbols-outlined mt-0.5 text-[18px] text-[#0284c7]" aria-hidden="true">
                      flag
                    </span>
                    <span>Xong {gateChapter.label} trước đã — rồi tới lượt này.</span>
                  </div>
                ) : null}
              </>
            );

            return (
              <motion.li
                key={chapter.id}
                id={`lesson-${chapter.slug}`}
                variants={itemVariants}
                className="flex scroll-mt-[calc(5rem+env(safe-area-inset-top,0px))] flex-col items-center"
              >
                <div className={headerClassName}>{header}</div>
                {nodes.length > 0 ? (
                  <ul className="relative flex w-full flex-col items-center gap-3 py-3">
                    {isOpen && nodes.some((node) => node.icon === "menu_book") ? (
                      <li className="absolute top-3 right-0 z-10">
                        <Link
                          href={`${lessonHref}/study?view=list`}
                          aria-label="Từ vựng"
                          className="flex h-11 w-11 items-center justify-center rounded-full border-t-2 border-white bg-white text-[#0284c7] shadow-[0_4px_0_0_#bec8d2] transition-transform active:translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0284c7]"
                        >
                          <span
                            className="material-symbols-outlined text-[22px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            aria-hidden="true"
                          >
                            dictionary
                          </span>
                        </Link>
                      </li>
                    ) : null}
                    {nodes.map((node, nodeIndex) => (
                      <li key={node.key} className={PATH_SHIFT[nodeIndex % PATH_SHIFT.length]}>
                        <PathStop node={node} locked={!isOpen} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </motion.li>
            );
          })}
        </motion.ul>
      </section>
    </main>
  );
}
