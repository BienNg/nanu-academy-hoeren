"use client";

import { SpeakButton } from "@/components/session/FeedbackSheet";
import type { SentenceBracket } from "@/lib/grammar-node";

function Slot({
  text,
  caption,
  tone,
}: {
  text: string;
  caption: string;
  tone: "plain" | "verb";
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span
        className={`rounded-xl border-2 border-b-4 px-3 py-2 text-[18px] font-bold sm:text-[20px] ${
          tone === "verb"
            ? "border-[#ff8a4c] bg-[#fff1e8] text-[#b33f00]"
            : "border-[#e5e5ea] bg-white text-[#1d1d1f]"
        }`}
      >
        {text}
      </span>
      <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">{caption}</span>
    </div>
  );
}

/**
 * A Perfekt sentence split into its bracket: the aux in position 2 and the
 * Partizip at the end, with whatever sits between them.
 */
export function SentenceBracketView({
  bracket,
  script,
  translationVi,
  audioPath,
}: {
  bracket: SentenceBracket;
  script: string;
  translationVi: string;
  audioPath: string | null;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Perfekt · Satzklammer</span>
        <h2 className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">Khung câu Perfekt</h2>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-2" aria-label={script}>
        {bracket.lead ? <Slot text={bracket.lead} caption="Vị trí 1" tone="plain" /> : null}
        <Slot text={bracket.aux} caption={bracket.lead ? "Vị trí 2" : "Câu hỏi: đầu câu"} tone="verb" />
        {bracket.middle ? <Slot text={bracket.middle} caption="…" tone="plain" /> : null}
        <Slot text={`${bracket.partizip}${bracket.tail}`} caption="Cuối câu" tone="verb" />
      </div>

      <div className="flex flex-col gap-1 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-[16px] leading-snug text-[#1d1d1f]">
        <p className="flex items-center gap-2 font-semibold">
          {audioPath ? <SpeakButton audioPath={audioPath} /> : null}
          <span>{script}</span>
        </p>
        <p className="italic text-[#6e6e73]">“{translationVi}”</p>
      </div>
    </section>
  );
}
