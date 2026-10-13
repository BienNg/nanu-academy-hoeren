"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useRef } from "react";
import type { GrammarWorldData } from "@/lib/grammar-world-content";
import { PortalMountain, WORLD_ACCENT, WORLD_ACCENT_DEEP } from "./WorldArt";
import { useGrammarWorld } from "./useGrammarWorld";

const PORTAL_PX = 60;
const RING_R = 27;
const RING_C = 2 * Math.PI * RING_R;

/** The world's URL, with the path to come back to. */
export function worldHref(from: string, tab?: string): string {
  const query = new URLSearchParams({ from });
  if (tab) query.set("tab", tab);
  return `/grammar?${query.toString()}`;
}

export type PortalAnchor = {
  /** Element id of the Lektion section this stage belongs to. */
  domId: string;
  /** Set while that stage's first part is still unfinished. */
  introTopicId: string | null;
};

/**
 * The floating purple button for the grammar world. It stays fixed at the
 * bottom right, above the tab bar. On a path with several opening Lektionen
 * the address it opens changes as the next Lektion reaches the button.
 * A badge counts open stages not practised yet; otherwise a thin ring shows
 * the stars collected.
 */
export function GrammarPortal({
  data,
  from,
  anchors = [],
}: {
  data: GrammarWorldData;
  from: string;
  /** Opening Lektionen on this path, in path order. Empty on other level paths. */
  anchors?: PortalAnchor[];
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() === true;
  const world = useGrammarWorld(data);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const introTopicId = useScrolledIntro(anchors);
  const [zooming, setZooming] = useState(false);
  const [zoomFrom, setZoomFrom] = useState<{ right: number; bottom: number } | null>(null);

  if (!world.anyOpen) return null;

  const badge = world.unpractised.length;
  const ratio = world.starsTotal === 0 ? 0 : world.stars / world.starsTotal;
  // Only before any grammar-world part is finished, and only for a stage that still needs its first part.
  const showHint = anchors.length > 0 && introTopicId != null && world.progressReady && world.stars === 0;
  const href = introTopicId
    ? `/grammar?intro=${encodeURIComponent(introTopicId)}&from=${encodeURIComponent(from)}`
    : worldHref(from);
  const enter = () => {
    if (reduceMotion) {
      router.push(href);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    setZoomFrom(
      rect
        ? {
            right: window.innerWidth - (rect.left + rect.width / 2),
            bottom: window.innerHeight - (rect.top + rect.height / 2),
          }
        : null,
    );
    setZooming(true);
    window.setTimeout(() => router.push(href), 380);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 z-40 mx-auto flex w-full max-w-md justify-end px-4 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6">
      <div className="pointer-events-auto relative">
      {showHint ? (
        <motion.div
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center"
          aria-hidden="true"
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -4, 0] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { opacity: { duration: 0.2 }, y: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }
          }
        >
          <span className="w-[9.5rem] rounded-2xl bg-white px-3 py-2 text-center text-[13px] leading-[18px] font-extrabold text-balance text-[var(--path-guide)] shadow-[0_1px_0_rgba(0,0,0,0.05),0_8px_14px_rgba(28,27,31,0.14)]">
            Luyện ngữ pháp của nút này
          </span>
          <svg viewBox="0 0 16 9" className="-mt-px h-[9px] w-4" aria-hidden="true">
            <path d="M0 0 H16 L8 9 Z" fill="#ffffff" />
          </svg>
        </motion.div>
      ) : null}
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={enter}
        aria-label={
          showHint
            ? "Thế giới ngữ pháp. Luyện ngữ pháp của nút này"
            : badge > 0
              ? `Thế giới ngữ pháp, ${badge} chặng mới chưa luyện`
              : "Thế giới ngữ pháp"
        }
        className="relative z-40 flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7c3aed]"
        style={{ width: PORTAL_PX, height: PORTAL_PX }}
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        transition={{ type: "spring", stiffness: 420, damping: 20 }}
      >
        <motion.span
          className="absolute inset-0"
          initial={false}
          animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.05, 1] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "tween", duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 30%, #a78bfa, ${WORLD_ACCENT} 60%, ${WORLD_ACCENT_DEEP})`,
              boxShadow: `0 4px 0 0 ${WORLD_ACCENT_DEEP}, 0 10px 24px -6px rgba(91,33,182,0.55)`,
            }}
          />
          {badge === 0 ? (
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
              <circle cx="30" cy="30" r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
              <circle
                cx="30"
                cy="30"
                r={RING_R}
                fill="none"
                stroke="#FFC83D"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - ratio)}
              />
            </svg>
          ) : null}
          <span className="absolute inset-0 flex items-center justify-center">
            <PortalMountain className="h-8 w-8" />
          </span>
        </motion.span>
        {badge > 0 ? (
          <motion.span
            className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#e11d48] px-1 text-[12px] font-extrabold text-white"
            initial={reduceMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 14 }}
          >
            {badge}
          </motion.span>
        ) : null}
      </motion.button>
      </div>
      </div>

      {/* The zoom into the world: the button's purple grows over the screen. */}
      <AnimatePresence>
        {zooming ? (
          <motion.div
            key="zoom"
            className="pointer-events-none fixed z-[90] rounded-full"
            style={{
              right: zoomFrom?.right ?? 16 + PORTAL_PX / 2,
              bottom: zoomFrom?.bottom ?? `calc(5rem + env(safe-area-inset-bottom, 0px) + ${PORTAL_PX / 2}px)`,
              width: 2,
              height: 2,
              background: WORLD_ACCENT,
            }}
            initial={{ scale: 1 }}
            animate={{ scale: 1600 }}
            transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** The intro for whichever opening Lektion has reached the fixed button. */
function useScrolledIntro(anchors: PortalAnchor[]): string | null {
  const [intro, setIntro] = useState<string | null>(anchors[0]?.introTopicId ?? null);

  useLayoutEffect(() => {
    if (anchors.length === 0) return;
    let frame = 0;
    const pick = () => {
      const line = window.innerHeight - 80 - PORTAL_PX / 2;
      let current = anchors[0];
      for (const anchor of anchors) {
        const top = document.getElementById(anchor.domId)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = anchor;
      }
      setIntro((prev) => (prev === current.introTopicId ? prev : current.introTopicId));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        pick();
      });
    };
    pick();
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [anchors]);

  return anchors.length === 0 ? null : intro;
}
