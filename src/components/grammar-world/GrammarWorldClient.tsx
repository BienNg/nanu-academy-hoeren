"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CheeringPingu, ChillPingu } from "@/components/session/Pingu";
import {
  landingArea,
  worldPartSize,
  WORLD_REVIEW_CARDS,
  type WorldAreaView,
  type WorldGate,
  type WorldStageView,
} from "@/lib/grammar-world";
import type { GrammarWorldData } from "@/lib/grammar-world-content";
import { useProgress } from "@/lib/useProgress";
import {
  GrammarPieceIcon,
  GrammarReviewIcon,
  LockGlyph,
  MountainBackdrop,
  StarGlyph,
  Summit,
  WORLD_ACCENT,
  WORLD_ACCENT_DEEP,
  WORLD_TRACK,
  WORLD_VARS,
} from "./WorldArt";
import { stagePlayHref, useGrammarWorld } from "./useGrammarWorld";

const PATH_AMPLITUDE_PX = 64;
const PATH_PERIOD = 8;

/** Sideways offset of a stop, counted from the foot of the mountain. */
function shiftPx(index: number): number {
  return Math.round(PATH_AMPLITUDE_PX * Math.sin((index * 2 * Math.PI) / PATH_PERIOD));
}

/** One round stop on the mountain: a practice node or a stage's review. */
type Stop = {
  id: string;
  kind: "node" | "review";
  stage: WorldStageView & { open: boolean };
  stageNumber: number;
  /** 1-based node number. 0 for the review. */
  node: number;
  partCount: number;
  partsDone: number;
  done: boolean;
  locked: boolean;
  /** Global index from the foot, for the zigzag. */
  index: number;
  start: StartOffer | null;
};

type StartOffer = { title: string; detail: string; href: string; label: string };

function partHref(topicId: string, node: number, part: number): string {
  return `/grammar/practice?topic=${encodeURIComponent(topicId)}&node=${node}&part=${part}`;
}

function reviewHref(topicId: string): string {
  return `/grammar/practice?topic=${encodeURIComponent(topicId)}&review=1`;
}

/** Stops of the open stages, from the foot up. */
function buildStops(view: WorldAreaView): Stop[] {
  const stops: Stop[] = [];
  view.stages.forEach((stage, stageIndex) => {
    if (!stage.open) return;
    const topic = stage.topic;
    stage.nodes.forEach((node, nodeIndex) => {
      const previousDone = nodeIndex === 0 || stage.nodes[nodeIndex - 1]!.done;
      const locked = !node.done && !previousDone;
      const nextPart = node.partDone.findIndex((done) => !done) + 1;
      const playPart = node.done || nextPart === 0 ? 1 : nextPart;
      stops.push({
        id: `${topic.id}-n${node.node}`,
        kind: "node",
        stage,
        stageNumber: stageIndex + 1,
        node: node.node,
        partCount: node.parts.length,
        partsDone: node.partsDone,
        done: node.done,
        locked,
        index: stops.length,
        start: locked
          ? null
          : {
              title: node.done ? `Nút ${node.node} · Luyện lại` : `Nút ${node.node} · Phần ${playPart}/${node.parts.length}`,
              detail: `${topic.titleVi} · ${node.parts[playPart - 1]?.cards.length ?? worldPartSize(node.node)} thẻ`,
              href: partHref(topic.id, node.node, playPart),
              label: node.done ? "LUYỆN LẠI" : "BẮT ĐẦU",
            },
      });
    });
    const review = stage.review;
    stops.push({
      id: `${topic.id}-review`,
      kind: "review",
      stage,
      stageNumber: stageIndex + 1,
      node: 0,
      partCount: 1,
      partsDone: review.done ? 1 : 0,
      done: review.done,
      locked: !review.unlocked,
      index: stops.length,
      start: review.unlocked
        ? {
            title: review.done ? "Ôn tập chặng · Chơi lại" : "Ôn tập chặng",
            detail: `${WORLD_REVIEW_CARDS} thẻ trộn từ cả chặng ${topic.titleVi}`,
            href: reviewHref(topic.id),
            label: review.done ? "ÔN LẠI" : "BẮT ĐẦU",
          }
        : null,
    });
  });
  return stops;
}

