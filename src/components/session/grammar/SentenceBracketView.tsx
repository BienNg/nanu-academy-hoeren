"use client";

import type { GrammarTip } from "@/lib/grammar-lessons";
import type { SentenceBracket } from "@/lib/grammar-node";
import { Emphasize, PhraseRow, PinguSays, useClipPlayer } from "@/components/session/grammar/grammar-ui";

function Slot({ text, caption, verb }: { text: string; caption: string; verb: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span
        className={`rounded-xl border-2 border-b-4 px-3 py-2 text-[18px] font-extrabold ${
          verb ? "border-[#ff8a4c] bg-[#fff1e8] text-[#b33f00]" : "border-[#e5e5ea] bg-white text-[#1d1d1f]"
        }`}
      >
        {text}
      </span>
      <span
        className={`text-center text-[11px] font-extrabold uppercase tracking-wide ${verb ? "text-[#d9480f]" : "text-[#aeaeb2]"}`}
      >
        {caption}
      </span>
    </div>
  );
}

/**
 * A Perfekt sentence split into its bracket: the aux in position 2 and the
 * Partizip at the end. Pingu explains it; the sentence below plays on tap.
 */
export function SentenceBracketView({
  bracket,
  script,
  translationVi,
  audioPath,
  tips,
}: {
  bracket: SentenceBracket;
  script: string;
  translationVi: string;
  audioPath: string | null;
  tips: GrammarTip[];
}) {
  const { play, playingPath } = useClipPlayer();
  const terms = [bracket.aux, bracket.partizip];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-extrabold uppercase tracking-wider text-[#d9480f]">Perfekt</span>
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-[#1d1d1f]">Khung câu</h1>
      </div>

      <PinguSays>
        {tips.length > 0 ? (
          tips.map((tip) => (
            <p key={tip.id}>
              <Emphasize text={tip.textVi} terms={terms} />
            </p>
          ))
        ) : (
          <p>
            Trợ động từ ở <strong className="text-[#1d1d1f]">vị trí 2</strong>, Partizip II ở{" "}
            <strong className="text-[#1d1d1f]">cuối câu</strong>.
          </p>
        )}
      </PinguSays>

      <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-3" aria-label={script}>
        {bracket.lead ? <Slot text={bracket.lead} caption="1" verb={false} /> : null}
        <Slot text={bracket.aux} caption={bracket.lead ? "2" : "đầu câu hỏi"} verb />
        {bracket.middle ? <Slot text={bracket.middle} caption="…" verb={false} /> : null}
        <Slot text={`${bracket.partizip}${bracket.tail}`} caption="cuối câu" verb />
      </div>

      <PhraseRow
        audioPath={audioPath}
        playing={audioPath !== null && playingPath === audioPath}
        onPlay={play}
        label={`Nghe: ${script}`}
      >
        <p className="text-[17px] font-bold leading-snug text-[#1d1d1f]">{script}</p>
        <p className="text-[14px] leading-snug text-[#86868b]">{translationVi}</p>
      </PhraseRow>
    </div>
  );
}
