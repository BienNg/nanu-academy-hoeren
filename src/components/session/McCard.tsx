"use client";

import { useState } from "react";
import type { McOption } from "@/lib/multiple-choice";

type McCardProps = {
  prompt: string;
  options: McOption[];
  onSubmit: (selectedId: string) => void;
};

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

/** Duolingo-style translation multiple choice. Remount via parent `key` for each new card. */
export function McCard({ prompt, options, onSubmit }: McCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canSubmit = selectedId !== null;

  const handleSubmit = () => {
    if (!selectedId) return;
    onSubmit(selectedId);
  };

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
          Chọn nghĩa đúng · Richtige Bedeutung
        </span>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name="quiz" className="text-[22px]" />
          </div>
          <p className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
            {prompt}
          </p>
        </div>
      </section>

      <section className="mt-4 flex flex-col gap-2 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedId(option.id)}
              className={`flex min-h-11 items-center rounded-xl border px-3.5 py-2.5 text-left text-[17px] font-medium transition-colors ${
                isSelected
                  ? "border-[#0066cc] bg-[#0066cc]/10 text-[#0066cc]"
                  : "border-black/[0.08] border-b-[3px] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]"
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
          className={`group flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] px-6 py-3 text-[17px] font-semibold transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            canSubmit
              ? "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98]"
              : "cursor-not-allowed bg-[#e8e8ed] text-[#86868b]"
          }`}
        >
          <span>Kiểm tra · Prüfen</span>
          <MaterialIcon
            name="arrow_forward"
            className="text-[20px] transition-transform duration-300 group-hover:translate-x-1"
          />
        </button>
      </footer>
    </>
  );
}
