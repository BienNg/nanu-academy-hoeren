"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

/**
 * The floating purple button on a level path, bottom right above the tab bar.
 * It appears once the learner has finished a part on the mountain; before
 * that, a new stage is a node on the path. A badge counts open stages not
 * practised yet; otherwise a thin ring shows the stars collected.
 */
export function GrammarPortal({ data, from }: { data: GrammarWorldData; from: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() === true;
  const world = useGrammarWorld(data);
  const [zooming, setZooming] = useState(false);

  // Until a first part is done, the stage is a node on the path instead.
  const started = world.views.some((view) => view.stages.some((stage) => stage.open && stage.practised));
  if (!started) return null;

  const badge = world.unpractised.length;
  const ratio = world.starsTotal === 0 ? 0 : world.stars / world.starsTotal;
  const enter = () => {
    if (reduceMotion) {
      router.push(worldHref(from));
      return;
    }
    setZooming(true);
    window.setTimeout(() => router.push(worldHref(from)), 380);
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={enter}
        aria-label={badge > 0 ? `Thế giới ngữ pháp, ${badge} chặng mới chưa luyện` : "Thế giới ngữ pháp"}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-40 flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7c3aed]"
        style={{ width: PORTAL_PX, height: PORTAL_PX }}
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        transition={{ type: "spring", stiffness: 420, damping: 20 }}
      >
        <motion.span
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
        <PortalMountain className="relative h-8 w-8" />
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

      {/* The zoom into the world: the button's purple grows over the screen. */}
      <AnimatePresence>
        {zooming ? (
          <motion.div
            key="zoom"
            className="pointer-events-none fixed z-[90] rounded-full"
            style={{
              right: 16 + PORTAL_PX / 2,
              bottom: `calc(5rem + env(safe-area-inset-bottom, 0px) + ${PORTAL_PX / 2}px)`,
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
