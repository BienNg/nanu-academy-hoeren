"use client";

import { useState, type ReactNode } from "react";
import type { McOption, McResult } from "@/lib/multiple-choice";
import { CheckBar } from "@/components/session/FeedbackSheet";

type McCardProps = {
  prompt: string;
  options: McOption[];
  onSubmit: (selectedId: string) => void;
  /** "list" stacks full-width options for sentence-length replies. */
  layout?: "grid" | "list";
  icon?: string;
  /** Checked: options lock and show right/wrong while the feedback sheet is up. */
  result?: McResult | null;
  /** Sits between the prompt and the options, such as the clip player. */
  afterPrompt?: ReactNode;
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

/** Duolingo-style translation multiple choice. Remount via parent `key` for each new card. */
export function McCard({
  prompt,
  options,
  onSubmit,
  layout = "grid",
  icon = "translate",
  result = null,
  afterPrompt,
}: McCardProps) {
  const checked = result !== null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canSubmit = selectedId !== null && !checked;

  const handleSubmit = () => {
    if (!selectedId || checked) return;
    onSubmit(selectedId);
  };

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name={icon} className="text-[22px]" />
          </div>
          <p className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
            {prompt}
          </p>
        </div>
      </section>

      {afterPrompt}

      <section className={`mt-4 grid gap-3 rounded-[24px] ${layout === "list" ? "grid-cols-1" : "grid-cols-2"} bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6`}>
        {options.map((option) => {
          const isSelected = option.id === (checked ? result.selectedId : selectedId);
          return (
            <button
              key={option.id}
              type="button"
              disabled={checked}
              onClick={() => setSelectedId(option.id)}
              className={`flex items-center rounded-2xl border-2 border-b-4 px-3 py-3 text-[16px] font-bold leading-snug ${
                layout === "list" ? "min-h-[64px] justify-start px-4 text-left" : "min-h-[88px] justify-center text-center"
              } transition-all ${checked ? "" : "active:translate-y-0.5 active:border-b-2"} ${optionTone(
                isSelected,
                option.id === result?.correctId,
                checked,
              )}`}
            >
              {option.text}
            </button>
          );
        })}
      </section>

      {checked ? null : <CheckBar disabled={!canSubmit} onClick={handleSubmit} />}
    </>
  );
}