/** The learner stands at the lowest unfinished open stop. */
function currentStopId(stops: readonly Stop[]): string | null {
  return stops.find((stop) => !stop.done && !stop.locked)?.id ?? null;
}

function gateLine(gate: WorldGate | undefined): string {
  if (!gate) return "Chưa mở";
  if (!gate.access) return `Cần quyền vào khóa học ${gate.lessonLabel.split(" · ")[0]}`;
  return gate.studyKeys.length > 0
    ? `Mở khi học xong Học ngữ pháp của ${gate.lessonLabel}`
    : `Mở khi bạn đến ${gate.lessonLabel}`;
}

// ---------------------------------------------------------------- stop

const RING_R = 44;
const RING_BOX = 100;

function StopRing({ parts, done, current }: { parts: number; done: number; current: boolean }) {
  const circumference = 2 * Math.PI * RING_R;
  const count = Math.max(1, parts);
  const slot = circumference / count;
  const gap = count > 1 ? Math.min(10, slot * 0.18) + 2 : 0;
  const segment = slot - gap;
  return (
    <svg
      className="pointer-events-none absolute -rotate-90"
      style={{ width: RING_BOX, height: RING_BOX, left: 35 - RING_BOX / 2, top: 38 - RING_BOX / 2 }}
      viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <circle
          key={index}
          cx={RING_BOX / 2}
          cy={RING_BOX / 2}
          r={RING_R}
          fill="none"
          stroke={index < done ? WORLD_ACCENT : current ? "#d9ccfa" : WORLD_TRACK}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${segment} ${circumference - segment}`}
          strokeDashoffset={-index * (segment + gap)}
        />
      ))}
    </svg>
  );
}

function StopFace({ stop, current }: { stop: Stop; current: boolean }) {
  const Icon = stop.kind === "review" ? GrammarReviewIcon : GrammarPieceIcon;
  if (stop.locked) {
    return (
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/70 bg-[#e5e1ee] shadow-[0_6px_0_0_#cfc8de]">
        <span className="opacity-40 grayscale">
          <Icon onWhite className="h-10 w-10" />
        </span>
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[#e5e1ee] bg-white text-[#9b93ad] shadow-[0_2px_0_0_#cfc8de]">
          <LockGlyph className="h-3.5 w-3.5" />
        </span>
      </span>
    );
  }
  if (stop.done) {
    return (
      <span
        className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/40 text-white"
        style={{ background: "var(--path-node)", boxShadow: "0 7px 0 0 var(--path-node-lip)" }}
      >
        <Icon onWhite={false} className="h-10 w-10" />
      </span>
    );
  }
  return (
    <span className="relative flex h-[70px] w-[70px] items-center justify-center">
      {current ? (
        <motion.span
          className="pointer-events-none absolute inset-0"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <StopRing parts={stop.partCount} done={stop.partsDone} current />
        </motion.span>
      ) : (
        <StopRing parts={stop.partCount} done={stop.partsDone} current={false} />
      )}
      <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-white shadow-[0_6px_0_0_#cdbff0]">
        <Icon onWhite className="h-10 w-10" />
      </span>
    </span>
  );
}

function StartBubble({ offer, reduceMotion }: { offer: StartOffer; reduceMotion: boolean }) {
  return (
    <motion.div
      role="dialog"
      aria-label={offer.title}
      data-stop-card
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92 }}
      transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 18 }}
      className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2"
      style={{
        transformOrigin: "50% 100%",
        filter: "drop-shadow(0 3px 0 rgba(91,33,182,0.35)) drop-shadow(0 10px 18px rgba(91,33,182,0.25))",
      }}
    >
      <svg viewBox="0 0 24 12" className="absolute -bottom-[11px] left-1/2 h-3 w-6 -translate-x-1/2" aria-hidden="true">
        <path d="M1.2 0 L12 10.8 L22.8 0 Z" fill={WORLD_ACCENT} />
      </svg>
      <div className="rounded-2xl px-4 pt-3.5 pb-3.5 text-white" style={{ background: WORLD_ACCENT }}>
        <p className="text-[17px] font-extrabold leading-6">{offer.title}</p>
        <p className="mt-1 text-[15px] font-bold leading-5 text-white/80">{offer.detail}</p>
        <Link
          href={offer.href}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-white text-[15px] font-extrabold tracking-[0.08em] shadow-[0_4px_0_0_#ddd0fb] active:translate-y-0.5"
          style={{ color: WORLD_ACCENT_DEEP }}
        >
          {offer.label}
        </Link>
      </div>
    </motion.div>
  );
}

function LockedBubble({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  return (
    <motion.div
      role="status"
      data-stop-card
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[min(15rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border-2 border-[#e5e1ee] bg-white px-4 py-3 text-center text-[14px] font-bold leading-5 text-[#6b6480] shadow-[0_4px_0_0_#e5e1ee]"
    >
      {text}
    </motion.div>
  );
}

function WorldStopView({
  stop,
  current,
  open,
  lit,
  onToggle,
  onDismiss,
  reduceMotion,
}: {
  stop: Stop;
  current: boolean;
  open: boolean;
  lit: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  reduceMotion: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss]);

  // The card opens above the stop; keep it clear of the header and tabs.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const card = rootRef.current?.querySelector<HTMLElement>("[data-stop-card]");
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const top = card?.getBoundingClientRect().top;
      if (top !== undefined && top < header + 12) {
        window.scrollBy({ top: top - header - 12, behavior: reduceMotion ? "auto" : "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, reduceMotion]);

  const label = stop.kind === "review" ? "Ôn tập" : `Nút ${stop.node}`;
  const lockText =
    stop.kind === "review" ? "Hoàn thành mọi nút của chặng để mở ôn tập" : "Hoàn thành nút bên dưới để mở nút này";

  return (
    <div ref={rootRef} className="relative flex flex-col items-center" data-stop={stop.id}>
      {lit && !reduceMotion ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 h-[70px] w-[70px] -translate-x-1/2 rounded-full"
          style={{ boxShadow: "0 0 0 0 rgba(250,204,21,0.9)" }}
          initial={{ scale: 0.6, opacity: 1 }}
          animate={{ scale: 2.2, opacity: 0, boxShadow: "0 0 40px 20px rgba(250,204,21,0.6)" }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.35 }}
        />
      ) : null}
      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${label}${stop.locked ? ", đã khóa" : stop.done ? ", đã xong" : ""}`}
        className="flex flex-col items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7c3aed]"
        whileTap={reduceMotion ? undefined : { y: 4 }}
        initial={lit && !reduceMotion ? { scale: 0.7 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 14, delay: lit ? 0.3 : 0 }}
      >
        <StopFace stop={stop} current={current} />
        <span
          className={`mt-[22px] text-[12px] font-bold leading-4 ${
            stop.locked ? "text-[#8f88a3]" : stop.done ? "text-[#2e1065]" : "text-[#6d28d9]"
          }`}
        >
          {label}
        </span>
      </motion.button>
      <AnimatePresence>
        {open ? (
          stop.start ? (
            <StartBubble key="start" offer={stop.start} reduceMotion={reduceMotion} />
          ) : (
            <LockedBubble key="locked" text={lockText} reduceMotion={reduceMotion} />
          )
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- stage pieces

function StageLabel({ number, stage, gate }: { number: number; stage: WorldStageView; gate: WorldGate | undefined }) {
  return (
    <div className="flex w-full items-center gap-3 px-1 py-5">
      <span className="h-px flex-1 bg-[#d9ccfa]" aria-hidden="true" />
      <div className="max-w-[75%] text-center">
        <p className="text-[11px] font-extrabold tracking-wider text-[#8b5cf6] uppercase">
          Chặng {number}
          {gate ? ` · ${gate.lessonLabel}` : ""}
        </p>
        <h2 className="text-[15px] font-bold leading-5 text-[#4c1d95]">
          {stage.topic.titleVi} · {stage.topic.titleDe}
        </h2>
      </div>
      <span className="h-px flex-1 bg-[#d9ccfa]" aria-hidden="true" />
    </div>
  );
}

/** A locked stage above the open ones: its stops under fog, and the Lektion that opens it. */
function FogStage({ number, stage, gate }: { number: number; stage: WorldStageView; gate: WorldGate | undefined }) {
  const ghosts = stage.nodes.length + 1;
  return (
    <div className="relative w-full py-4">
      <div className="flex flex-col-reverse items-center gap-6 opacity-60" aria-hidden="true">
        {Array.from({ length: Math.min(ghosts, 4) }, (_, index) => (
          <span
            key={index}
            className="block h-[60px] w-[60px] rounded-full bg-[#e5e1ee] shadow-[0_5px_0_0_#cfc8de]"
            style={{ transform: `translateX(${shiftPx(index + number * 3)}px)` }}
          />
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.95), rgba(255,255,255,0.6) 45%, transparent 70%), radial-gradient(ellipse at 75% 60%, rgba(255,255,255,0.95), rgba(255,255,255,0.55) 40%, transparent 72%)",
          backdropFilter: "blur(3px)",
        }}
      />
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-4">
        <div className="w-full max-w-[18rem] rounded-2xl border-2 border-[#e5e1ee] bg-white/90 px-4 py-3 text-center shadow-[0_4px_0_0_#e5e1ee]">
          <p className="flex items-center justify-center gap-1 text-[11px] font-extrabold tracking-wider text-[#8f88a3] uppercase">
            <LockGlyph className="h-3.5 w-3.5" /> Chặng {number}
          </p>
          <p className="mt-0.5 text-[15px] font-bold leading-5 text-[#4b4560]">
            {stage.topic.titleVi} · {stage.topic.titleDe}
          </p>
          <p className="mt-1 text-[13px] font-semibold leading-4 text-[#8f88a3]">{gateLine(gate)}</p>
          {gate?.access ? (
            <Link
              href={gate.lessonHref}
              className="mt-2.5 flex h-10 items-center justify-center rounded-xl text-[14px] font-extrabold text-white shadow-[0_3px_0_0_#5b21b6]"
              style={{ background: WORLD_ACCENT }}
            >
              Đến {gate.lessonLabel.split(" · ")[1] ?? gate.lessonLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A locked tab: a grey, fogged mountain with its future stages. */
function LockedArea({ view, gates }: { view: WorldAreaView; gates: Record<string, WorldGate> }) {
  const firstGate = view.stages[0] ? gates[view.stages[0].topic.id] : undefined;
  return (
    <div className="relative flex w-full flex-col items-center px-4 pt-6 pb-10">
      <div className="grayscale">
        <Summit flag={false} grey />
      </div>
      <div className="mt-4 w-full max-w-sm rounded-3xl border-2 border-[#e5e7eb] bg-white/85 p-5 shadow-[0_4px_0_0_#e5e7eb] backdrop-blur">
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold tracking-wider text-[#9ca3af] uppercase">
          <LockGlyph className="h-4 w-4" /> Núi {view.area.titleVi} còn khóa
        </p>
        {view.stages.length === 0 ? (
          <p className="mt-2 text-[15px] font-semibold leading-5 text-[#6b7280]">
            Các chặng của {view.area.titleVi} ({view.area.titleDe}) sắp ra mắt.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2.5">
            {view.stages.map((stage, index) => (
              <li key={stage.topic.id} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[13px] font-extrabold text-[#9ca3af]">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-5 text-[#4b5563]">
                    {stage.topic.titleVi} · {stage.topic.titleDe}
                  </span>
                  <span className="block text-[13px] font-semibold leading-4 text-[#9ca3af]">
                    {gateLine(gates[stage.topic.id])}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {firstGate?.access ? (
          <Link
            href={firstGate.lessonHref}
            className="mt-4 flex h-12 items-center justify-center rounded-xl text-[15px] font-extrabold tracking-[0.04em] text-white shadow-[0_4px_0_0_#5b21b6]"
            style={{ background: WORLD_ACCENT }}
          >
            Đến {firstGate.lessonLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Pingu plants the flag the first time a tab is climbed. */
function SummitScene({ areaTitle, onDone, reduceMotion }: { areaTitle: string; onDone: () => void; reduceMotion: boolean }) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summit-title"
      className="fixed inset-0 z-[85] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{ background: "linear-gradient(180deg, #2e1065 0%, #6d28d9 60%, #a78bfa 100%)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative h-[230px] w-[260px]">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <Summit flag={false} />
        </div>
        <motion.svg
          viewBox="0 0 40 60"
          className="absolute left-[calc(50%-3px)] h-[60px] w-[40px]"
          initial={reduceMotion ? { top: 54 } : { top: -120, rotate: -20 }}
          animate={{ top: 54, rotate: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 12, delay: 0.5 }}
          aria-hidden="true"
        >
          <rect x="0" y="0" width="4" height="60" rx="2" fill="#1e1b4b" />
          <path d="M4 2 L36 10 L4 19 Z" fill="#FFC83D" />
        </motion.svg>
        <motion.div
          className="absolute -right-4 bottom-0 w-[120px]"
          initial={reduceMotion ? false : { x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.2 }}
        >
          <CheeringPingu />
        </motion.div>
      </div>
      <h2 id="summit-title" className="mt-4 text-[26px] font-extrabold leading-8">
        Lên đỉnh {areaTitle}!
      </h2>
      <p className="mt-2 max-w-[19rem] text-[15px] font-medium leading-5 text-white/80">
        Pingu đã cắm cờ trên đỉnh. Ôn lại thường xuyên để giữ đỉnh nhé.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-8 flex h-13 min-h-[52px] w-full max-w-[20rem] items-center justify-center rounded-2xl bg-white text-[16px] font-extrabold tracking-[0.06em] text-[#5b21b6] shadow-[0_4px_0_0_#c4b5fd] active:translate-y-0.5"
      >
        TIẾP TỤC
      </button>
    </motion.div>
  );
}

/** The ground under the learner: the current stage, or the review invitation once the tab is climbed. */
function GroundBanner({
  view,
  stops,
  currentId,
  gates,
}: {
  view: WorldAreaView;
  stops: readonly Stop[];
  currentId: string | null;
  gates: Record<string, WorldGate>;
}) {
  if (view.done) {
    const stale = [...view.stages].sort((a, b) => a.review.runs - b.review.runs)[0];
    return (
      <div className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-[0_-2px_0_0_rgba(255,255,255,0.4)_inset,0_4px_0_0_#4c1d95]" style={{ background: WORLD_ACCENT }}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold tracking-wider text-white/75 uppercase">Đỉnh {view.area.titleVi}</p>
          <p className="text-[17px] font-extrabold leading-5">Ôn lại để giữ đỉnh</p>
        </div>
        {stale ? (
          <Link
            href={reviewHref(stale.topic.id)}
            className="flex h-10 shrink-0 items-center rounded-xl bg-white px-4 text-[14px] font-extrabold text-[#5b21b6] shadow-[0_3px_0_0_#ddd0fb]"
          >
            ÔN LẠI
          </Link>
        ) : null}
      </div>
    );
  }
  const stop = stops.find((entry) => entry.id === currentId) ?? stops.find((entry) => !entry.done) ?? stops.at(-1);
  if (!stop) return null;
  const stage = stop.stage;
  const gate = gates[stage.topic.id];
  return (
    <div className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-[0_4px_0_0_#4c1d95]" style={{ background: WORLD_ACCENT }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-extrabold tracking-wider text-white/75 uppercase">
          Chặng {stop.stageNumber}
          {gate ? ` · ${gate.lessonLabel}` : ""}
        </p>
        <p className="truncate text-[17px] font-extrabold leading-5">{stage.topic.titleVi}</p>
        <p className="truncate text-[13px] font-bold leading-4 text-white/75">{stage.topic.titleDe}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[13px] font-extrabold">
        <StarGlyph className="h-4 w-4" />
        {stage.stars}/{stage.starsTotal}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- screen

/**
 * The grammar world: a mountain per tab, climbed from the foot. Opens on the
 * tab of the newest stage, scrolled to the next unfinished stop.
 */
export function GrammarWorldClient({
  data,
  initialTab,
  backHref,
  lit,
  intro,
}: {
  data: GrammarWorldData;
  initialTab: string | null;
  backHref: string;
  /** Topic of a part just finished: its tab gets a new star and the next stop lights up. */
  lit: string | null;
  /** Topic of a stage the learner just opened from the path: a short tour, then its first part. */
  intro: string | null;
}) {
  const reduceMotion = useReducedMotion() === true;
  const world = useGrammarWorld(data);
  const { progress, markWorldSummit } = useProgress();
  const introTopic = intro ? (data.areas.flatMap((area) => area.topics).find((topic) => topic.id === intro) ?? null) : null;
  const introArea = introTopic ? data.areas.find((area) => area.topics.some((topic) => topic.id === introTopic.id))?.id : null;
  const [picked, setPicked] = useState<string | null>(initialTab ?? introArea ?? null);
  const [introOpen, setIntroOpen] = useState(introTopic != null);
  const [openStop, setOpenStop] = useState<string | null>(null);
  const [litTopic, setLitTopic] = useState<string | null>(lit);
  const scrolledFor = useRef<string | null>(null);

  const landing = world.progressReady ? landingArea(world.views) : null;
  const areaId =
    picked && world.views.some((view) => view.area.id === picked) ? picked : (landing ?? world.views[0]?.area.id ?? null);
  const view = world.views.find((entry) => entry.area.id === areaId) ?? null;
  const stops = useMemo(() => (view ? buildStops(view) : []), [view]);
  const currentId = currentStopId(stops);
  const summitDue = Boolean(view?.done && !progress.grammarWorld?.summits?.[view.area.id]);
  const flagPlanted = Boolean(view && progress.grammarWorld?.summits?.[view.area.id]);

  // Drop `lit` from the URL so a reload does not replay the star.
  useEffect(() => {
    if (!lit) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("lit");
    window.history.replaceState(window.history.state, "", url.toString());
    const timer = window.setTimeout(() => setLitTopic(null), 2600);
    return () => window.clearTimeout(timer);
  }, [lit]);

  // Open on the next unfinished stop, once per tab.
  useLayoutEffect(() => {
    if (!world.progressReady || !areaId || scrolledFor.current === areaId) return;
    scrolledFor.current = areaId;
    const target = currentId ? document.querySelector(`[data-stop="${currentId}"]`) : null;
    if (target) target.scrollIntoView({ block: "center" });
    else window.scrollTo({ top: view?.done ? 0 : document.body.scrollHeight });
  }, [areaId, currentId, view?.done, world.progressReady]);

  const dismiss = useCallback(() => setOpenStop(null), []);
  const introStage = introTopic
    ? world.views.flatMap((entry) => entry.stages).find((stage) => stage.topic.id === introTopic.id)
    : undefined;
  const introPlayHref =
    introTopic && introStage
      ? `${stagePlayHref(introTopic.id, introStage.current ?? { node: 1, part: 1 })}&from=${encodeURIComponent(backHref)}`
      : null;
  const litArea = litTopic
    ? world.views.find((entry) => entry.area.topics.some((topic) => topic.id === litTopic))?.area.id
    : null;

  // Stages from the foot up; a locked stage sits in fog above the open ones.
  const stageBlocks = view
    ? view.stages.map((stage, index) => ({ stage, number: index + 1 }))
    : [];

  return (
    <div
      data-layout="wide"
      className="flex min-h-dvh w-full flex-col bg-[#f6f1ff]"
      style={WORLD_VARS as CSSProperties}
    >
      {/* Coming in from the portal: the purple fades away. */}
      {!reduceMotion ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[90]"
          style={{ background: WORLD_ACCENT }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-[55vh]" aria-hidden="true">
        <MountainBackdrop grey={Boolean(view && !view.open)} />
      </div>

      <header className="fixed top-0 left-0 z-50 w-full border-b border-[#e9defd] bg-[#f6f1ff]/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-3">
          <Link
            href={backHref}
            aria-label="Về lộ trình"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#6d28d9] active:bg-[#ede5fe]"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true">
              arrow_back
            </span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-extrabold text-[#2e1065]">Núi ngữ pháp</h1>
          <span
            className="flex items-center gap-1 rounded-full border border-[#e9defd] bg-white px-2.5 py-1 text-[13px] font-extrabold text-[#2e1065] shadow-sm"
            aria-label={`${world.stars} sao`}
          >
            <StarGlyph className="h-4 w-4" />
            {world.stars}
          </span>
        </div>
        <nav aria-label="Chủ đề ngữ pháp" className="mx-auto max-w-md">
          <ul className="flex gap-2 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
            {world.views.map((entry) => {
              const selected = entry.area.id === areaId;
              return (
                <li key={entry.area.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setOpenStop(null);
                      setPicked(entry.area.id);
                    }}
                    className={`flex h-10 items-center gap-1.5 rounded-full border-2 px-3 text-[14px] font-bold ${
                      selected
                        ? "border-[#6d28d9] bg-[#7c3aed] text-white shadow-[0_3px_0_0_#5b21b6]"
                        : entry.open
                          ? "border-[#e9defd] bg-white text-[#4c1d95] shadow-[0_3px_0_0_#e9defd]"
                          : "border-[#ececf0] bg-white/70 text-[#9b93ad]"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      {entry.area.icon}
                    </span>
                    {entry.area.titleVi}
                    {!entry.open ? (
                      <LockGlyph className="h-3.5 w-3.5" />
                    ) : entry.done ? (
                      <span
                        className={`material-symbols-outlined text-[18px] ${selected ? "text-white" : "text-[#16a34a]"}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-label="đã xong"
                      >
                        check_circle
                      </span>
                    ) : (
                      <span className="relative flex items-center gap-0.5 text-[12px] font-extrabold">
                        <StarGlyph className="h-3.5 w-3.5" />
                        <motion.span
                          key={`${entry.area.id}-${entry.stars}`}
                          initial={litArea === entry.area.id && !reduceMotion ? { scale: 1.8, color: "#f59e0b" } : false}
                          animate={{ scale: 1, color: "currentColor" }}
                          transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.6 }}
                        >
                          {entry.stars}
                        </motion.span>
                        {litArea === entry.area.id && !reduceMotion ? (
                          <motion.span
                            className="absolute -top-4 right-0 text-[12px] font-extrabold text-[#f59e0b]"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: [0, 1, 0], y: -10 }}
                            transition={{ duration: 1.4, delay: 0.5 }}
                            aria-hidden="true"
                          >
                            +1
                          </motion.span>
                        ) : null}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[calc(7rem+env(safe-area-inset-top,0px))]">
        {!world.progressReady || !view ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-24" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="block h-[70px] w-[70px] animate-pulse rounded-full bg-[#ece4fd]"
                style={{ transform: `translateX(${shiftPx(index)}px)` }}
              />
            ))}
          </div>
        ) : !view.open ? (
          <LockedArea view={view} gates={data.gates} />
        ) : (
          <>
            <div className="flex flex-col items-center pt-4 pb-2">
              <Summit flag={flagPlanted} />
              <p className="mt-1 text-[12px] font-extrabold tracking-wider text-[#8b5cf6] uppercase">
                Đỉnh {view.area.titleVi}
              </p>
            </div>
            <ol className="flex flex-col-reverse items-stretch pb-6">
              {stageBlocks.map(({ stage, number }) =>
                stage.open ? (
                  <li key={stage.topic.id} className="flex flex-col-reverse items-center">
                    <StageLabel number={number} stage={stage} gate={data.gates[stage.topic.id]} />
                    <ol className="flex w-full flex-col-reverse items-center gap-5">
                      {stops
                        .filter((stop) => stop.stage.topic.id === stage.topic.id)
                        .map((stop) => {
                          const current = stop.id === currentId;
                          return (
                            <li
                              key={stop.id}
                              className="relative flex w-full justify-center"
                              style={{ zIndex: openStop === stop.id ? 20 : 1 }}
                            >
                              <div className="relative" style={{ transform: `translateX(${shiftPx(stop.index)}px)` }}>
                                {current ? (
                                  <div
                                    className={`pointer-events-none absolute top-1 w-[78px] ${
                                      shiftPx(stop.index) > 0 ? "-left-[96px]" : "-right-[96px]"
                                    }`}
                                    aria-hidden="true"
                                  >
                                    <ChillPingu pose="cube" />
                                  </div>
                                ) : null}
                                <WorldStopView
                                  stop={stop}
                                  current={current}
                                  open={openStop === stop.id}
                                  lit={current && litTopic === stop.stage.topic.id}
                                  onToggle={() => setOpenStop((value) => (value === stop.id ? null : stop.id))}
                                  onDismiss={dismiss}
                                  reduceMotion={reduceMotion}
                                />
                              </div>
                            </li>
                          );
                        })}
                    </ol>
                  </li>
                ) : (
                  <li key={stage.topic.id}>
                    <FogStage number={number} stage={stage} gate={data.gates[stage.topic.id]} />
                  </li>
                ),
              )}
            </ol>
            <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-30 mt-auto pb-3">
              <GroundBanner view={view} stops={stops} currentId={currentId} gates={data.gates} />
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {summitDue && view ? (
          <SummitScene
            key="summit"
            areaTitle={view.area.titleVi}
            reduceMotion={reduceMotion}
            onDone={() => markWorldSummit(view.area.id)}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {introOpen && introTopic && introPlayHref ? (
          <WorldIntro
            key="intro"
            topic={introTopic}
            reduceMotion={reduceMotion}
            playHref={introPlayHref}
            onSkip={() => setIntroOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const INTRO_STEPS = [
  {
    title: "Chào mừng đến Núi ngữ pháp!",
    text: "Mỗi chủ đề ngữ pháp là một ngọn núi. Bạn leo từng chặng, từ chân núi lên đỉnh.",
  },
  {
    title: "Luyện từng phần nhỏ",
    text: "Mỗi nút có vài phần ngắn. Làm xong một phần là nhận sao. Bạn có 3 trái tim: sai một lần mất một tim.",
  },
] as const;

/** A short tour the first time a stage is opened from the path, ending in its first part. */
function WorldIntro({
  topic,
  reduceMotion,
  playHref,
  onSkip,
}: {
  topic: { titleVi: string; titleDe: string };
  reduceMotion: boolean;
  playHref: string;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const last = step === INTRO_STEPS.length;
  const title = last ? "Sẵn sàng chưa?" : INTRO_STEPS[step]!.title;
  const text = last
    ? `Bắt đầu phần 1 của "${topic.titleVi}". Xong phần này, bạn quay lại lộ trình và nút Núi ngữ pháp sẽ nằm ở góc màn hình.`
    : INTRO_STEPS[step]!.text;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-intro-title"
      className="fixed inset-0 z-[85] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{ background: `linear-gradient(180deg, #4c1d95 0%, ${WORLD_ACCENT} 55%, #a78bfa 100%)` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
    >
      <Summit flag={false} />
      <p className="mt-2 text-[13px] font-extrabold tracking-[0.14em] text-white/70 uppercase">
        {topic.titleVi} · {topic.titleDe}
      </p>
      <h2 id="world-intro-title" className="mt-1 text-[26px] font-extrabold leading-8">
        {title}
      </h2>
      <p className="mt-3 max-w-[20rem] text-[16px] font-medium leading-6 text-white/85">{text}</p>
      <div className="mt-6 flex gap-2" aria-hidden="true">
        {[...INTRO_STEPS, null].map((_, index) => (
          <span key={index} className={`h-2 w-2 rounded-full ${index === step ? "bg-white" : "bg-white/35"}`} />
        ))}
      </div>
      <div className="mt-8 flex w-full max-w-[20rem] flex-col gap-3">
        {last ? (
          <Link
            href={playHref}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-white text-[16px] font-extrabold tracking-[0.06em] text-[#5b21b6] shadow-[0_4px_0_0_#c4b5fd] active:translate-y-0.5"
          >
            BẮT ĐẦU PHẦN 1
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-white text-[16px] font-extrabold tracking-[0.06em] text-[#5b21b6] shadow-[0_4px_0_0_#c4b5fd] active:translate-y-0.5"
          >
            TIẾP TỤC
          </button>
        )}
        {last ? null : (
          <button
            type="button"
            onClick={onSkip}
            className="flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-white/40 text-[15px] font-bold text-white active:bg-white/10"
          >
            Bỏ qua
          </button>
        )}
      </div>
    </motion.div>
  );
}
