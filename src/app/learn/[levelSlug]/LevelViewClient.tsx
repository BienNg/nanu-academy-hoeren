"use client";

import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { BlitzrundeBanner } from "@/components/blitzrunde/BlitzrundeBanner";
import { CourseMenu, type CourseMenuItem } from "@/components/CourseMenu";
import { ProfileButton } from "@/components/ProfileButton";
import { TodayXpChip } from "@/components/TodayXpChip";
import { ChillPingu, PATH_POSES, ReadingPingu, type PathPose } from "@/components/session/Pingu";
import { StudyClipList } from "@/components/session/StudyClipList";
import { AnimatePresence, motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useCallback, useId, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  projectStudentDetail,
  type AdminCatalogCourse,
  type AdminLessonDetail,
} from "@/lib/admin-detail";
import {
  lessonNodeFromActivityId,
  lessonPathNodes,
  nextListeningPart,
  nextNodePart,
  nextStudyPart,
  type LessonPathNode,
  type NextPart,
} from "@/lib/progress";
import {
  LISTENING_FIRST_PART_XP,
  LISTENING_RERUN_PART_XP,
  STUDY_FIRST_PART_XP,
  STUDY_RERUN_PART_XP,
  xpForFinishedPasses,
} from "@/lib/xp";
import type { LiveRound } from "@/lib/blitzrunde-store";
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
      "--path-node": "#3A81C6",
      "--path-node-lip": "#2C679F",
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
      "--path-node": "#e11d48",
      "--path-node-lip": "#be123c",
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

/** Peak sideways swing of the path, in px. */
const PATH_AMPLITUDE_PX = 72;
/** Nodes per full left-right-left swing. */
const PATH_PERIOD = 8;
/** Mascot center, in px from the path's center line. */
const PATH_MASCOT_PX = 116;

/** Sideways offset of a path node: a smooth sine wave that swings left first. */
function pathShiftPx(index: number): number {
  return Math.round(-PATH_AMPLITUDE_PX * Math.sin((index * 2 * Math.PI) / PATH_PERIOD));
}

/**
 * The node where the snake bows farthest from the chord between its
 * neighbors. The mascot sits on the open side of that bend. `start` is the
 * first node's step on the level-wide path; the returned index is local.
 */
function pathWhiteSpace(
  nodeCount: number,
  start = 0,
): { index: number; side: "left" | "right" } | null {
  if (nodeCount < 1) return null;
  const at = (i: number) => pathShiftPx(start + i);
  if (nodeCount === 1) {
    return { index: 0, side: at(0) >= 0 ? "left" : "right" };
  }
  if (nodeCount === 2) {
    return { index: 1, side: at(1) >= 0 ? "left" : "right" };
  }
  let index = 1;
  let bow = 0;
  for (let i = 1; i < nodeCount - 1; i++) {
    const depth = at(i) - (at(i - 1) + at(i + 1)) / 2;
    if (Math.abs(depth) > Math.abs(bow)) {
      bow = depth;
      index = i;
    }
  }
  return { index, side: bow >= 0 ? "left" : "right" };
}

/**
 * One pose per Lektion. The deck is shuffled from the level slug so every
 * pose shows up, the order stays put across renders, and neighbors don't match.
 */
function pathPoses(seed: string, count: number): PathPose[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;
  if (state === 0) state = 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const deal = (avoid?: PathPose) => {
    const deck = [...PATH_POSES];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const swap = deck[j];
      deck[j] = deck[i]!;
      deck[i] = swap!;
    }
    if (avoid && deck[0] === avoid) {
      const swapAt = deck.findIndex((pose, i) => i > 0 && pose !== avoid);
      if (swapAt > 0) {
        const swap = deck[swapAt];
        deck[swapAt] = deck[0]!;
        deck[0] = swap!;
      }
    }
    return deck;
  };
  const poses: PathPose[] = [];
  while (poses.length < count) {
    for (const pose of deal(poses.at(-1))) {
      poses.push(pose);
      if (poses.length === count) break;
    }
  }
  return poses;
}

