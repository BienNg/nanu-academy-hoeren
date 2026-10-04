"use client";

import type { McOption, McResult } from "@/lib/multiple-choice";
import type { SessionClip } from "@/lib/content";
import { FeedbackSheet, SheetLine, praiseFor } from "@/components/session/FeedbackSheet";

type McFeedbackCardProps = {
  result: McResult;
  options: McOption[];
  clip: SessionClip;
  onNext: () => void;
  nextLabel?: string;
};

/**
 * Two-state feedback for multiple-choice cards (correct or requeue), the
 * same shape FeedbackResultCard uses for listening/order cards with
 * `skipOnMistake` — a discrete choice has no partial-correction state to show.
 * The McCard stays on screen above the sheet, showing which option was picked.
 */
export function McFeedbackCard({
  result,
  options,
  clip,
  onNext,
  nextLabel = "Tiếp theo",
}: McFeedbackCardProps) {
  if (result.accuracy === 100) {
    return (
      <FeedbackSheet
        tone="correct"
        title={praiseFor(clip.id)}
        actionLabel={nextLabel}
        onAction={onNext}
      >
        <SheetLine script={clip.script} translation={clip.translationVi} />
      </FeedbackSheet>
    );
  }

  const selected = options.find((option) => option.id === result.selectedId);
  const correct = options.find((option) => option.id === result.correctId);

  return (
    <FeedbackSheet
      tone="wrong"
      title="Đáp án đúng:"
      actionLabel={nextLabel}
      onAction={onNext}
    >
      <p className="font-bold">{correct?.text ?? clip.script}</p>
      {selected?.explanation ? (
        <p className="mt-1 flex items-start gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-[14px] font-medium text-[#9a3412]">
          <span className="material-symbols-outlined mt-px text-[18px]" aria-hidden="true">
            lightbulb
          </span>
          <span>{selected.explanation}</span>
        </p>
      ) : null}
    </FeedbackSheet>
  );
}
