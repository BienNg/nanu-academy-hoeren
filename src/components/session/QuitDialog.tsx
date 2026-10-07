"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Pingu } from "@/components/session/Pingu";
import { FOCUS_RING } from "@/lib/keyboard";

type QuitDialogProps = {
  message: string;
  onStay: () => void;
  onQuit: () => void;
};

/**
 * "Đợi đã!" sheet shown before leaving a session part. Focus starts on
 * Tiếp tục học, stays inside the sheet, and Escape closes it. Focus goes
 * back to whatever opened it.
 */
export function QuitDialog({ message, onStay, onQuit }: QuitDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const stay = useEffectEvent(onStay);

  useEffect(() => {
    const opener = document.activeElement;
    stayRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stay();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const inside = dialogRef.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      data-session-dock=""
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      role="presentation"
      onClick={onStay}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full rounded-t-[28px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto w-full max-w-md px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <div className="relative mx-auto h-[128px] w-full overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 origin-bottom scale-[0.78]">
            <Pingu mood="oops" />
          </div>
        </div>
        <h2 id={titleId} className="mt-1 text-[22px] font-bold tracking-tight text-[#1d1d1f]">
          Đợi đã!
        </h2>
        <p className="mt-2 text-[17px] leading-snug font-medium text-[#4b4b4b]">{message}</p>
        <button
          ref={stayRef}
          type="button"
          onClick={onStay}
          className={`mt-6 flex h-[52px] w-full items-center justify-center rounded-2xl bg-[#0066cc] text-[15px] font-extrabold tracking-wide text-white uppercase ${FOCUS_RING}`}
        >
          Tiếp tục học
        </button>
        <button
          type="button"
          onClick={onQuit}
          className={`mt-3 flex h-11 w-full items-center justify-center rounded-2xl text-[15px] font-extrabold tracking-wide text-[#0066cc] uppercase ${FOCUS_RING}`}
        >
          Kết thúc
        </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
