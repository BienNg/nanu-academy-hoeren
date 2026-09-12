"use client";

import type { ReactNode } from "react";
import type { SessionClip } from "@/lib/content";

type ClipContentCardProps = {
  clip: SessionClip;
  badge?: ReactNode;
  className?: string;
};

/** Script + translation block reused by feedback and study flashcards. */
export function ClipContentCard({
  clip,
  badge,
  className,
}: ClipContentCardProps) {
  return (
    <div
      className={`w-full bg-white/80 backdrop-blur-xl rounded-[24px] p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col gap-4 border ${
        className ?? "border-white/20"
      }`}
    >
      {badge}
      <div className="bg-[#f5f5f7]/80 rounded-[16px] p-4 flex flex-col gap-3 border border-black/[0.05]">
        <p className="text-[#1d1d1f] text-lg leading-relaxed font-medium">
          {clip.script}
        </p>
        {clip.translationVi ? (
          <>
            <div className="h-px w-full bg-black/[0.05]" />
            <div className="flex items-start gap-2">
              <span
                className="material-symbols-outlined text-[18px] text-[#86868b] mt-0.5"
                aria-hidden="true"
              >
                translate
              </span>
              <p className="text-[15px] text-[#86868b] italic">
                “{clip.translationVi}”
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
