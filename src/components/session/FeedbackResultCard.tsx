"use client";

import React from "react";
import { ScoreResult, WordScore } from "@/lib/scoring";
import { SessionClip } from "@/lib/content";

interface FeedbackResultCardProps {
  result: ScoreResult;
  clip: SessionClip;
  onRetry: () => void;
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
  onRetry,
  onNext,
}: FeedbackResultCardProps) {
  const isPerfect = result.accuracy === 100;

  if (isPerfect) {
    return (
      <div className="w-full mt-space-16">
        <div className="w-full bg-surface-container-lowest rounded-3xl p-space-20 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.04),0_2px_8px_-1px_rgba(0,0,0,0.02)] flex flex-col gap-space-16 border border-emerald-100">
          <div className="flex items-center">
            <div className="inline-flex items-center gap-space-4 px-space-12 py-space-4 rounded-full bg-emerald-50 text-emerald-700 font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[18px] text-[#34C759]">check_circle</span>
              <span>Chính xác 100% · Hoàn hảo</span>
            </div>
          </div>

          <div className="bg-surface-container-low/70 rounded-2xl p-space-16 flex flex-col gap-space-12 border border-surface-container-high">
            <div className="flex items-start justify-between gap-space-8">
              <p className="text-on-surface font-body-lg text-[18px] leading-relaxed font-medium">
                {clip.script}
              </p>
            </div>
            {clip.translationVi && (
              <>
                <div className="h-px w-full bg-surface-container-high"></div>
                <div className="flex items-start gap-space-8">
                  <span className="material-symbols-outlined text-[18px] text-secondary mt-0.5">translate</span>
                  <p className="font-body-md text-body-md text-secondary italic">
                    “{clip.translationVi}”
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-space-12 pt-space-24">
          <div className="grid grid-cols-2 gap-space-12">
            <button
              onClick={onRetry}
              className="h-14 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-8 hover:bg-surface-container transition-all active:scale-95 shadow-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">replay</span>
              <span>Luyện lại</span>
            </button>
            <button
              onClick={onNext}
              className="h-14 rounded-2xl bg-[#0071E3] text-white font-label-lg text-label-lg flex items-center justify-center gap-space-8 hover:bg-[#0071E3]/90 shadow-md transition-all active:scale-95"
              type="button"
            >
              <span>Tiếp theo</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Partial: show first mistake only; student must fix and re-check via the input below.
  return (
    <div className="w-full flex flex-col gap-space-16 mt-space-16">
      <section className="bg-surface-container-lowest rounded-[24px] shadow-sm p-space-20 flex flex-col gap-space-16">
        <div className="flex items-center justify-between pb-space-4">
          <p className="font-body-sm text-body-sm text-secondary">
            Sửa từ lỗi đầu tiên, rồi kiểm tra lại.
          </p>
          <div className="flex items-center gap-space-4 bg-primary/10 text-primary px-space-8 py-space-2 rounded-full font-label-sm text-label-sm font-semibold">
            <span
              className="material-symbols-outlined text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified
            </span>
            <span>Độ chính xác: {result.accuracy}%</span>
          </div>
        </div>

        <div className="border-t border-surface-container-high pt-space-16 flex flex-col gap-space-8">
          <div className="flex items-center justify-between">
            <span className="font-caption text-caption text-primary uppercase tracking-wider font-semibold flex items-center gap-space-4">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Đáp án (từng bước)
            </span>
          </div>
          <div className="bg-primary-fixed/30 rounded-2xl p-space-16 font-body-lg text-body-lg leading-relaxed text-on-surface">
            <p>{renderProgressiveAnswer(result.words)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
