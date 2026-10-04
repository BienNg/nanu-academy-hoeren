"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChunkyButton } from "@/components/chunkyButton";

const PRAISE = ["Tuyệt vời!", "Xuất sắc!", "Chính xác!", "Giỏi lắm!", "Perfekt!", "Super!"];

/** Same praise for the same card, so a re-render never swaps the word. */
export function praiseFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PRAISE[Math.abs(hash) % PRAISE.length] as string;
}

/** German line plus its Vietnamese meaning, the usual sheet body. */
export function SheetLine({ script, translation }: { script: string; translation?: string | null }) {
  return (
    <>
      <p className="font-bold">{script}</p>
      {translation ? <p className="italic opacity-80">“{translation}”</p> : null}
    </>
  );
}

const TONES = {
  correct: {
    band: "bg-[#e3f8e8]",
    title: "text-[#248a3d]",
    body: "text-[#248a3d]",
    icon: "check",
    button: "success",
  },
  wrong: {
    band: "bg-[#ffe5e3]",
    title: "text-[#c4261d]",
    body: "text-[#c4261d]",
    icon: "close",
    button: "danger",
  },
} as const;

type FeedbackSheetProps = {
  tone: keyof typeof TONES;
  title: string;
  children?: ReactNode;
  actionLabel: string;
  onAction: () => void;
  /** Small text action under the title, e.g. "Xem lại thẻ". */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * Kiểm tra pinned to the bottom of the screen. The feedback sheet takes this
 * same slot once the card is checked, so the button hides then.
 */
export function CheckBar({
  disabled = false,
  onClick,
  label = "Kiểm tra · Prüfen",
}: {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-[#fbfbfd]/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-2xl px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <ChunkyButton
            variant={disabled ? "disabled" : "primary"}
            disabled={disabled}
            onClick={onClick}
            className="w-full"
          >
            {label}
          </ChunkyButton>
        </div>
      </div>
    </>
  );
}

/**
 * Duolingo-style result band pinned to the bottom of the screen. The exercise
 * stays visible above it. Renders a spacer in flow so the band never covers
 * the end of the page, and owns Enter → continue.
 */
export function FeedbackSheet({
  tone,
  title,
  children,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: FeedbackSheetProps) {
  const style = TONES[tone];
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onAction();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onAction]);

  return (
    <>
      <div aria-hidden="true" style={{ height }} />
      <motion.div
        ref={sheetRef}
        role="status"
        aria-live="polite"
        className={`fixed inset-x-0 bottom-0 z-40 ${style.band}`}
        initial={reduceMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ${style.title}`}
            >
              <span
                className="material-symbols-outlined text-[24px] leading-none"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 700, 'GRAD' 0, 'opsz' 24" }}
                aria-hidden="true"
              >
                {style.icon}
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className={`text-[22px] font-extrabold leading-tight ${style.title}`}>
                  {title}
                </h2>
                {secondaryLabel && onSecondary ? (
                  <button
                    type="button"
                    onClick={onSecondary}
                    className={`shrink-0 text-[13px] font-extrabold uppercase tracking-wide ${style.title} opacity-80 hover:opacity-100`}
                  >
                    {secondaryLabel}
                  </button>
                ) : null}
              </div>
              {children ? (
                <div className={`flex flex-col gap-1 text-[16px] leading-snug ${style.body}`}>
                  {children}
                </div>
              ) : null}
            </div>
          </div>
          <ChunkyButton variant={style.button} onClick={onAction} className="w-full">
            {actionLabel}
          </ChunkyButton>
        </div>
      </motion.div>
    </>
  );
}
