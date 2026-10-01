"use client";

import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { BlitzrundeBanner } from "@/components/blitzrunde/BlitzrundeBanner";
import { CourseMenu, type CourseMenuItem } from "@/components/CourseMenu";
import { ProfileButton } from "@/components/ProfileButton";
import { TodayXpChip } from "@/components/TodayXpChip";
import { StudyClipList } from "@/components/session/StudyClipList";
import { AnimatePresence, motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useCallback, useId, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  projectStudentDetail,
  type AdminCatalogCourse,
  type AdminLessonDetail,
} from "@/lib/admin-detail";
import {
  isStudyActivityId,
  nextListeningPart,
  nextStudyPart,
  practiceRerunRing,
  type NextPart,
  type PracticeRerunRing,
} from "@/lib/progress";
import {
  LISTENING_FIRST_PART_XP,
  LISTENING_RERUN_PART_XP,
  STUDY_FIRST_PART_XP,
  STUDY_RERUN_PART_XP,
  xpForFinishedPasses,
} from "@/lib/xp";
import type { SessionClip } from "@/lib/content";
import { useProgress } from "@/lib/useProgress";

type Chapter = {
  id: string;
  slug: string;
  label: string;
  /** Key into local progress. Defaults to the slug, as for CEFR Lektionen. */
  progressKey?: string;
  /** Base link for this lesson's study/practice pages. Defaults to /learn/<level>/<slug>. */
  href?: string;
  /** Header title. Defaults to "<level> - <label>". */
  title?: string;
  /** Caption under the title. Defaults to the lesson's video titles. */
  topic?: string | null;
  hasAudio?: boolean;
  clipCount?: number;
  wordCount?: number;
  practiceClips?: {
    id: string;
    script: string;
    translationVi?: string;
    sentenceOrder?: boolean;
    answer?: string;
    replies?: { text: string; correct: boolean; whyVi?: string }[];
    imageUrl?: string;
  }[];
};

function progressKeyOf(chapter: Chapter): string {
  return chapter.progressKey ?? chapter.slug;
}

/** Colors and wording that differ between a CEFR level and a Leben-in-Deutschland workplace. */
export type PathOptions = {
  theme?: "level" | "living";
  /** Banner kicker, icon and title. Defaults to the CEFR level banner. */
  kicker?: string;
  kickerIcon?: string;
  title?: string;
  description?: string;
  watermarkIcon?: string;
  /** "Lektion hiện tại" by default. */
  currentLabel?: string;
  /** Course menu entry this page belongs to. Defaults to /learn/<level>. */
  courseHref?: string;
  showBlitzrunde?: boolean;
  /** Trophy node after the last lesson, gold once every lesson is finished. */
  finish?: { title: string; subtitle: string; lockedText: string };
};

const PATH_THEMES = {
  level: {
    vars: {
      "--path-accent": "#0284c7",
      "--path-accent-deep": "#0369a1",
      "--path-accent-light": "#0ea5e9",
      "--path-guide": "#1cb0f6",
    },
    muted: "text-sky-100",
    soft: "text-sky-50",
  },
  living: {
    vars: {
      "--path-accent": "#e11d48",
      "--path-accent-deep": "#be123c",
      "--path-accent-light": "#f97316",
      "--path-guide": "#e11d48",
    },
    muted: "text-rose-100",
    soft: "text-rose-50",
  },
} as const;

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
  /** Finished practice runs shown as stars, capped at 3. Null hides the row. */
  stars: number | null;
  /** Parts finished inside the current rerun. Null on the first pass. */
  rerun: { percent: number; doneParts: number; partCount: number } | null;
  /** Three finished passes. The button is gold and the ring is hidden. */
  mastered: boolean;
  /** Start card shown before the page opens. Null keeps a direct link. */
  start: StartOffer | null;
  label: string;
};

type StartOffer = {
  title: string;
  exercise: string;
  detail: string;
  xp: number;
  href: string;
};

function clipUnit(clips: readonly { script?: string }[]): "từ" | "câu" {
  const sentence = clips.some(
    (clip) => (clip.script ?? "").trim().split(/\s+/).filter(Boolean).length > 1,
  );
  return sentence ? "câu" : "từ";
}

function startOffer(
  title: string,
  part: NextPart,
  xp: number,
  href: string,
): StartOffer {
  const unit = clipUnit(part.clips);
  return {
    title,
    exercise: `Bài tập ${part.partNumber} / ${part.partCount}`,
    detail: part.rerun ? `Ôn ${part.clips.length} ${unit}` : `Học ${part.clips.length} ${unit} mới`,
    xp,
    href,
  };
}

function lessonTopic(lesson: AdminLessonDetail | undefined): string | null {
  const titles =
    lesson?.videos
      .map((video) => {
        const title = video.title.trim();
        const titleVi = video.titleVi.trim();
        if (!title) return "";
        return titleVi ? `${title} · ${titleVi}` : title;
      })
      .filter(Boolean) ?? [];
  return titles.length > 0 ? titles.join(" & ") : null;
}

