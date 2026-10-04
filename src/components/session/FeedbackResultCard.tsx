"use client";

import React, { useEffect } from "react";
import { ScoreResult, WordScore } from "@/lib/scoring";
import { SessionClip } from "@/lib/content";
import { ClipContentCard } from "@/components/session/ClipContentCard";
import { chunkyButton } from "@/components/chunkyButton";

interface FeedbackResultCardProps {
  result: ScoreResult;
  clip: SessionClip;
  onNext: () => void;
  nextLabel?: string;
  /** Show the word, then continue. The caller brings the clip back later. */
  skipOnMistake?: boolean;
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

function ContinueButton({
  label,
  onNext,
  variant,
}: {
  label: string;
  onNext: () => void;
  variant: "success" | "danger";
}) {
  return (
    <div className="flex flex-col gap-3 pt-6">
      <button onClick={onNext} className={chunkyButton(variant, "w-full")} type="button">
        {label}
      </button>
    </div>
  );
}

export function FeedbackResultCard({
  result,
  clip,
  onNext,
  nextLabel = "Tiếp theo",
  skipOnMistake = false,
}: FeedbackResultCardProps) {
  const isPerfect = result.accuracy === 100;
  const canContinue = isPerfect || skipOnMistake;

  useEffect(() => {
    if (!canContinue) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onNext();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canContinue, onNext]);

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

        <ContinueButton label={nextLabel} onNext={onNext} variant="success" />
      </div>
    );
  }

  if (skipOnMistake) {
    return (
      <div className="mt-4 w-full">
        <ClipContentCard
          clip={clip}
          className="border-[#ff3b30]/20"
          badge={
            <div className="flex items-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b30]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#ff3b30]">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                <span>Chưa đúng · sẽ quay lại</span>
              </div>
            </div>
          }
        />
        <ContinueButton label={nextLabel} onNext={onNext} variant="danger" />
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
