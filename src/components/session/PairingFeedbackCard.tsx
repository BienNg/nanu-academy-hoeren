"use client";

import { useEffect } from "react";
import type { PairingResult } from "@/lib/pairing";

type PairingItem = { id: string; vi: string; de: string };

type PairingFeedbackCardProps = {
  result: PairingResult;
  items: PairingItem[];
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
 * Two-state feedback for pairing cards (correct or requeue), same shape as
 * FeedbackResultCard's `skipOnMistake` mode — plus a per-pair breakdown,
 * since a pairing card covers 5 clips at once rather than a single one.
 */
export function PairingFeedbackCard({
  result,
  items,
  onNext,
  nextLabel = "Tiếp theo",
}: PairingFeedbackCardProps) {
  const isPerfect = result.accuracy === 100;
  const byId = new Map(items.map((item) => [item.id, item]));

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

  const badgeClass = isPerfect
    ? "border-[#34C759]/20"
    : "border-[#ff3b30]/20";

  return (
    <div className="mt-4 w-full">
      <section
        className={`flex flex-col gap-4 rounded-[24px] border bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6 ${badgeClass}`}
      >
        <div className="flex items-center justify-between">
          <div
            className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wider ${
              isPerfect ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#ff3b30]/10 text-[#ff3b30]"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isPerfect ? "check_circle" : "cancel"}
            </span>
            <span>{isPerfect ? "Chính xác · Perfekt" : `Độ chính xác: ${result.accuracy}%`}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-black/[0.05] pt-4">
          {items.map((item) => {
            const attempt = result.pairs.find((pair) => pair.viClipId === item.id);
            const theirDe = attempt ? byId.get(attempt.deClipId)?.de : undefined;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f5f5f7]/80 px-3.5 py-2.5"
              >
                <span className="text-[15px] font-medium text-[#1d1d1f]">
                  {item.vi} · {item.de}
                </span>
                {attempt ? (
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      attempt.correct ? "text-[#34C759]" : "text-[#ff3b30]"
                    }`}
                    title={attempt.correct ? undefined : theirDe}
                  >
                    {attempt.correct ? "check_circle" : "cancel"}
                  </span>
                ) : (
                  <span className="text-[12px] text-[#86868b]">Chưa ghép</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <ContinueButton label={nextLabel} onNext={onNext} />
    </div>
  );
}
