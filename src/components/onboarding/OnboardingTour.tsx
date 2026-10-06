"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ChunkyButton } from "@/components/chunkyButton";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

/** Space between the target and the dimmed edge. */
const SPOT_PAD = 8;
/** Gap between the spotlight and the bubble. */
const BUBBLE_GAP = 14;
const GUTTER = 16;
const BUBBLE_MAX_WIDTH = 340;

type Box = { top: number; left: number; width: number; height: number };

/**
 * A map node's `data-tour` sits on its list row, which also holds the
 * "Bắt đầu" bubble and the mascot. The node itself is the row's last child.
 */
function anchorOf(element: Element): Element {
  return element.tagName === "LI" ? (element.lastElementChild ?? element) : element;
}

function findTarget(target: string): Element | null {
  const element = document.querySelector(`[data-tour="${target}"]`);
  return element ? anchorOf(element) : null;
}

function sameBox(a: Box | null, b: Box): boolean {
  return (
    a !== null &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * First-run tour of the level map. Each step dims the page and lights up one
 * real element. There is no close button: the learner steps through to the
 * end, and `onFinish` runs on the last "Bắt đầu học".
 */
export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [stepIndex, setStepIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const step = ONBOARDING_STEPS[stepIndex]!;
  const last = stepIndex === ONBOARDING_STEPS.length - 1;

  // The page stays still under the tour; only the tour scrolls it.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  // Bring the target into view, then follow it every frame while the scroll
  // settles, the path animates in, or the window is resized.
  useEffect(() => {
    const element = findTarget(step.target);
    if (element && step.target !== "course") {
      element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
    let frame = 0;
    const track = () => {
      const current = findTarget(step.target);
      if (current) {
        const rect = current.getBoundingClientRect();
        const next = {
          top: rect.top - SPOT_PAD,
          left: rect.left - SPOT_PAD,
          width: rect.width + SPOT_PAD * 2,
          height: rect.height + SPOT_PAD * 2,
        };
        setSpot((previous) => (sameBox(previous, next) ? previous : next));
      }
      setViewport((previous) =>
        previous.width === window.innerWidth && previous.height === window.innerHeight
          ? previous
          : { width: window.innerWidth, height: window.innerHeight },
      );
      frame = window.requestAnimationFrame(track);
    };
    frame = window.requestAnimationFrame(track);
    return () => window.cancelAnimationFrame(frame);
  }, [step.target, reduceMotion]);

  const bubbleWidth = Math.min(BUBBLE_MAX_WIDTH, Math.max(0, viewport.width - GUTTER * 2));

  // The bubble is placed above or below the target by its height, which
  // changes with the step text and the width.
  useLayoutEffect(() => {
    const height = bubbleRef.current?.offsetHeight ?? 0;
    setBubbleHeight((previous) => (previous === height ? previous : height));
  }, [stepIndex, bubbleWidth]);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [stepIndex]);

  const next = () => {
    if (last) onFinish();
    else setStepIndex((index) => index + 1);
  };

  let bubble: { top: number; left: number; arrowLeft: number; below: boolean } | null = null;
  if (spot && viewport.width > 0) {
    const centerX = spot.left + spot.width / 2;
    const left = Math.min(
      Math.max(GUTTER, centerX - bubbleWidth / 2),
      viewport.width - GUTTER - bubbleWidth,
    );
    const spaceBelow = viewport.height - (spot.top + spot.height) - BUBBLE_GAP - GUTTER;
    const below = spaceBelow >= bubbleHeight || spot.top < viewport.height / 2;
    const top = below
      ? spot.top + spot.height + BUBBLE_GAP
      : spot.top - BUBBLE_GAP - bubbleHeight;
    bubble = {
      top: Math.min(Math.max(GUTTER, top), viewport.height - GUTTER - bubbleHeight),
      left,
      arrowLeft: Math.min(Math.max(20, centerX - left), bubbleWidth - 20),
      below,
    };
  }
  // Round nodes get a circle; a video node with its caption, or the course button, a rounded box.
  const round = spot !== null && Math.abs(spot.width - spot.height) < 12;
  const glide = reduceMotion ? "none" : "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-0 z-[90]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* Swallows taps so the map underneath cannot be used mid-tour. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {spot ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute ring-4 ring-white ${round ? "rounded-full" : "rounded-3xl"}`}
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
            transition: glide,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(15,23,42,0.62)]" aria-hidden="true" />
      )}
      <div
        ref={bubbleRef}
        className="absolute rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.28)]"
        style={{
          width: bubbleWidth,
          top: bubble?.top ?? viewport.height / 2,
          left: bubble?.left ?? GUTTER,
          visibility: bubble ? "visible" : "hidden",
          transition: reduceMotion ? "none" : "top 0.25s ease, left 0.25s ease",
        }}
      >
        {bubble ? (
          <span
            aria-hidden="true"
            className="absolute h-4 w-4 rotate-45 bg-white"
            style={{
              left: bubble.arrowLeft - 8,
              ...(bubble.below ? { top: -7 } : { bottom: -7 }),
            }}
          />
        ) : null}
        <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0066cc]">
          {stepIndex + 1}/{ONBOARDING_STEPS.length}
        </p>
        <h2 id={titleId} className="mt-1 text-[19px] font-extrabold leading-6 text-[#131b2e]">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-2 text-[15px] leading-[22px] text-[#3c4650]">
          {step.body}
        </p>
        <ChunkyButton ref={nextRef} onClick={next} className="mt-4 w-full">
          {last ? "Bắt đầu học" : "Tiếp"}
        </ChunkyButton>
      </div>
    </div>
  );
}
