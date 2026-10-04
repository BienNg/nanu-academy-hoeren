"use client";

import { useEffect } from "react";
import type { McOption, McResult } from "@/lib/multiple-choice";
import type { SessionClip } from "@/lib/content";
import { ClipContentCard } from "@/components/session/ClipContentCard";
import { chunkyButton } from "@/components/chunkyButton";

type McFeedbackCardProps = {
  result: McResult;
  options: McOption[];
  clip: SessionClip;
  onNext: () => void;
  nextLabel?: string;
};

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

/**
 * Two-state feedback for multiple-choice cards (correct or requeue), the
 * same shape FeedbackResultCard uses for listening/order cards with
 * `skipOnMistake` — a discrete choice has no partial-correction state to show.
 */
export function McFeedbackCard({
  result,
  options,
  clip,
  onNext,
  nextLabel = "Tiếp theo",
}: McFeedbackCardProps) {
  const isPerfect = result.accuracy === 100;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onNext();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onNext]);

  if (isPerfect) {
    return (
      <div className="mt-4 w-full">
        <ClipContentCard
          clip={clip}
          className="border-[#34C759]/20"
          badge={
            <div className="flex items-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#34C759]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#34C759]">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Chính xác · Perfekt</span>
              </div>
            </div>
          }
        />
        <ContinueButton label={nextLabel} onNext={onNext} variant="success" />
      </div>
    );
  }

  const selected = options.find((option) => option.id === result.selectedId);
  const correct = options.find((option) => option.id === result.correctId);

  return (
    <div className="mt-4 w-full">
      <ClipContentCard
        clip={clip}
        className="border-[#ff3b30]/20"
        badge={
          <div className="flex flex-col gap-2">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ff3b30]/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#ff3b30]">
              <span className="material-symbols-outlined text-[16px]">cancel</span>
              <span>Chưa đúng · sẽ quay lại</span>
            </div>
            {selected ? (
              <p className="text-[13px] text-[#86868b]">
                Bạn chọn: <span className="text-[#ff3b30] line-through">{selected.text}</span>
                {correct ? <> · Đáp án đúng: <span className="text-[#34C759] font-medium">{correct.text}</span></> : null}
              </p>
            ) : null}
            {selected?.explanation ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-[#fff7ed] px-3 py-2 text-[14px] font-medium text-[#9a3412]">
                <span className="material-symbols-outlined mt-px text-[18px]" aria-hidden="true">lightbulb</span>
                <span>{selected.explanation}</span>
              </p>
            ) : null}
          </div>
        }
      />
      <ContinueButton label={nextLabel} onNext={onNext} variant="danger" />
    </div>
  );
}