function lessonTopicCaption(
  topic: string | null,
  state: "soon" | "completed" | "locked" | "current" | "open",
  currentLabel = "Lektion hiện tại",
): { text: string; current: boolean } | null {
  if (state === "current") {
    return {
      text: topic ? `${currentLabel} • ${topic}` : currentLabel,
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
  practiceRing: PracticeRerunRing | null,
  starts: { study: StartOffer | null; practice: StartOffer | null },
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
    secondary: video.titleVi || null,
    stars: null,
    rerun: null,
    mastered: false,
    start: null,
    label: [
      video.title,
      video.titleVi || null,
      video.status === "watched" ? "đã xem" : null,
    ]
      .filter(Boolean)
      .join(", "),
  }));

  const activities = lesson.activities.map((activity) => {
    const isStudy = isStudyActivityId(activity.id);
    const earnedStars = Math.min(3, lesson.runCount);
    const rerun =
      !isStudy && practiceRing && !practiceRing.mastered
        ? {
            percent: practiceRing.percent,
            doneParts: practiceRing.doneParts,
            partCount: practiceRing.partCount,
          }
        : null;
    const mastered = !isStudy && Boolean(practiceRing?.mastered);
    const primary = isStudy ? activity.progressLabel || null : null;
    const label = isStudy
      ? ["Study", activity.progressLabel || null].filter(Boolean).join(", ")
      : [
          `Luyện tập, ${earnedStars} trên 3 sao`,
          rerun && rerun.doneParts > 0 ? `${rerun.doneParts} trên ${rerun.partCount} phần` : null,
        ]
          .filter(Boolean)
          .join(", ");
    return {
      key: activity.id,
      icon: isStudy ? "menu_book" : "fitness_center",
      href: `${lessonHref}/${isStudy ? "study" : "practice"}`,
      percent: activity.percent,
      complete: activity.status === "completed" || mastered,
      struggling: activity.struggling,
      primary,
      secondary: null,
      stars: isStudy ? null : earnedStars,
      rerun,
      mastered,
      start: isStudy ? starts.study : starts.practice,
      label,
    };
  });

  return [...videos, ...activities];
}

function isVideoTrailNode(node: TrailNode): boolean {
  return node.icon === "smart_display";
}

/** "Bắt đầu" before any progress, "Học tiếp" once the node is underway. */
function continueGuideLabel(node: TrailNode): "Bắt đầu" | "Học tiếp" {
  return node.percent > 0 ? "Học tiếp" : "Bắt đầu";
}

