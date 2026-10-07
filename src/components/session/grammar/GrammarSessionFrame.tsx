"use client";

import { useEffect, type ReactNode } from "react";
import { CheckBar } from "@/components/session/FeedbackSheet";
import { PartHearts } from "@/components/session/PartHearts";
import { cardShortcutsBlocked, FOCUS_RING, isCardEnter } from "@/lib/keyboard";

/** Close button, progress bar and, in practice, the hearts. Same look as the other sessions. */
export function GrammarHeader({
  progress,
  onClose,
  hearts,
}: {
  /** 0 to 1. */
  progress: number;
  onClose: () => void;
  hearts?: { remaining: number; total: number; breakingIndex: number | null };
}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
      <div className="mx-auto w-full max-w-4xl px-4 pt-3 pb-3 sm:px-6">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3">
          <button
            type="button"
            aria-label="Quay lại"
            onClick={onClose}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-[#c7c7cc] transition-colors hover:bg-[#f5f5f7] hover:text-[#aeaeb2] active:scale-95 ${FOCUS_RING}`}
          >
            <span
              className="material-symbols-outlined translate-y-px text-[22px]"
              style={{ fontVariationSettings: "'wght' 260" }}
              aria-hidden="true"
            >
              close
            </span>
          </button>
          <div
            aria-label="Tiến độ"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            role="progressbar"
            className="h-[18px] w-full overflow-hidden rounded-full border-b-4 border-[#d5d5d5] bg-[#e8e8e8]"
          >
            <div
              className="h-full rounded-full border-b-4 border-[#005bb5] bg-gradient-to-b from-[#7ec4ff] to-[#1a8cff] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
            />
          </div>
          {hearts ? (
            <PartHearts remaining={hearts.remaining} total={hearts.total} breakingIndex={hearts.breakingIndex} />
          ) : (
            <span aria-hidden="true" className="w-11" />
          )}
        </div>
      </div>
    </header>
  );
}

/** Page shell shared by grammar study and practice. */
export function GrammarPage({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col overflow-x-hidden bg-[#fbfbfd] selection:bg-[#0066cc] selection:text-white"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>
      <div className="relative z-10 flex min-h-dvh w-full flex-1 flex-col">
        {header}
        {children}
      </div>
    </div>
  );
}

/** "Tiếp tục" pinned to the bottom; Enter presses it too. For screens with nothing to check. */
export function ContinueBar({
  onContinue,
  label = "Tiếp tục · Weiter",
  onBack,
  backDisabled = false,
}: {
  onContinue: () => void;
  label?: string;
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (cardShortcutsBlocked(event) || !isCardEnter(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onContinue();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onContinue]);
  return (
    <CheckBar onClick={onContinue} label={label} onBack={onBack} backDisabled={backDisabled} />
  );
}
