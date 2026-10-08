"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { McOption, McResult } from "@/lib/multiple-choice";
import { CheckBar } from "@/components/session/FeedbackSheet";
import { digitLabel, digitShortcut, FOCUS_RING, isCardEnter } from "@/lib/keyboard";

type McCardProps = {
  /** Inline content only: it sits in a paragraph. */
  prompt: ReactNode;
  options: McOption[];
  onSubmit: (selectedId: string) => void;
  /** "list" stacks full-width options for sentence-length replies. */
  layout?: "grid" | "list";
  icon?: string;
  /** Checked: options lock and show right/wrong while the feedback sheet is up. */
  result?: McResult | null;
  /** Sits between the prompt and the options, such as the clip player. */
  afterPrompt?: ReactNode;
  /** Small label above the prompt, such as the grammar topic. */
  eyebrow?: string;
  /** Muted line under the prompt, such as the translation. */
  hint?: string;
  /** Steps to the previous screen from the check bar. */
  onBack?: () => void;
  backDisabled?: boolean;
};

function optionTone(isSelected: boolean, isCorrect: boolean, checked: boolean): string {
  if (checked && isSelected && isCorrect) return "border-[#34C759] bg-[#34C759]/15 text-[#248a3d]";
  if (checked && isSelected) return "border-[#ff3b30] bg-[#ff3b30]/10 text-[#c4261d]";
  if (checked && isCorrect) return "border-[#34C759] bg-white text-[#248a3d]";
  if (checked) return "border-[#e5e5e5] bg-white text-[#aeaeb2]";
  if (isSelected) return "border-[#0066cc] bg-[#0066cc]/10 text-[#0066cc]";
  return "border-[#e5e5e5] bg-white text-[#4b4b4b] hover:bg-[#f7f7f7]";
}

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * Duolingo-style translation multiple choice. Remount via parent `key` for each new card.
 * Keys: 1–9 pick an option, Enter checks. Enter on the picked option also checks.
 */
export function McCard({
  prompt,
  options,
  onSubmit,
  layout = "grid",
  icon = "translate",
  result = null,
  afterPrompt,
  eyebrow,
  hint,
  onBack,
  backDisabled = false,
}: McCardProps) {
  const checked = result !== null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canSubmit = selectedId !== null && !checked;

  const handleSubmit = () => {
    if (!selectedId || checked) return;
    onSubmit(selectedId);
  };

  useEffect(() => {
    if (checked) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const index = digitShortcut(event);
      const option = index === null ? undefined : options[index];
      if (option) {
        event.preventDefault();
        setSelectedId(option.id);
        return;
      }
      if (!isCardEnter(event) || !selectedId) return;
      event.preventDefault();
      event.stopPropagation();
      onSubmit(selectedId);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [checked, onSubmit, options, selectedId]);

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name={icon} className="text-[22px]" />
          </div>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#0066cc]">{eyebrow}</p>
            ) : null}
            <p className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
              {prompt}
            </p>
            {hint ? <p className="mt-1 text-[15px] italic leading-snug text-[#6e6e73]">“{hint}”</p> : null}
          </div>
        </div>
      </section>

      {afterPrompt}

      <section className={`mt-4 grid gap-3 rounded-[24px] ${layout === "list" ? "grid-cols-1" : "grid-cols-2"} bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:gap-2 [@media(max-height:760px)]:p-3 md:p-6`}>
        {options.map((option, index) => {
          const isSelected = option.id === (checked ? result.selectedId : selectedId);
          const shortcut = index < 10 ? digitLabel(index) : null;
          return (
            <button
              key={option.id}
              type="button"
              disabled={checked}
              aria-pressed={isSelected}
              aria-keyshortcuts={shortcut ?? undefined}
              onClick={() => setSelectedId(option.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !isSelected) return;
                event.preventDefault();
                handleSubmit();
              }}
              className={`relative flex items-center gap-3 rounded-2xl border-2 border-b-4 px-3 py-3 text-[16px] font-bold leading-snug ${
                layout === "list"
                  ? "min-h-[64px] justify-start px-4 text-left"
                  : "min-h-[88px] justify-center text-center [@media(max-height:760px)]:min-h-[64px]"
              } transition-all ${checked ? "" : "active:translate-y-0.5 active:border-b-2"} ${optionTone(
                isSelected,
                option.id === result?.correctId,
                checked,
              )} ${FOCUS_RING}`}
            >
              {shortcut && !checked ? (
                <kbd
                  aria-hidden="true"
                  className={`hidden h-5 min-w-5 shrink-0 items-center justify-center rounded border border-current px-1 font-sans text-[11px] font-medium opacity-30 pointer-fine:flex ${
                    layout === "list" ? "" : "absolute top-2 left-2"
                  }`}
                >
                  {shortcut}
                </kbd>
              ) : null}
              {option.text}
            </button>
          );
        })}
      </section>

      {checked ? null : (
        <CheckBar disabled={!canSubmit} onClick={handleSubmit} onBack={onBack} backDisabled={backDisabled} />
      )}
    </>
  );
}