function ContinueGuideBubble({
  label,
  reduceMotion,
}: {
  label: "Bắt đầu" | "Học tiếp";
  reduceMotion: boolean;
}) {
  return (
    <div className="pointer-events-none absolute top-1 left-1/2 z-20 -translate-x-1/2">
      <motion.div
        aria-hidden="true"
        className="flex flex-col items-center"
        style={{
          filter:
            "drop-shadow(0 1px 0 rgba(0,0,0,0.05)) drop-shadow(0 8px 14px rgba(28,27,31,0.14))",
        }}
        animate={reduceMotion ? { y: 0 } : { y: [0, -6, 0] }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <span className="rounded-2xl bg-white px-3 py-1.5 text-[13px] font-extrabold tracking-[0.06em] whitespace-nowrap text-[var(--path-guide)] uppercase">
          {label}
        </span>
        <svg viewBox="0 0 20 9" className="-mt-px h-[9px] w-5" aria-hidden="true">
          <path d="M0 0 H20 L10 9 Z" fill="#ffffff" />
        </svg>
      </motion.div>
    </div>
  );
}

/**
 * On an open Lektion, video nodes stay open so a leading run can be skipped.
 * The first node after those videos is open too. Every later node stays locked
 * until the node immediately before it is complete. Admins skip that sequence
 * on a real Lektion. Coming soon lessons stay locked for everyone.
 */
function trailNodeLocked(
  nodes: readonly TrailNode[],
  index: number,
  lessonOpen: boolean,
  unlockAll = false,
): boolean {
  if (unlockAll && lessonOpen) return false;
  if (!lessonOpen) return true;
  const node = nodes[index];
  if (!node || isVideoTrailNode(node)) return false;

  let lead = 0;
  while (lead < nodes.length && isVideoTrailNode(nodes[lead])) lead += 1;
  if (index <= lead) return false;

  return !nodes[index - 1]?.complete;
}

function ProgressRing({
  percent,
  track,
  stroke,
  fromBottom = false,
}: {
  percent: number;
  track: string;
  stroke: string;
  /** Start the arc at the bottom of the circle. */
  fromBottom?: boolean;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <svg
      className={`absolute inset-1 ${fromBottom ? "rotate-90" : "-rotate-90"}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r={radius} fill="none" style={{ stroke: track }} strokeWidth="5" />
      {clamped > 0 ? (
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          style={{ stroke }}
          strokeWidth="5"
          strokeLinecap={clamped >= 100 ? "butt" : "round"}
          strokeDasharray={circumference}
          strokeDashoffset={clamped >= 100 ? 0 : dashOffset}
        />
      ) : null}
    </svg>
  );
}

function PathCircle({
  icon,
  percent,
  complete,
  locked,
  struggling,
  rerunPercent,
  mastered,
}: {
  icon: string;
  percent: number;
  complete: boolean;
  locked: boolean;
  struggling: boolean;
  rerunPercent: number | null;
  mastered: boolean;
}) {
  const ring = struggling ? "#ff9500" : "var(--path-accent)";

  if (locked) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/70 bg-[#e2e8f0] text-[#94a3b8] shadow-[0_6px_0_0_#cbd5e1]">
        <span
          className="material-symbols-outlined text-[30px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[#e2e8f0] bg-white text-[#94a3b8] shadow-[0_2px_0_0_#cbd5e1]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2.25A4.75 4.75 0 0 0 7.25 7v2.25H6.5A2.25 2.25 0 0 0 4.25 11.5v8A2.25 2.25 0 0 0 6.5 21.75h11a2.25 2.25 0 0 0 2.25-2.25v-8A2.25 2.25 0 0 0 17.5 9.25h-.75V7A4.75 4.75 0 0 0 12 2.25Zm3.25 7V7a3.25 3.25 0 0 0-6.5 0v2.25h6.5Z"
            />
          </svg>
        </span>
      </span>
    );
  }

  if (mastered) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/70 bg-[#ffc43a] text-[#684000] shadow-[0_6px_0_0_#e09412]">
        <span
          className="material-symbols-outlined text-[30px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </span>
    );
  }

  if (complete) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/30 bg-[var(--path-accent)] text-white shadow-[0_6px_0_0_var(--path-accent-deep)]">
        {rerunPercent != null ? (
          <ProgressRing
            percent={rerunPercent}
            track="var(--path-accent-deep)"
            stroke="#ffffff"
            fromBottom
          />
        ) : null}
        <span
          className="material-symbols-outlined text-[30px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </span>
    );
  }

  return (
    <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-white shadow-[0_6px_0_0_#bec8d2]">
      <ProgressRing percent={percent} track="#e2e8f0" stroke={ring} />
      <span
        className="material-symbols-outlined text-[26px] text-[var(--path-accent)]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>
    </span>
  );
}

/** Chubby star in a 16×16 box. Points are eased so the shape reads as molded plastic. */
const PLASTIC_STAR =
  "M7.12 2.85 Q 8.00 1.10 8.88 2.85 L9.21 3.52 Q 10.09 5.28 12.03 5.57 L12.77 5.68 Q 14.70 5.97 13.31 7.35 L12.77 7.87 Q 11.38 9.25 11.70 11.18 L11.82 11.92 Q 12.14 13.85 10.40 12.95 L9.74 12.60 Q 8.00 11.70 6.26 12.60 L5.60 12.95 Q 3.86 13.85 4.18 11.92 L4.30 11.18 Q 4.62 9.25 3.23 7.87 L2.69 7.35 Q 1.30 5.97 3.23 5.68 L3.97 5.57 Q 5.91 5.28 6.79 3.52 Z";

/**
 * Three 16px stars, 18px center to center, cupped under the circle.
 * The middle star drops 4px so the row wraps the bottom of the button, without changing the gap.
 */
const STAR_PLACEMENTS = [
  { x: 0.45, y: 0, rotate: -14 },
  { x: 18, y: 4, rotate: 0 },
  { x: 35.55, y: 0, rotate: 14 },
] as const;

function RunStars({ filled, locked }: { filled: number; locked: boolean }) {
  const uid = useId().replace(/:/g, "");
  const earned = Math.min(3, Math.max(0, filled));
  const gold = `star-gold-${uid}`;
  const idle = `star-idle-${uid}`;
  const lockedOn = `star-locked-on-${uid}`;
  const lockedOff = `star-locked-off-${uid}`;

  return (
    <span className="mt-1.5 inline-flex" aria-hidden="true">
      <svg viewBox="0 0 52 20.2" className="h-[20.2px] w-[52px] overflow-visible">
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF8D6" />
            <stop offset="38%" stopColor="#FFE07A" />
            <stop offset="72%" stopColor="#FFC43A" />
            <stop offset="100%" stopColor="#F09A14" />
          </linearGradient>
          <linearGradient id={idle} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="42%" stopColor="#F3F3F6" />
            <stop offset="100%" stopColor="#E2E2E8" />
          </linearGradient>
          <linearGradient id={lockedOn} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F6EBD0" />
            <stop offset="100%" stopColor="#E4D3A8" />
          </linearGradient>
          <linearGradient id={lockedOff} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
        </defs>
        {STAR_PLACEMENTS.map((place, index) => {
          const on = index < earned;
          const fill = locked
            ? on
              ? `url(#${lockedOn})`
              : `url(#${lockedOff})`
            : on
              ? `url(#${gold})`
              : `url(#${idle})`;
          const rim = locked ? "#CBD5E1" : on ? "#E09412" : "#D2D2D8";
          const clip = `star-clip-${uid}-${index}`;
          return (
            <g key={index} transform={`translate(${place.x} ${place.y}) rotate(${place.rotate} 8 8.2)`}>
              <clipPath id={clip}>
                <path d={PLASTIC_STAR} />
              </clipPath>
              <path d={PLASTIC_STAR} fill={fill} stroke={rim} strokeWidth="0.7" strokeLinejoin="round" />
              <ellipse
                cx="6.6"
                cy="5.1"
                rx="3.6"
                ry="2.1"
                fill="#FFFFFF"
                opacity={on && !locked ? 0.78 : 0.9}
                clipPath={`url(#${clip})`}
              />
            </g>
          );
        })}
      </svg>
    </span>
  );
}

