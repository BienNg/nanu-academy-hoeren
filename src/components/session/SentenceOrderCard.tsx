"use client";

import { useCallback, useEffect, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { WordChip } from "@/lib/sentence-order";
import { ChunkyButton } from "@/components/chunkyButton";

type SentenceOrderCardProps = {
  translation: string;
  chips: WordChip[];
  onSubmit: (selected: string[]) => void;
};

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

// Chips are 44px tall with an 8px gap, so answer rows repeat every 52px.
const CHIP_CLASS =
  "flex h-11 items-center rounded-xl border border-black/[0.08] border-b-[3px] bg-white px-3.5 text-[17px] font-medium text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const ANSWER_LINES =
  "repeating-linear-gradient(to bottom, transparent 0, transparent 48px, #e8e8ed 48px, #e8e8ed 50px, transparent 50px, transparent 52px)";

/**
 * Duolingo-style word ordering. Remount via parent `key` for each new card.
 */
export function SentenceOrderCard({ translation, chips, onSubmit }: SentenceOrderCardProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();
  const chipById = new Map(chips.map((chip) => [chip.id, chip]));
  const selected = selectedIds
    .map((id) => chipById.get(id))
    .filter((chip): chip is WordChip => Boolean(chip));
  const used = new Set(selectedIds);
  const canSubmit = selectedIds.length > 0;

  const pick = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const unpick = (id: string) => {
    setSelectedIds((current) => current.filter((item) => item !== id));
  };

  const handleSubmit = useCallback(() => {
    if (selectedIds.length === 0) return;
    const texts = selectedIds
      .map((id) => chips.find((chip) => chip.id === id)?.text)
      .filter((text): text is string => typeof text === "string");
    onSubmit(texts);
  }, [chips, onSubmit, selectedIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        if (!canSubmit) return;
        event.preventDefault();
        event.stopPropagation();
        handleSubmit();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        setSelectedIds((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canSubmit, handleSubmit]);

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.7 };

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
          Sắp xếp câu · Satzbau
        </span>

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name="translate" className="text-[22px]" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[13px] font-medium text-[#86868b]">
              Dịch câu này sang tiếng Đức
            </p>
            <p className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
              {translation}
            </p>
          </div>
        </div>
      </section>

      <LayoutGroup>
        <section className="mt-4 flex flex-col gap-5 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
          <div
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
                onClick={() => unpick(chip.id)}
                className={`${CHIP_CLASS} transition-colors hover:bg-[#f5f5f7] active:translate-y-[1px] active:border-b`}
              >
                {chip.text}
              </motion.button>
            ))}
          </div>

          <div className="pt-1">
            <div aria-label="Các từ" className="flex flex-wrap justify-center gap-2">
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
                    onClick={() => pick(chip.id)}
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

      <footer className="mt-6 flex flex-col items-center gap-2">
        <ChunkyButton
          variant={canSubmit ? "primary" : "disabled"}
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full"
        >
          Kiểm tra · Prüfen
        </ChunkyButton>
      </footer>
    </>
  );
}
