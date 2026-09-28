"use client";

import { useEffect } from "react";
import type { McOption, McResult } from "@/lib/multiple-choice";
import type { SessionClip } from "@/lib/content";
import { ClipContentCard } from "@/components/session/ClipContentCard";

type McFeedbackCardProps = {
  result: McResult;
  options: McOption[];
  clip: SessionClip;
  onNext: () => void;
  nextLabel?: string;
};

function ContinueButton({ label, onNext }: { label: string; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-3 pt-6">
      <button
        onClick={onNext}
        className="group flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98]"
        type="button"
      >
        <span>{label}</span>
        <span className="material-symbols-outlined text-[20px] transition-transform duration-300 group-hover:translate-x-1">
          arrow_forward
        </span>
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
        <ContinueButton label={nextLabel} onNext={onNext} />
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
          </div>
        }
      />
      <ContinueButton label={nextLabel} onNext={onNext} />
    </div>
  );
}