function lockedBubbleTitle(node: TrailNode): string {
  if (node.icon === "menu_book") return "Học từ vựng";
  if (node.icon === "fitness_center") return "Luyện tập";
  const title = node.primary?.trim();
  return title || "Bài học";
}

/** How far the card must slide so it stays on screen while the tail stays on the node. */
function lockedBubbleShift(anchor: HTMLElement): number {
  const rect = anchor.getBoundingClientRect();
  const bubbleWidth = Math.min(18.5 * 16, window.innerWidth - 32);
  const nodeCenter = rect.left + rect.width / 2;
  const idealLeft = nodeCenter - bubbleWidth / 2;
  const left = Math.min(Math.max(idealLeft, 16), window.innerWidth - 16 - bubbleWidth);
  return left - idealLeft;
}

function StartNodeBubble({
  offer,
  shift,
  bubbleId,
  reduceMotion,
}: {
  offer: StartOffer;
  shift: number;
  bubbleId: string;
  reduceMotion: boolean;
}) {
  const x = `calc(-50% + ${shift}px)`;
  const pop = reduceMotion
    ? { duration: 0.15 }
    : { type: "spring" as const, stiffness: 560, damping: 16, mass: 0.52 };

  return (
    <motion.div
      id={bubbleId}
      role="dialog"
      aria-label={offer.title}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.82, x }}
      animate={{ opacity: 1, y: 0, scale: 1, x }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.9, x }}
      transition={pop}
      style={{
        transformOrigin: `calc(50% - ${shift}px) 0px`,
        filter: "drop-shadow(0 3px 0 rgba(3,105,161,0.35)) drop-shadow(0 10px 18px rgba(3,105,161,0.28))",
      }}
      className="absolute top-[calc(100%+8px)] left-1/2 z-30 w-[min(18.5rem,calc(100vw-2rem))]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 12"
        className="absolute -top-[11px] h-3 w-6 -translate-x-1/2"
        style={{ left: `calc(50% - ${shift}px)` }}
      >
        <path d="M1.2 12 L12 1.2 L22.8 12 Z" style={{ fill: "var(--path-accent)" }} />
      </svg>
      <div className="rounded-2xl bg-[var(--path-accent)] px-4 pt-3.5 pb-3.5 text-white">
        <p className="text-[17px] font-extrabold leading-6">{offer.title}</p>
        <p className="mt-1 text-[15px] font-bold leading-5 text-white/80">{offer.exercise}</p>
        <p className="text-[15px] font-bold leading-5 text-white/80">{offer.detail}</p>
        <Link
          href={offer.href}
          className="mt-3 flex h-12 items-center justify-center rounded-xl bg-white text-[15px] font-extrabold tracking-[0.08em] text-[var(--path-accent)] shadow-[0_4px_0_0_#dbe7f0] transition-transform active:translate-y-0.5"
        >
          {`BẮT ĐẦU  +${offer.xp} XP`}
        </Link>
      </div>
    </motion.div>
  );
}

const COURSE_ACCESS_LOCK =
  "Chờ giáo viên cấp quyền vào khóa học này.";

function LockedNodeBubble({
  title,
  message = "Hoàn thành các bài phía trên để mở khóa!",
  shift,
  bubbleId,
  reduceMotion,
}: {
  title: string;
  message?: string;
  shift: number;
  bubbleId: string;
  reduceMotion: boolean;
}) {
  const x = `calc(-50% + ${shift}px)`;
  const pop = reduceMotion
    ? { duration: 0.15 }
    : { type: "spring" as const, stiffness: 560, damping: 16, mass: 0.52 };

  return (
    <motion.div
      id={bubbleId}
      initial={reduceMotion ? { opacity: 0, x } : { opacity: 0, scale: 0.42, y: -4, x }}
      animate={reduceMotion ? { opacity: 1, x } : { opacity: 1, scale: 1, y: 0, x }}
      exit={
        reduceMotion
          ? { opacity: 0, x, transition: { duration: 0.12 } }
          : { opacity: 0, scale: 0.62, y: -2, x, transition: { duration: 0.14, ease: "easeIn" } }
      }
      transition={pop}
      style={{
        transformOrigin: `calc(50% - ${shift}px) 0px`,
        filter:
          "drop-shadow(0 3px 0 rgba(0,0,0,0.05)) drop-shadow(0 10px 18px rgba(28,27,31,0.16))",
      }}
      className="absolute top-[calc(100%+8px)] left-1/2 z-30 w-[min(18.5rem,calc(100vw-2rem))]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 12"
        className="absolute -top-[11px] h-3 w-6 -translate-x-1/2"
        style={{ left: `calc(50% - ${shift}px)` }}
      >
        <path d="M1.2 12 L12 1.2 L22.8 12 Z" fill="#ffffff" />
      </svg>
      <div className="rounded-2xl bg-white px-4 pt-3.5 pb-3.5">
        <p className="text-[17px] font-extrabold leading-6 text-[#4b4b4b]">{title}</p>
        <p className="mt-1 text-[15px] font-bold leading-5 text-[#777]">{message}</p>
        <div
          className="mt-3 flex h-12 items-center justify-center rounded-xl bg-[#e5e5e5] text-[15px] font-extrabold tracking-[0.14em] text-[#afafaf] shadow-[0_4px_0_0_#d1d1d1]"
          aria-hidden="true"
        >
          ĐÃ KHÓA
        </div>
      </div>
    </motion.div>
  );
}

