"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { WordChip } from "@/lib/sentence-order";
import { CheckBar } from "@/components/session/FeedbackSheet";
import {
  cardShortcutsBlocked,
  FOCUS_RING,
  hasModifier,
  isCardEnter,
  isKeyboardClick,
  isTextEntry,
} from "@/lib/keyboard";

type SentenceOrderCardProps = {
  /** Vietnamese line to translate. Left out on a listening card, where the audio is the prompt. */
  translation?: string;
  chips: WordChip[];
  onSubmit: (selected: string[]) => void;
  /** Checked: the answer stays visible but can no longer change. */
  locked?: boolean;
  /** Sits between the prompt and the chips, such as the clip player. */
  afterPrompt?: ReactNode;
  /** Small label above the card. Defaults to sentence order. */
  eyebrow?: string;
  /** Line above `translation`. Defaults to asking for a translation into German. */
  instruction?: string;
};

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

// Chips are 44px tall with an 8px gap, so answer rows repeat every 52px.
const CHIP_CLASS = `flex h-11 items-center rounded-xl border border-black/[0.08] border-b-[3px] bg-white px-3.5 text-[17px] font-medium text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${FOCUS_RING}`;
const ANSWER_LINES =
  "repeating-linear-gradient(to bottom, transparent 0, transparent 48px, #e8e8ed 48px, #e8e8ed 50px, transparent 50px, transparent 52px)";

/**
 * Duolingo-style word ordering. Remount via parent `key` for each new card.
 * Keys: Tab between chips, Enter or Space moves one, Backspace drops the last
 * word, Enter checks. A chip moved from the keyboard leaves focus on its
 * neighbour, since the button itself unmounts.
 */
export function SentenceOrderCard({
  translation,
  chips,
  onSubmit,
  locked = false,
  afterPrompt,
  eyebrow = "Sắp xếp câu · Satzbau",
  instruction = "Dịch câu này sang tiếng Đức",
}: SentenceOrderCardProps) {
  const listening = translation === undefined;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();
  const chipById = new Map(chips.map((chip) => [chip.id, chip]));
  const selected = selectedIds
    .map((id) => chipById.get(id))
    .filter((chip): chip is WordChip => Boolean(chip));
  const used = new Set(selectedIds);
  const canSubmit = selectedIds.length > 0 && !locked;
  const zonesRef = useRef<HTMLElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  /** Where keyboard focus goes once the moved chip has unmounted. */
  const refocus = useRef<{ zone: "answer" | "bank"; index: number } | null>(null);

  const chipIndex = (zone: "answer" | "bank", button: HTMLElement) =>
    Array.from(zonesRef.current?.querySelectorAll(`[data-zone="${zone}"] button`) ?? []).indexOf(
      button,
    );

  const pick = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    if (isKeyboardClick(event)) {
      refocus.current = { zone: "bank", index: chipIndex("bank", event.currentTarget) };
    }
    setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const unpick = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    if (isKeyboardClick(event)) {
      refocus.current = { zone: "answer", index: chipIndex("answer", event.currentTarget) };
    }
    setSelectedIds((current) => current.filter((item) => item !== id));
  };

  useEffect(() => {
    const target = refocus.current;
    refocus.current = null;
    if (!target) return;
    const chips = (zone: string) =>
      Array.from(
        zonesRef.current?.querySelectorAll<HTMLButtonElement>(`[data-zone="${zone}"] button`) ?? [],
      );
    const same = chips(target.zone);
    const next =
      same[Math.min(target.index, same.length - 1)] ??
      (target.zone === "bank" ? checkRef.current : chips("bank")[0]);
    next?.focus();
  }, [selectedIds]);

  const handleSubmit = useCallback(() => {
    if (selectedIds.length === 0) return;
    const texts = selectedIds
      .map((id) => chips.find((chip) => chip.id === id)?.text)
      .filter((text): text is string => typeof text === "string");
    onSubmit(texts);
  }, [chips, onSubmit, selectedIds]);

  useEffect(() => {
    if (locked) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (cardShortcutsBlocked(event)) return;
      if (isCardEnter(event)) {
        if (!canSubmit) return;
        event.preventDefault();
        event.stopPropagation();
        handleSubmit();
        return;
      }
      if (event.key === "Backspace" && !hasModifier(event) && !isTextEntry(event.target)) {
        event.preventDefault();
        setSelectedIds((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canSubmit, handleSubmit, locked]);

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.7 };

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
          {eyebrow}
        </span>

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name={listening ? "hearing" : "translate"} className="text-[22px]" />
          </div>
          {listening ? (
            <p className="flex min-h-11 items-center text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
              Bạn nghe thấy gì?
            </p>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[13px] font-medium text-[#86868b]">
                {instruction}
              </p>
              <p className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
                {translation}
              </p>
            </div>
          )}
        </div>
      </section>

      {afterPrompt}

      <LayoutGroup>
        <section ref={zonesRef} className="mt-4 flex flex-col gap-5 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
          <div
            data-zone="answer"
            aria-label="Câu trả lời của bạn"
            className="flex min-h-[104px] flex-wrap content-start items-start gap-2"
            style={{ backgroundImage: ANSWER_LINES }}
          >
            {selected.length === 0 ? (
              <span className="flex h-11 items-center px-1 text-[15px] text-[#86868b]">
                Chạm vào từ theo đúng thứ tự
              </span>
            ) : null}
            {selected.map((chip) => (
              <motion.button
                key={chip.id}
                layoutId={chip.id}
                transition={transition}
                type="button"
                disabled={locked}
                onClick={(event) => unpick(chip.id, event)}
                className={`${CHIP_CLASS} transition-colors hover:bg-[#f5f5f7] active:translate-y-[1px] active:border-b`}
              >
                {chip.text}
              </motion.button>
            ))}
          </div>

          <div className="pt-1">
            <div data-zone="bank" aria-label="Các từ" className="flex flex-wrap justify-center gap-2">
              {chips.map((chip) =>
                used.has(chip.id) ? (
                  <span
                    key={chip.id}
                    aria-hidden="true"
                    className="flex h-11 items-center rounded-xl border border-transparent border-b-[3px] bg-[#e8e8ed] px-3.5 text-[17px] font-medium text-transparent select-none"
                  >
                    {chip.text}
                  </span>
                ) : (
                  <motion.button
                    key={chip.id}
                    layoutId={chip.id}
                    transition={transition}
                    type="button"
                    disabled={locked}
                    onClick={(event) => pick(chip.id, event)}
                    className={`${CHIP_CLASS} transition-colors hover:bg-[#f5f5f7] active:translate-y-[1px] active:border-b`}
                  >
                    {chip.text}
                  </motion.button>
                ),
              )}
            </div>
          </div>
        </section>
      </LayoutGroup>

      {locked ? null : (
        <CheckBar disabled={!canSubmit} onClick={handleSubmit} buttonRef={checkRef} />
      )}
    </>
  );
}
