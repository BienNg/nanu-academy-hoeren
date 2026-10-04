"use client";

import { useState } from "react";
import type { McOption } from "@/lib/multiple-choice";
import { chunkyButton } from "@/components/chunkyButton";

type McCardProps = {
  prompt: string;
  options: McOption[];
  onSubmit: (selectedId: string) => void;
  /** "list" stacks full-width options for sentence-length replies. */
  layout?: "grid" | "list";
  icon?: string;
};

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
}: McCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canSubmit = selectedId !== null;

  const handleSubmit = () => {
    if (!selectedId) return;
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

      <section className={`mt-4 grid gap-3 rounded-[24px] ${layout === "list" ? "grid-cols-1" : "grid-cols-2"} bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6`}>
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedId(option.id)}
              className={`flex items-center rounded-2xl border-2 border-b-4 px-3 py-3 text-[16px] font-bold leading-snug ${
                layout === "list" ? "min-h-[64px] justify-start px-4 text-left" : "min-h-[88px] justify-center text-center"
              } transition-all active:translate-y-0.5 active:border-b-2 ${
                isSelected
                  ? "border-[#0066cc] bg-[#0066cc]/10 text-[#0066cc]"
                  : "border-[#e5e5e5] bg-white text-[#4b4b4b] hover:bg-[#f7f7f7]"
              }`}
            >
              {option.text}
            </button>
          );
        })}
      </section>

      <footer className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={chunkyButton(canSubmit ? "primary" : "disabled", "w-full")}
        >
          Kiểm tra · Prüfen
        </button>
      </footer>
    </>
  );
}
