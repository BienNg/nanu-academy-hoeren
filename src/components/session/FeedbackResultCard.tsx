"use client";

import React from "react";
import { ScoreResult, WordScore } from "@/lib/scoring";
import { SessionClip } from "@/lib/content";
import { FeedbackSheet, SheetLine, praiseFor } from "@/components/session/FeedbackSheet";

interface FeedbackResultCardProps {
  result: ScoreResult;
  clip: SessionClip;
  onNext: () => void;
  nextLabel?: string;
  /** Show the word, then continue. The caller brings the clip back later. */
  skipOnMistake?: boolean;
  /** Small text action on the sheet, e.g. back to the study card. */
  secondaryLabel?: string;
  onSecondary?: () => void;
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
  nextLabel = "Tiếp theo",
  skipOnMistake = false,
  secondaryLabel,
  onSecondary,
}: FeedbackResultCardProps) {
  const isPerfect = result.accuracy === 100;

  if (isPerfect || skipOnMistake) {
    return (
      <FeedbackSheet
        tone={isPerfect ? "correct" : "wrong"}
        title={isPerfect ? praiseFor(clip.id) : "Đáp án đúng:"}
        actionLabel={nextLabel}
        onAction={onNext}
        secondaryLabel={secondaryLabel}
        onSecondary={onSecondary}
      >
        <SheetLine script={clip.script} translation={clip.translationVi} />
      </FeedbackSheet>
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
