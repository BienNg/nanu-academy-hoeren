"use client";

import { useEffect, useState, useRef, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import type { Howl } from "howler";
import { ChunkyButton } from "@/components/chunkyButton";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";
import { cardShortcutsBlocked, FOCUS_RING, hasModifier, isCardEnter, isTextEntry } from "@/lib/keyboard";

const PRAISE = ["Tuyệt vời!", "Xuất sắc!", "Chính xác!", "Giỏi lắm!", "Perfekt!", "Super!"];

/** Same praise for the same card, so a re-render never swaps the word. */
export function praiseFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PRAISE[Math.abs(hash) % PRAISE.length] as string;
}

/** Tap-to-hear control for a sheet line that has no player of its own. */
export function SpeakButton({ audioPath, autoPlay = false }: { audioPath: string; autoPlay?: boolean }) {
  const howlRef = useRef<Howl | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const howl = createClipHowl(resolveAudioUrl(audioPath), 1, {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnd: () => setPlaying(false),
      onStop: () => setPlaying(false),
    });
    howlRef.current = howl;
    if (autoPlay) howl.play();
    return () => {
      howl.unload();
      howlRef.current = null;
    };
  }, [audioPath, autoPlay]);

  return (
    <button
      type="button"
      onClick={() => {
        const howl = howlRef.current;
        if (!howl) return;
        if (howl.playing()) howl.stop();
        else howl.play();
      }}
      aria-label={playing ? "Tạm dừng âm thanh" : "Nghe câu"}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 ${FOCUS_RING}`}
    >
      <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">
        {playing ? "stop" : "volume_up"}
      </span>
    </button>
  );
}

/** German line plus its Vietnamese meaning, the usual sheet body. */
export function SheetLine({
  script,
  translation,
  audioPath,
  autoPlay = false,
}: {
  script: string;
  translation?: string | null;
  audioPath?: string | null;
  /** Play as soon as the sentence is on screen. */
  autoPlay?: boolean;
}) {
  return (
    <>
      <p className="flex items-center gap-2 font-bold">
        {audioPath ? <SpeakButton audioPath={audioPath} autoPlay={autoPlay} /> : null}
        <span>{script}</span>
      </p>
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
  /** Steps to the previous screen, beside the continue button. */
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel?: string;
};

/** Square back control shared by the check bar and the feedback sheet. */
function BackButton({
  onBack,
  disabled = false,
  label,
}: {
  onBack: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <ChunkyButton
      variant={disabled ? "disabled" : "secondary"}
      disabled={disabled}
      onClick={onBack}
      className="w-[52px] shrink-0 px-0"
      aria-label={label}
    >
      <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
        arrow_back
      </span>
    </ChunkyButton>
  );
}

/** Left arrow steps back, except while typing or in a dialog. */
function useBackKey(onBack: (() => void) | undefined, disabled: boolean) {
  useEffect(() => {
    if (!onBack || disabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" || event.shiftKey || hasModifier(event)) return;
      if (cardShortcutsBlocked(event) || isTextEntry(event.target)) return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [disabled, onBack]);
}

/**
 * Kiểm tra pinned to the bottom of the screen. The feedback sheet takes this
 * same slot once the card is checked, so the button hides then.
 */
export function CheckBar({
  disabled = false,
  onClick,
  label = "Kiểm tra · Prüfen",
  autoFocus = false,
  buttonRef,
  onBack,
  backDisabled = false,
  backLabel = "Màn trước",
}: {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  /** Take focus on mount, for a bar that appears once the card is done. */
  autoFocus?: boolean;
  /** Lets a card hand keyboard focus to Kiểm tra. */
  buttonRef?: Ref<HTMLButtonElement>;
  /** Steps to the previous screen. Left out, the bar is one full-width button. */
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel?: string;
}) {
  useBackKey(onBack, backDisabled);
  const [docked, setDocked] = useState(false);
  useEffect(() => setDocked(true), []);
  // Portaled so a sliding card (a transformed parent) cannot pull the bar off the screen edge.
  const bar = (
      <div data-session-dock="" className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-[#fbfbfd]/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl gap-3 px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {onBack ? <BackButton onBack={onBack} disabled={backDisabled} label={backLabel} /> : null}
          <ChunkyButton
            ref={buttonRef}
            variant={disabled ? "disabled" : "primary"}
            disabled={disabled}
            autoFocus={autoFocus}
            onClick={onClick}
            className="min-w-0 flex-1"
          >
            {label}
          </ChunkyButton>
        </div>
      </div>
  );
  return (
    <>
      <div aria-hidden="true" data-check-spacer="" className="h-24" />
      {docked ? createPortal(bar, document.body) : null}
    </>
  );
}

/**
 * Duolingo-style result band pinned to the bottom of the screen. The exercise
 * stays visible above it. Renders a spacer in flow so the band never covers
 * the end of the page, and owns Enter → continue. The continue button takes
 * focus when the sheet opens, since the checked card's controls lock.
 */
export function FeedbackSheet({
  tone,
  title,
  children,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onBack,
  backDisabled = false,
  backLabel = "Màn trước",
}: FeedbackSheetProps) {
  const style = TONES[tone];
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(0);

  useBackKey(onBack, backDisabled);
  const [docked, setDocked] = useState(false);
  useEffect(() => setDocked(true), []);

  useEffect(() => {
    const node = sheetRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [docked]);

  useEffect(() => {
    if (!docked) return;
    actionRef.current?.focus({ preventScroll: true });
  }, [docked]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCardEnter(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onAction();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onAction]);

  const sheet = (
      <motion.div
        ref={sheetRef}
        role="status"
        aria-live="polite"
        data-session-dock=""
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
                    className={`shrink-0 rounded-lg text-[13px] font-extrabold uppercase tracking-wide ${style.title} opacity-80 hover:opacity-100 ${FOCUS_RING}`}
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
          <div className="flex gap-3">
            {onBack ? <BackButton onBack={onBack} disabled={backDisabled} label={backLabel} /> : null}
            <ChunkyButton
              ref={actionRef}
              variant={style.button}
              onClick={onAction}
              className="min-w-0 flex-1"
            >
              {actionLabel}
            </ChunkyButton>
          </div>
        </div>
      </motion.div>
  );
  return (
    <>
      <div aria-hidden="true" style={{ height }} />
      {docked ? createPortal(sheet, document.body) : null}
    </>
  );
}
