"use client";

import React, { useEffect } from "react";
import { ScoreResult, WordScore } from "@/lib/scoring";
import { SessionClip } from "@/lib/content";
import { ClipContentCard } from "@/components/session/ClipContentCard";

interface FeedbackResultCardProps {
  result: ScoreResult;
  clip: SessionClip;
  onNext: () => void;
}

function censorWord(word: string): string {
  return Array.from(word)
    .map((char) => (/\s/.test(char) ? char : "*"))
    .join("");
}

/** Reveal the script only up to the first mistake; censor everything after. */
function renderProgressiveAnswer(words: WordScore[]) {
  const scriptWords = words.filter((w) => w.status !== "extra");
  const firstMistakeIndex = scriptWords.findIndex(
    (w) => w.status === "incorrect" || w.status === "missing",
  );

  return scriptWords.map((w, i) => {
    if (firstMistakeIndex === -1) {
      return <span key={i}>{w.word} </span>;
    }

    if (i < firstMistakeIndex) {
      return <span key={i}>{w.word} </span>;
    }

    if (i === firstMistakeIndex) {
      return (
        <React.Fragment key={i}>
          <strong className="text-error font-semibold underline decoration-error decoration-solid underline-offset-4">
            {w.word}
          </strong>
          <span> </span>
        </React.Fragment>
      );
    }

    return (
      <span key={i} className="text-secondary tracking-wide">
        {censorWord(w.word)}{" "}
      </span>
    );
  });
}

export function FeedbackResultCard({
  result,
  clip,
  onNext,
}: FeedbackResultCardProps) {
  const isPerfect = result.accuracy === 100;

  useEffect(() => {
    if (!isPerfect) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onNext();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isPerfect, onNext]);

  if (isPerfect) {
    return (
      <div className="w-full mt-4">
        <ClipContentCard
          clip={clip}
          className="border-[#34C759]/20"
          badge={
            <div className="flex items-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#34C759]/10 text-[#34C759] text-[12px] font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Chính xác 100% · Hoàn hảo</span>
              </div>
            </div>
          }
        />

        <div className="flex flex-col gap-3 pt-6">
          <button
            onClick={onNext}
            className="group h-[56px] w-full rounded-[16px] bg-[#0066cc] text-white text-[17px] font-semibold flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98]"
            type="button"
          >
            <span>Tiếp theo</span>
            <span className="material-symbols-outlined text-[20px] transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
          </button>
        </div>
      </div>
    );
  }

  // Partial: show first mistake only; student must fix and re-check via the input below.
  return (
    <div className="w-full flex flex-col gap-4 mt-4">
      <section className="bg-white/80 backdrop-blur-xl rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/20 p-5 md:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-1">
          <p className="text-[13px] font-medium text-[#86868b]">
            Sửa từ lỗi đầu tiên, rồi kiểm tra lại.
          </p>
          <div className="flex items-center gap-1.5 bg-[#0066cc]/10 text-[#0066cc] px-3 py-1 rounded-full text-[12px] font-bold">
            <span
              className="material-symbols-outlined text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified
            </span>
            <span>Độ chính xác: {result.accuracy}%</span>
          </div>
        </div>

        <div className="border-t border-black/[0.05] pt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#0066cc] uppercase tracking-wider font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Đáp án (từng bước)
            </span>
          </div>
          <div className="bg-[#0066cc]/5 rounded-[16px] p-4 text-lg leading-relaxed text-[#1d1d1f] font-medium border border-[#0066cc]/10">
            <p>{renderProgressiveAnswer(result.words)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