function PathStop({
  node,
  locked,
  lockedMessage,
  guideLabel,
  bubbleOpen,
  onLockedPress,
  onDismiss,
  reduceMotion,
}: {
  node: TrailNode;
  locked: boolean;
  lockedMessage?: string;
  guideLabel?: "Bắt đầu" | "Học tiếp" | null;
  bubbleOpen: boolean;
  onLockedPress: () => void;
  onDismiss: () => void;
  reduceMotion: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleId = useId();
  const [wiggle, setWiggle] = useState(0);
  const [shift, setShift] = useState<number | null>(null);
  const className =
    "flex max-w-[10.5rem] flex-col items-center rounded-full text-center transition-transform active:translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--path-accent)]";
  const body = (
    <>
      <PathCircle
        icon={node.icon}
        percent={node.percent}
        complete={node.complete}
        locked={locked}
        struggling={node.struggling}
        rerunPercent={node.rerun?.percent ?? null}
        mastered={node.mastered}
      />
      {node.primary ? (
        <span
          className={`mt-1.5 text-[12px] font-bold leading-4 ${
            locked ? "text-[#6e7881]" : node.complete ? "text-[#131b2e]" : "text-[var(--path-accent-deep)]"
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
      {node.stars != null ? <RunStars filled={node.stars} locked={locked} /> : null}
    </>
  );

  const label = [guideLabel, locked ? `${node.label}, đã khóa` : node.label]
    .filter(Boolean)
    .join(", ");

  useLayoutEffect(() => {
    if (!bubbleOpen || !rootRef.current) {
      setShift(null);
      return;
    }
    const place = () => {
      if (!rootRef.current) return;
      setShift(lockedBubbleShift(rootRef.current));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [bubbleOpen]);

  useEffect(() => {
    if (!bubbleOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [bubbleOpen, onDismiss]);

  useEffect(() => {
    if (!bubbleOpen || shift == null || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const bubbleBottom = rect.bottom + 168;
    const limit = window.innerHeight - 96;
    if (bubbleBottom <= limit) return;
    window.scrollBy({
      top: bubbleBottom - limit,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [bubbleOpen, shift, reduceMotion]);

  if (!locked && node.start) {
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-label={label}
          aria-expanded={bubbleOpen}
          aria-controls={bubbleOpen ? bubbleId : undefined}
          onClick={onLockedPress}
          className={className}
        >
          {body}
        </button>
        <AnimatePresence>
          {bubbleOpen && shift != null ? (
            <StartNodeBubble
              offer={node.start}
              shift={shift}
              bubbleId={bubbleId}
              reduceMotion={reduceMotion}
            />
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  if (!locked && node.href) {
    return (
      <Link href={node.href} aria-label={label} className={className}>
        {body}
      </Link>
    );
  }

  if (!locked) {
    return (
      <div className={className} aria-label={label}>
        {body}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={bubbleOpen}
        aria-controls={bubbleOpen ? bubbleId : undefined}
        onClick={() => {
          if (!reduceMotion) setWiggle((count) => count + 1);
          onLockedPress();
        }}
        className={className}
      >
        <motion.span
          key={wiggle}
          className="flex flex-col items-center"
          initial={{ x: 0 }}
          animate={
            wiggle === 0 || reduceMotion ? { x: 0 } : { x: [0, -8, 7, -6, 5, -2, 0] }
          }
          transition={{ duration: 0.38, ease: "easeInOut" }}
        >
          {body}
        </motion.span>
      </button>
      <AnimatePresence>
        {bubbleOpen && shift != null ? (
          <LockedNodeBubble
            title={lockedBubbleTitle(node)}
            message={lockedMessage}
            shift={shift}
            bubbleId={bubbleId}
            reduceMotion={reduceMotion}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type OpenDictionary = {
  label: string;
  clips: SessionClip[] | null;
  error: boolean;
};

function LessonDictionaryModal({
  title,
  clips,
  error,
  onClose,
}: {
  title: string;
  clips: SessionClip[] | null;
  error: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#131b2e]/40 sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-dictionary-title"
        className="flex h-[min(100dvh,920px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-[#fbfbfd] shadow-2xl sm:h-[min(85dvh,820px)] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-black/[0.05] bg-[#fbfbfd]/90 px-3 py-3 backdrop-blur-xl sm:px-5">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--path-accent)] transition-colors hover:bg-[#f5f5f7] active:scale-95"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              close
            </span>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868b]">
              Từ vựng
            </p>
            <h2
              id="lesson-dictionary-title"
              className="truncate text-[15px] font-bold tracking-tight text-[#1d1d1f]"
            >
              {title}
            </h2>
          </div>
          <span className="w-11 shrink-0 text-right text-[13px] font-medium text-[#86868b]">
            {clips ? clips.length : ""}
          </span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {error ? (
            <p className="px-2 py-8 text-center text-[15px] font-medium text-[#86868b]">
              Không tải được từ vựng. Thử lại sau.
            </p>
          ) : clips == null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-2xl bg-[#f5f5f7]" />
              ))}
            </div>
          ) : clips.length === 0 ? (
            <p className="px-2 py-8 text-center text-[15px] font-medium text-[#86868b]">
              Chưa có từ vựng cho Lektion này.
            </p>
          ) : (
            <StudyClipList clips={clips} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Last stop on a path. Grey and locked until every lesson is finished, then gold. */
function FinishTrophy({
  title,
  subtitle,
  lockedText,
  earned,
}: {
  title: string;
  subtitle: string;
  lockedText: string;
  earned: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 text-center"
      aria-label={earned ? `${title}, đã đạt` : `${title}, chưa đạt`}
    >
      <span
        className={`relative flex h-[92px] w-[92px] items-center justify-center rounded-full border-t-2 ${
          earned
            ? "border-white/70 bg-[#ffc43a] text-[#684000] shadow-[0_7px_0_0_#e09412]"
            : "border-white/70 bg-[#e2e8f0] text-[#94a3b8] shadow-[0_7px_0_0_#cbd5e1]"
        }`}
      >
        <span
          className="material-symbols-outlined text-[44px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          trophy
        </span>
      </span>
      <span
        className={`text-[15px] font-extrabold leading-5 ${earned ? "text-[#131b2e]" : "text-[#6e7881]"}`}
      >
        {title}
      </span>
      <span className="max-w-[16rem] text-[13px] font-medium leading-5 text-[#6e7881]">
        {earned ? subtitle : lockedText}
      </span>
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
  courses,
  accessLocked = false,
  loadLessonDictionary,
  path = {},
}: {
  level: Level;
  chapters: Chapter[];
  cefrCatalog: readonly AdminCatalogCourse[];
  isAdmin?: boolean;
  courses: { levels: CourseMenuItem[]; interviews: CourseMenuItem[]; living?: CourseMenuItem[] };
  /** The learner has no course grant. The path is visible and every node is locked. */
  accessLocked?: boolean;
  loadLessonDictionary: (chapterSlug: string) => Promise<SessionClip[]>;
  path?: PathOptions;
}) {
  const theme = PATH_THEMES[path.theme ?? "level"];
  const containerRef = useRef<HTMLElement>(null);
  const dictionaryRequest = useRef(0);
  const [dictionary, setDictionary] = useState<OpenDictionary | null>(null);
  const [lockedBubbleId, setLockedBubbleId] = useState<string | null>(null);
  const [returnSlug, setReturnSlug] = useState<string | null>(null);
  const [focusReady, setFocusReady] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const {
    progress,
    progressReady,
    completedLearnClipIdsFor,
    completedLearnRunClipIdsFor,
    learnRunClipOrderFor,
    learnRunCountFor,
    learnStudyRunCountFor,
    learnChapterCompleted,
    reviewedLearnClipIdsFor,
    streakDays,
    settleStudyReviews,
  } = useProgress();
  const courseDetail = useMemo(() => {
    return projectStudentDetail(cefrCatalog, progress).courses.find(
      (entry) => entry.id === level.slug,
    );
  }, [cefrCatalog, level.slug, progress]);
  useEffect(() => {
    if (!progressReady) return;
    const course = cefrCatalog.find((entry) => entry.id === level.slug);
    if (!course) return;
    for (const lesson of course.lessons) {
      if (!lesson.learnKey || lesson.clips.length === 0) continue;
      settleStudyReviews(lesson.learnKey, lesson.clips);
    }
  }, [cefrCatalog, level.slug, progressReady, settleStudyReviews]);
  const lessonById = useMemo(
    () => new Map(courseDetail?.lessons.map((lesson) => [lesson.id, lesson]) ?? []),
    [courseDetail],
  );
  const completedLessonCount = chapters.filter(
    (chapter) => chapter.hasAudio !== false && learnChapterCompleted(progressKeyOf(chapter)),
  ).length;
  const overallPercent =
    chapters.length === 0 ? 0 : Math.round((completedLessonCount / chapters.length) * 100);

  function firstIncompletePrevious(index: number): Chapter | undefined {
    return chapters
      .slice(0, index)
      .find(
        (chapter) =>
          chapter.hasAudio !== false &&
          !learnChapterCompleted(progressKeyOf(chapter)),
      );
  }

  const resumeChapterSlug =
    chapters.find((chapter, index) => {
      if (chapter.hasAudio === false) return false;
      if (learnChapterCompleted(progressKeyOf(chapter))) return false;
      if (firstIncompletePrevious(index)) return false;
      const clipCount = chapter.clipCount ?? 0;
      const startedCount = Math.min(
        clipCount,
        completedLearnRunClipIdsFor(progressKeyOf(chapter)).length,
      );
      return clipCount > 0 && startedCount > 0 && startedCount < clipCount;
    })?.slug ?? null;

  const currentChapterSlug =
    chapters.find((chapter, index) => {
      if (chapter.hasAudio === false) return false;
      if (learnChapterCompleted(progressKeyOf(chapter))) return false;
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

  const closeDictionary = useCallback(() => {
    dictionaryRequest.current += 1;
    setDictionary(null);
  }, []);

  const toggleLockedBubble = useCallback((id: string) => {
    setLockedBubbleId((current) => (current === id ? null : id));
  }, []);

  const dismissLockedBubble = useCallback((id: string) => {
    setLockedBubbleId((current) => (current === id ? null : current));
  }, []);

  const openDictionary = useCallback(
    (chapter: Chapter) => {
      const request = dictionaryRequest.current + 1;
      dictionaryRequest.current = request;
      const label = chapter.title ?? `${level.level} - ${chapter.label}`;
      setDictionary({ label, clips: null, error: false });
      void loadLessonDictionary(chapter.slug)
        .then((clips) => {
          if (dictionaryRequest.current !== request) return;
          setDictionary({ label, clips, error: false });
        })
        .catch(() => {
          if (dictionaryRequest.current !== request) return;
          setDictionary({ label, clips: null, error: true });
        });
    },
    [level.level, loadLessonDictionary],
  );

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

  const allLessonsDone =
    chapters.length > 0 &&
    chapters.every(
      (chapter) => chapter.hasAudio === false || learnChapterCompleted(progressKeyOf(chapter)),
    );

  return (
    <div className="contents" style={theme.vars as React.CSSProperties}>
    <main 
      ref={containerRef}
      data-layout="wide"
      className="relative flex w-full max-w-none flex-1 flex-col items-center bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* Navigation Bar */}
      <header className="fixed top-0 left-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <CourseMenu
            currentHref={path.courseHref ?? `/learn/${level.slug}`}
            levels={courses.levels}
            interviews={courses.interviews}
            living={courses.living}
          />
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-full border border-black/[0.05] bg-white px-2.5 py-1 shadow-sm"
              aria-label={`Chuỗi ${streakDays} ngày`}
            >
              <span
                className="material-symbols-outlined text-[16px] text-[#ff9500]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                local_fire_department
              </span>
              <span className="text-[13px] font-semibold text-[#1d1d1f]">
                {streakDays} ngày
              </span>
            </div>
            <TodayXpChip />
            <ProfileButton />
          </div>
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
        className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1rem)] pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] sm:px-6"
        style={{ fontFamily: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif" }}
      >
        {path.showBlitzrunde === false ? null : <BlitzrundeBanner />}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { ...springTransition, delay: 0.1 }}
          className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--path-accent)] to-[var(--path-accent-light)] p-4 text-white shadow-[0_6px_0_0_var(--path-accent-deep)]"
        >
          <div className="relative z-10 flex flex-col gap-0.5">
            <span className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider ${theme.muted}`}>
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {path.kickerIcon ?? "school"}
              </span>
              {path.kicker ?? "Luyện tập theo trình độ"}
            </span>
            <h1 className="text-[20px] font-extrabold leading-7 text-white">
              {path.title ?? `Trình độ ${level.level}`}
            </h1>
            <p className={`mt-1 text-[14px] font-medium leading-5 ${theme.muted}`}>
              {path.description ??
                (chapters.length === 0
                  ? "Chưa có chương nào. Thêm Lektion trong chapters.json và file nội dung tương ứng."
                  : `Khám phá ${chapters.length} chương học được thiết kế tỉ mỉ giúp bạn làm chủ tiếng Đức.`)}
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
              <span className={theme.soft}>{overallPercent}% hoàn thành</span>
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
              {path.watermarkIcon ?? "flag_circle"}
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
          {(() => {
            let continueGuideClaimed = false;
            return chapters.map((chapter, index) => {
            const isAvailable = chapter.hasAudio !== false;
            const chapterKey = progressKeyOf(chapter);
            const isCompleted = isAvailable && learnChapterCompleted(chapterKey);
            const gateChapter = firstIncompletePrevious(index);
            const isLocked =
              !accessLocked &&
              !isAdmin &&
              isAvailable &&
              !isCompleted &&
              Boolean(gateChapter);
            const isOpen = !accessLocked && isAvailable && !isLocked;
            const isResume = chapter.slug === resumeChapterSlug;
            const lessonDetail = lessonById.get(`${level.slug}-${chapter.slug}`);
            const lessonHref = chapter.href ?? `/learn/${level.slug}/${chapter.slug}`;
            const listeningDone = Boolean(
              lessonDetail?.activities.some(
                (activity) =>
                  !isStudyActivityId(activity.id) &&
                  (activity.status === "completed" || (lessonDetail?.runCount ?? 0) >= 1),
              ),
            );
            const practiceRing = listeningDone
              ? practiceRerunRing(
                  chapter.practiceClips ?? [],
                  lessonDetail?.runCount ?? 0,
                  learnRunClipOrderFor(progressKeyOf(chapter)),
                  completedLearnRunClipIdsFor(progressKeyOf(chapter)),
                )
              : null;
            const practiceClips = chapter.practiceClips ?? [];
            const studyPart = nextStudyPart(
              practiceClips,
              reviewedLearnClipIdsFor(progressKeyOf(chapter)),
              learnStudyRunCountFor(progressKeyOf(chapter)),
            );
            const listeningPart = nextListeningPart(
              practiceClips,
              completedLearnClipIdsFor(progressKeyOf(chapter)),
              learnRunCountFor(progressKeyOf(chapter)),
              learnRunClipOrderFor(progressKeyOf(chapter)),
              completedLearnRunClipIdsFor(progressKeyOf(chapter)),
            );
            const studyPasses = learnStudyRunCountFor(progressKeyOf(chapter));
            const listeningPasses = learnRunCountFor(progressKeyOf(chapter));
            const nodes = lessonTrailNodes(
              lessonDetail,
              lessonHref,
              (videoId) =>
                `${lessonHref}/video?video=${encodeURIComponent(videoId)}`,
              practiceRing,
              {
                study: studyPart
                  ? startOffer(
                      "Học từ vựng",
                      studyPart,
                      xpForFinishedPasses(studyPasses, STUDY_FIRST_PART_XP, STUDY_RERUN_PART_XP).xp,
                      studyPart.freshReplay ? `${lessonHref}/study?replay=1` : `${lessonHref}/study`,
                    )
                  : null,
                practice: listeningPart
                  ? startOffer(
                      "Luyện tập",
                      listeningPart,
                      xpForFinishedPasses(
                        listeningPasses,
                        LISTENING_FIRST_PART_XP,
                        LISTENING_RERUN_PART_XP,
                      ).xp,
                      `${lessonHref}/practice`,
                    )
                  : null,
              },
            );
            const topicLine = lessonTopicCaption(
              chapter.topic ?? lessonTopic(lessonDetail),
              !isAvailable
                ? "soon"
                : accessLocked
                  ? "locked"
                  : isCompleted
                    ? "completed"
                    : isLocked
                      ? "locked"
                      : chapter.slug === currentChapterSlug
                        ? "current"
                        : "open",
              path.currentLabel,
            );
            const headerClassName = `flex w-full flex-col gap-2 rounded-2xl bg-white p-4 ${
              isOpen && isResume
                ? "shadow-[0_4px_0_0_var(--path-accent)]"
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
                      {chapter.title ?? `${level.level} - ${chapter.label}`}
                    </h2>
                    {topicLine ? (
                      <p
                        className={`text-[13px] leading-5 ${
                          topicLine.current
                            ? "font-bold text-[var(--path-accent)]"
                            : "font-medium text-[#6e7881]"
                        }`}
                      >
                        {topicLine.text}
                      </p>
                    ) : null}
                  </div>
                  {!accessLocked && isCompleted ? (
                    <AchievementMedal />
                  ) : !isOpen ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                        lock
                      </span>
                    </div>
                  ) : null}
                </div>
                {!accessLocked && isLocked && gateChapter ? (
                  <div className="flex items-start gap-2 text-[14px] font-medium leading-5 text-[#6e7881]">
                    <span className="material-symbols-outlined mt-0.5 text-[18px] text-[var(--path-accent)]" aria-hidden="true">
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
                        <button
                          type="button"
                          aria-label="Từ vựng"
                          onClick={() => openDictionary(chapter)}
                          className="flex h-11 w-11 items-center justify-center rounded-full border-t-2 border-white bg-white text-[var(--path-accent)] shadow-[0_4px_0_0_#bec8d2] transition-transform active:translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--path-accent)]"
                        >
                          <span
                            className="material-symbols-outlined text-[22px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            aria-hidden="true"
                          >
                            dictionary
                          </span>
                        </button>
                      </li>
                    ) : null}
                    {nodes.map((node, nodeIndex) => {
                      const bubbleId = `${chapter.slug}:${node.key}`;
                      const locked =
                        accessLocked ||
                        trailNodeLocked(nodes, nodeIndex, isOpen, isAdmin);
                      const showGuide =
                        !continueGuideClaimed &&
                        !locked &&
                        !node.complete &&
                        !isVideoTrailNode(node);
                      if (showGuide) continueGuideClaimed = true;
                      const guideLabel = showGuide ? continueGuideLabel(node) : null;
                      return (
                        <li
                          key={node.key}
                          className={`${PATH_SHIFT[nodeIndex % PATH_SHIFT.length]} ${
                            lockedBubbleId === bubbleId ? "relative z-30" : "relative"
                          } ${guideLabel ? "pt-14" : ""}`}
                        >
                          {guideLabel ? (
                            <ContinueGuideBubble
                              label={guideLabel}
                              reduceMotion={shouldReduceMotion === true}
                            />
                          ) : null}
                          <PathStop
                            node={node}
                            locked={locked}
                            lockedMessage={accessLocked ? COURSE_ACCESS_LOCK : undefined}
                            guideLabel={guideLabel}
                            bubbleOpen={lockedBubbleId === bubbleId}
                            onLockedPress={() => toggleLockedBubble(bubbleId)}
                            onDismiss={() => dismissLockedBubble(bubbleId)}
                            reduceMotion={shouldReduceMotion === true}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </motion.li>
            );
            });
          })()}
          {path.finish ? (
            <motion.li variants={itemVariants} className="flex flex-col items-center gap-2 pt-2">
              <FinishTrophy
                title={path.finish.title}
                subtitle={path.finish.subtitle}
                lockedText={path.finish.lockedText}
                earned={!accessLocked && allLessonsDone}
              />
            </motion.li>
          ) : null}
        </motion.ul>
      </section>
    </main>
    {dictionary ? (
      <LessonDictionaryModal
        title={dictionary.label}
        clips={dictionary.clips}
        error={dictionary.error}
        onClose={closeDictionary}
      />
    ) : null}
    <BottomNav />
    </div>
  );
}