type TrailNode = {
  key: string;
  icon: string;
  href: string | null;
  percent: number;
  /** Parts on this node. More than one splits the progress ring. */
  partCount: number;
  partsDone: number;
  complete: boolean;
  struggling: boolean;
  primary: string | null;
  secondary: string | null;
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

/**
 * Start card for one Study or Practice node of a CEFR Lektion.
 * An unfinished node offers its next part. A finished node offers a replay
 * of all its parts.
 */
function nodeStartOffer(
  node: LessonPathNode<{ id: string; script?: string }>,
  doneIds: readonly string[],
  lessonHref: string,
): StartOffer {
  const study = node.kind === "study";
  const next = nextNodePart(node, doneIds);
  const replay = next == null;
  const localPart = replay ? 1 : next.partNumber - node.firstPart + 1;
  // Cards of one clip can span two practice parts, so a replay counts each clip once.
  const clips = replay ? [...new Map(node.parts.flat().map((clip) => [clip.id, clip])).values()] : next.clips;
  const unit = clipUnit(clips);
  return {
    title: study ? "Học từ vựng" : "Luyện tập",
    exercise: `Phần ${localPart} / ${node.parts.length}`,
    detail: replay ? `Ôn ${clips.length} ${unit}` : `Học ${clips.length} ${unit} mới`,
    xp: study
      ? replay
        ? STUDY_RERUN_PART_XP
        : STUDY_FIRST_PART_XP
      : replay
        ? LISTENING_RERUN_PART_XP
        : LISTENING_FIRST_PART_XP,
    href: `${lessonHref}/${study ? "study" : "practice"}?node=${node.node}`,
  };
}

function lessonTrailNodes(
  lesson: AdminLessonDetail | undefined,
  lessonHref: string,
  videoHref: (videoId: string) => string,
  startFor: (activityId: string) => StartOffer | null,
): TrailNode[] {
  if (!lesson) return [];

  const videos = lesson.videos.map((video) => ({
    key: video.id,
    icon: "smart_display",
    href: videoHref(video.id),
    percent: video.status === "watched" ? 100 : 0,
    partCount: 0,
    partsDone: 0,
    complete: video.status === "watched",
    struggling: false,
    primary: video.title,
    secondary: video.titleVi || null,
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
    const trailNode = lessonNodeFromActivityId(activity.id);
    const isStudy = trailNode?.kind === "study";
    const numbered = /-\d+$/.test(activity.id) && trailNode ? ` ${trailNode.node}` : "";
    const partProgress =
      activity.partCount > 1 ? `${activity.partsDone}/${activity.partCount}` : null;
    const label = isStudy
      ? [`Study${numbered}`, partProgress].filter(Boolean).join(", ")
      : [`Luyện tập${numbered}`, partProgress].filter(Boolean).join(", ");
    const page = isStudy ? "study" : "practice";
    return {
      key: activity.id,
      icon: isStudy ? "menu_book" : "fitness_center",
      href: numbered ? `${lessonHref}/${page}?node=${trailNode?.node}` : `${lessonHref}/${page}`,
      percent: activity.percent,
      partCount: activity.partCount,
      partsDone: activity.partsDone,
      complete: activity.status === "completed",
      struggling: activity.struggling,
      primary: null,
      secondary: null,
      start: startFor(activity.id),
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
 * The first node after those videos is open too, and so is every finished
 * node. Every other node stays locked until each Study and Practice node
 * before it is complete. Admins skip that sequence
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
  // A finished node stays open for replay, even after an earlier gap.
  if (node.complete) return false;

  let lead = 0;
  while (lead < nodes.length && isVideoTrailNode(nodes[lead])) lead += 1;
  if (index <= lead) return false;

  return nodes
    .slice(lead, index)
    .some((earlier) => !isVideoTrailNode(earlier) && !earlier.complete);
}

function ProgressRing({
  percent,
  parts,
  partsDone,
  track,
  stroke,
}: {
  percent: number;
  /** More than one part draws that many arcs. A finished part fills its arc. */
  parts: number;
  partsDone: number;
  track: string;
  stroke: string;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const count = Math.max(0, Math.round(parts));
  const done = Math.min(count, Math.max(0, Math.round(partsDone)));

  if (count > 1) {
    const slot = circumference / count;
    const gap = Math.min(10, slot * 0.18);
    const segment = slot - gap;
    return (
      <svg
        className="absolute inset-1 -rotate-90"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, index) => (
          <circle
            key={index}
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            style={{ stroke: index < done ? stroke : track }}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${segment} ${circumference - segment}`}
            strokeDashoffset={-index * (segment + gap)}
          />
        ))}
      </svg>
    );
  }

  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <svg
      className="absolute inset-1 -rotate-90"
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

/**
 * Lesson-path glyphs from the design reference, drawn on a 64px grid.
 * Video, words, and practice sit on the round nodes. The word list sits on the side button.
 * `onWhite` uses the light-background drawings, where white fills become blue or navy.
 */
export function LessonPathIcon({
  name,
  className,
  onWhite = false,
}: {
  name: string;
  className?: string;
  onWhite?: boolean;
}) {
  const svg = {
    viewBox: "0 0 64 64",
    fill: "none" as const,
    "aria-hidden": true as const,
    className,
  };

  if (name === "smart_display") {
    return onWhite ? (
      <svg {...svg}>
        <rect x="7" y="17" width="50" height="36" rx="10" fill="#0A4FA0" />
        <rect x="7" y="12" width="50" height="36" rx="10" fill="#0071E3" />
        <path
          d="M27 22 L41 30 L27 38 Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg {...svg}>
        <rect x="7" y="17" width="50" height="36" rx="10" fill="#B9D2EE" />
        <rect x="7" y="12" width="50" height="36" rx="10" fill="#FFFFFF" />
        <path
          d="M27 22 L41 30 L27 38 Z"
          fill="#FF9500"
          stroke="#FF9500"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "menu_book") {
    return onWhite ? (
      <svg {...svg}>
        <path d="M5 21 Q5 17 9 17 H55 Q59 17 59 21 V50 Q59 54 55 54 H9 Q5 54 5 50 Z" fill="#232F4B" />
        <path d="M9 14 Q22 9 32 16 V49 Q22 43 9 46 Z" fill="#E3EEFB" />
        <path d="M55 14 Q42 9 32 16 V49 Q42 43 55 46 Z" fill="#C9DFF8" />
        <path
          d="M14 23 Q21 21 27 24 M14 30 Q21 28 27 31 M14 37 Q19 36 23 37"
          stroke="#0071E3"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M37 31 Q43 28 50 30 M37 38 Q43 35 50 37"
          stroke="#0071E3"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M40 10 H48 V27 L44 23.5 L40 27 Z" fill="#FF9500" />
      </svg>
    ) : (
      <svg {...svg}>
        <path d="M5 21 Q5 17 9 17 H55 Q59 17 59 21 V50 Q59 54 55 54 H9 Q5 54 5 50 Z" fill="#232F4B" />
        <path d="M9 14 Q22 9 32 16 V49 Q22 43 9 46 Z" fill="#FFFFFF" />
        <path d="M55 14 Q42 9 32 16 V49 Q42 43 55 46 Z" fill="#E3EEFB" />
        <path
          d="M14 23 Q21 21 27 24 M14 30 Q21 28 27 31 M14 37 Q19 36 23 37"
          stroke="#6DB2F7"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M37 31 Q43 28 50 30 M37 38 Q43 35 50 37"
          stroke="#6DB2F7"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M40 10 H48 V27 L44 23.5 L40 27 Z" fill="#FFC83D" />
      </svg>
    );
  }

  if (name === "fitness_center") {
    return onWhite ? (
      <svg {...svg}>
        <g transform="rotate(-35 32 32)">
          <rect x="16" y="28.5" width="32" height="7" rx="3.5" fill="#232F4B" />
          <rect x="2" y="23" width="9" height="18" rx="4.5" fill="#0A4FA0" />
          <rect x="53" y="23" width="9" height="18" rx="4.5" fill="#0A4FA0" />
          <rect x="9" y="16" width="11" height="32" rx="5.5" fill="#0071E3" />
          <rect x="44" y="16" width="11" height="32" rx="5.5" fill="#0071E3" />
          <path
            d="M14.5 22 V30 M49.5 22 V30"
            stroke="#6DB2F7"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </svg>
    ) : (
      <svg {...svg}>
        <g transform="rotate(-35 32 32)">
          <rect x="16" y="28.5" width="32" height="7" rx="3.5" fill="#FFFFFF" />
          <rect x="2" y="23" width="9" height="18" rx="4.5" fill="#FF9500" />
          <rect x="53" y="23" width="9" height="18" rx="4.5" fill="#FF9500" />
          <rect x="9" y="16" width="11" height="32" rx="5.5" fill="#FFC83D" />
          <rect x="44" y="16" width="11" height="32" rx="5.5" fill="#FFC83D" />
          <path
            d="M14.5 22 V30 M49.5 22 V30"
            stroke="#FFE7A3"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg {...svg}>
      <rect x="11" y="7" width="43" height="51" rx="8" fill="#0A4FA0" />
      <rect x="17" y="46" width="34" height="8" rx="3" fill="#E3EEFB" />
      <rect x="11" y="7" width="43" height="42" rx="8" fill="#0071E3" />
      <path d="M19 7 H21 V49 H19 Q11 49 11 41 V15 Q11 7 19 7 Z" fill="#0A4FA0" />
      <path
        d="M29 38 L37.5 17 L46 38 M32.5 31 H42.5"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M40 46 H48 V61 L44 57.5 L40 61 Z" fill="#FF9500" />
    </svg>
  );
}

function PathCircle({
  icon,
  percent,
  partCount,
  partsDone,
  complete,
  locked,
  struggling,
}: {
  icon: string;
  percent: number;
  partCount: number;
  partsDone: number;
  complete: boolean;
  locked: boolean;
  struggling: boolean;
}) {
  const ring = struggling ? "#ff9500" : "var(--path-node)";
  const glyph = (
    <LessonPathIcon name={icon} onWhite={!complete} className="relative h-10 w-10" />
  );

  if (locked) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/70 bg-[#e2e8f0] text-[#94a3b8] shadow-[0_6px_0_0_#cbd5e1]">
        <span className="opacity-45 grayscale">{glyph}</span>
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

  if (complete) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/40 bg-[var(--path-node)] text-white shadow-[0_7px_0_0_var(--path-node-lip)]">
        {glyph}
      </span>
    );
  }

  return (
    <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-white shadow-[0_6px_0_0_#bec8d2]">
      <ProgressRing
        percent={percent}
        parts={partCount}
        partsDone={partsDone}
        track="#e2e8f0"
        stroke={ring}
      />
      {glyph}
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
        partCount={node.partCount}
        partsDone={node.partsDone}
        complete={node.complete}
        locked={locked}
        struggling={node.struggling}
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

const SHEET_EASE = [0.32, 0.72, 0, 1] as const;
const SHEET_SLIDE = { duration: 0.45, ease: SHEET_EASE };

function LessonDictionaryModal({
  title,
  clips,
  error,
  slide,
  onClose,
}: {
  title: string;
  clips: SessionClip[] | null;
  error: boolean;
  /** Phone: the sheet travels in from the right. Wider screens appear in place. */
  slide: boolean;
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

  const dash = title.indexOf(" - ");
  const kicker = dash > 0 ? `${title.slice(0, dash)}, ${title.slice(dash + 3)}` : title;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#131b2e]/40 sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
      initial={slide ? { x: "100%" } : false}
      animate={{ x: 0 }}
      exit={slide ? { x: "100%" } : { transition: { duration: 0 } }}
      transition={slide ? SHEET_SLIDE : { duration: 0 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-dictionary-title"
        className="flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-[#fffdf7] shadow-2xl sm:h-[min(92dvh,860px)] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="sticky top-0 z-10 bg-gradient-to-b from-[#fffdf7] from-70% to-transparent px-2 pt-safe">
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-12 w-12 items-center justify-center rounded-full text-[#4b4b4b] transition-colors hover:bg-black/[0.04] active:scale-95"
            >
              <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <div className="flex flex-col items-center px-6 pb-5">
            <ReadingPingu />
            <p className="mt-3 text-center text-[13px] font-extrabold tracking-[0.08em] text-[#4b4b4b] uppercase">
              {kicker}
            </p>
            <h2
              id="lesson-dictionary-title"
              className="mt-1 text-center text-[22px] font-extrabold tracking-tight text-[#3c3c3c]"
            >
              Từ vựng
            </h2>
          </div>
          <div className="mx-5 border-t-2 border-[#e5e5e5]" />
          <div className="px-5 pt-4">
            <p className="mb-3 text-[15px] font-extrabold tracking-[0.04em] text-[#1cb0f6] uppercase">
              Câu và từ
            </p>
            {error ? (
              <p className="px-2 py-8 text-center text-[15px] font-bold text-[#afafaf]">
                Không tải được từ vựng. Thử lại sau.
              </p>
            ) : clips == null ? (
              <div className="flex flex-col items-start gap-3" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-2xl border-2 border-[#e5e5e5] bg-white shadow-[0_2px_0_0_#e5e5e5]"
                    style={{ width: `${68 - index * 6}%` }}
                  />
                ))}
              </div>
            ) : clips.length === 0 ? (
              <p className="px-2 py-8 text-center text-[15px] font-bold text-[#afafaf]">
                Chưa có từ vựng cho Lektion này.
              </p>
            ) : (
              <StudyClipList clips={clips} variant="tips" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
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
  liveRound = null,
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
  /** Open round found while rendering this page. The banner does not ask again until the tab returns. */
  liveRound?: LiveRound | null;
}) {
  const theme = PATH_THEMES[path.theme ?? "level"];
  const containerRef = useRef<HTMLElement>(null);
  const dictionaryRequest = useRef(0);
  const [dictionary, setDictionary] = useState<OpenDictionary | null>(null);
  const [lockedBubbleId, setLockedBubbleId] = useState<string | null>(null);
  const [returnSlug, setReturnSlug] = useState<string | null>(null);
  const [focusReady, setFocusReady] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const [mobileSheet, setMobileSheet] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setMobileSheet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const sheetSlides = Boolean(dictionary) && mobileSheet && !shouldReduceMotion;
  const {
    progress,
    progressReady,
    completedLearnClipIdsFor,
    completedLearnRunClipIdsFor,
    learnRunClipOrderFor,
    learnRunCountFor,
    learnStudyRunCountFor,
    learnChapterCompleted,
    learnStudyCompleted,
    learnPracticePartKeysFor,
    reviewedLearnClipIdsFor,
    streakDays,
    settleStudyReviews,
  } = useProgress();
  /** Practice parts per node for every trail Lektion of this level, by lesson id. */
  const pathNodeLayouts = useMemo(
    () =>
      new Map(
        cefrCatalog
          .find((entry) => entry.id === level.slug)
          ?.lessons.filter((lesson) => lesson.pathNodes)
          .map((lesson) => [lesson.id, lesson.practiceNodeParts] as const) ?? [],
      ),
    [cefrCatalog, level.slug],
  );
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
  const didScrollToFocus = useRef(false);

  useEffect(() => {
    if (!progressReady || !focusReady || didScrollToFocus.current) return;
    let cancelled = false;

    const scrollToFocus = () => {
      if (cancelled || didScrollToFocus.current) return;
      const guide = document.getElementById("path-continue");
      const lesson = focusSlug ? document.getElementById(`lesson-${focusSlug}`) : null;
      const target = guide ?? lesson;
      if (!target) return;
      didScrollToFocus.current = true;
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

    const frame = window.requestAnimationFrame(scrollToFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [progressReady, focusReady, focusSlug, shouldReduceMotion]);

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
    <motion.div
      className={`flex min-h-dvh w-full flex-1 flex-col ${dictionary ? "pointer-events-none" : ""}`}
      initial={false}
      animate={{ x: sheetSlides ? "-30%" : "0%" }}
      transition={sheetSlides || mobileSheet ? SHEET_SLIDE : { duration: 0 }}
    >
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
        {path.showBlitzrunde === false ? null : <BlitzrundeBanner initial={liveRound} />}
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
            // One wave runs through every Lektion, so each trail picks up where the last left off.
            let pathStep = 0;
            const poses = pathPoses(level.slug, chapters.length);
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
            const studyStart = studyPart
              ? startOffer(
                  "Học từ vựng",
                  studyPart,
                  xpForFinishedPasses(studyPasses, STUDY_FIRST_PART_XP, STUDY_RERUN_PART_XP).xp,
                  studyPart.freshReplay ? `${lessonHref}/study?replay=1` : `${lessonHref}/study`,
                )
              : null;
            const practiceStart = listeningPart
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
              : null;
            const reviewedIds = reviewedLearnClipIdsFor(progressKeyOf(chapter));
            const completedIds = completedLearnClipIdsFor(progressKeyOf(chapter));
            const lessonId = `${level.slug}-${chapter.slug}`;
            const pathNodes = pathNodeLayouts.has(lessonId)
              ? lessonPathNodes(practiceClips, {
                  reviewedClipIds: reviewedIds,
                  completedClipIds: completedIds,
                  studyFinished: learnStudyCompleted(progressKeyOf(chapter)),
                  practiceFinished: isCompleted || listeningPasses > 0,
                  practiceParts: pathNodeLayouts.get(lessonId),
                  practicePartKeys: learnPracticePartKeysFor(progressKeyOf(chapter)),
                })
              : null;
            const nodes = lessonTrailNodes(
              lessonDetail,
              lessonHref,
              (videoId) =>
                `${lessonHref}/video?video=${encodeURIComponent(videoId)}`,
              (activityId) => {
                const trailNode = lessonNodeFromActivityId(activityId);
                if (!trailNode) return null;
                if (!pathNodes) return trailNode.kind === "study" ? studyStart : practiceStart;
                const node = pathNodes.find(
                  (entry) => entry.kind === trailNode.kind && entry.node === trailNode.node,
                );
                if (!node) return null;
                return nodeStartOffer(
                  node,
                  node.kind === "study" ? reviewedIds : completedIds,
                  lessonHref,
                );
              },
            );
            const pathStart = pathStep;
            pathStep += nodes.length;
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

            const lessonBubbleOpen = lockedBubbleId?.startsWith(`${chapter.slug}:`) ?? false;
            const pose = poses[index] ?? "tea";
            const bay = nodes.length > 0 ? pathWhiteSpace(nodes.length, pathStart) : null;
            const dictionaryOpen = isOpen && nodes.some((node) => node.icon === "menu_book");
            const mascot =
              bay == null
                ? null
                : {
                    index: bay.index,
                    side:
                      dictionaryOpen && bay.index === 0 && bay.side === "right" ? "left" : bay.side,
                  };

            return (
              <motion.li
                key={chapter.id}
                id={`lesson-${chapter.slug}`}
                variants={itemVariants}
                className={`flex scroll-mt-[calc(5rem+env(safe-area-inset-top,0px))] flex-col items-center ${
                  lessonBubbleOpen ? "relative z-40" : ""
                }`}
              >
                <div className={headerClassName}>{header}</div>
                {nodes.length > 0 ? (
                  <ul className="relative isolate flex w-full flex-col items-center gap-3 py-3">
                    {dictionaryOpen ? (
                      <li className="absolute top-3 right-0 z-10">
                        <button
                          type="button"
                          aria-label="Từ vựng"
                          onClick={() => openDictionary(chapter)}
                          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#E5E5EA] bg-white shadow-[0_5px_0_0_#C5CEDB] transition-transform active:translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--path-accent)]"
                        >
                          <LessonPathIcon name="dictionary" className="h-[30px] w-[30px]" />
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
                      const showMascot = mascot != null && nodeIndex === mascot.index;
                      return (
                        <li
                          key={node.key}
                          id={guideLabel ? "path-continue" : undefined}
                          className={`${
                            lockedBubbleId === bubbleId ? "relative z-30" : "relative"
                          } ${guideLabel ? "pt-14" : ""}`}
                          style={{ transform: `translateX(${pathShiftPx(pathStart + nodeIndex)}px)` }}
                        >
                          {showMascot && mascot ? (
                            <div
                              className="pointer-events-none absolute left-1/2 z-[-1]"
                              style={{
                                top: guideLabel ? "calc(3.5rem - 2px)" : "-2px",
                                transform: `translateX(calc(-50% + ${
                                  (mascot.side === "left" ? -PATH_MASCOT_PX : PATH_MASCOT_PX) -
                                  pathShiftPx(pathStart + nodeIndex)
                                }px))`,
                              }}
                              aria-hidden="true"
                            >
                              <ChillPingu pose={pose} locked={!isOpen} />
                            </div>
                          ) : null}
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
    <BottomNav />
    </motion.div>
    <AnimatePresence>
      {dictionary ? (
        <LessonDictionaryModal
          key="lesson-dictionary"
          title={dictionary.label}
          clips={dictionary.clips}
          error={dictionary.error}
          slide={mobileSheet && !shouldReduceMotion}
          onClose={closeDictionary}
        />
      ) : null}
    </AnimatePresence>
    </div>
  );
}
