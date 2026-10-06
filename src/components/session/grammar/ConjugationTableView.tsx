"use client";

import { useEffect, useRef, useState } from "react";
import type { Howl } from "howler";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";
import { FOCUS_RING } from "@/lib/keyboard";
import type { ConjugationCell, ConjugationTable, GrammarTense } from "@/lib/grammar-lessons";

/** Column colors of the class slide: Präsens cyan, Perfekt orange, Präteritum purple. */
export const TENSE_TONE: Record<GrammarTense, { head: string; text: string; mark: string }> = {
  praesens: { head: "bg-[#8fdbe8] text-[#0b3b44]", text: "text-[#0b5563]", mark: "text-[#007a8a]" },
  perfekt: { head: "bg-[#ff8a4c] text-[#4a1800]", text: "text-[#7a2e00]", mark: "text-[#d9480f]" },
  praeteritum: { head: "bg-[#c364e0] text-white", text: "text-[#5b1a73]", mark: "text-[#1a4fd6]" },
};

/**
 * One shared player for many short clips, so a table of 15 rows does not hold
 * 15 audio elements. Playing a new clip stops the one before.
 */
export function useClipPlayer() {
  const howlRef = useRef<Howl | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);

  useEffect(
    () => () => {
      howlRef.current?.unload();
      howlRef.current = null;
    },
    [],
  );

  const play = (audioPath: string) => {
    howlRef.current?.unload();
    const howl = createClipHowl(resolveAudioUrl(audioPath), 1, {
      onPlay: () => setPlayingPath(audioPath),
      onEnd: () => setPlayingPath(null),
      onStop: () => setPlayingPath(null),
      onLoadError: () => setPlayingPath(null),
    });
    howlRef.current = howl;
    howl.play();
  };

  return { play, playingPath };
}

/**
 * The cell text with its highlight (an ending or the Partizip) marked. "…"
 * stays with the Partizip, so a narrow Perfekt cell breaks into two lines,
 * "hast" and "… gehabt", never three.
 */
export function HighlightedForm({ text, highlight, markClass }: { text: string; highlight: string; markClass: string }) {
  const kept = text.replace(" … ", " …\u00a0");
  if (!highlight || !kept.endsWith(highlight)) return <>{kept}</>;
  return (
    <>
      {kept.slice(0, kept.length - highlight.length)}
      <strong className={`font-extrabold ${markClass}`}>{highlight}</strong>
    </>
  );
}

/** Lets "wir/sie/Sie" wrap after a slash instead of pushing into the next column. */
function wrappable(label: string): string {
  return label.replaceAll("/", "/\u200b");
}

function CellButton({
  cell,
  tense,
  personLabel,
  playing,
  onPlay,
}: {
  cell: ConjugationCell;
  tense: GrammarTense;
  personLabel: string;
  playing: boolean;
  onPlay: (path: string) => void;
}) {
  const tone = TENSE_TONE[tense];
  const content = <HighlightedForm text={cell.text} highlight={cell.highlight} markClass={tone.mark} />;
  if (!cell.audioPath) {
    return <span className={`block px-1 py-3 text-[14px] font-medium min-[380px]:text-[15px] sm:px-2 sm:text-[18px] ${tone.text}`}>{content}</span>;
  }
  const audioPath = cell.audioPath;
  return (
    <button
      type="button"
      onClick={() => onPlay(audioPath)}
      aria-label={`Nghe: ${cell.spoken}`}
      title={`${personLabel} – ${cell.spoken}`}
      className={`flex w-full items-center gap-1.5 rounded-xl px-1 py-3 text-left text-[14px] font-medium min-[380px]:text-[15px] transition-colors hover:bg-black/[0.04] sm:px-2 sm:text-[18px] ${
        playing ? "bg-black/[0.08]" : "bg-black/[0.02]"
      } ${tone.text} ${FOCUS_RING}`}
    >
      <span className="min-w-0 flex-1">{content}</span>
      {/* On a phone the whole cell is the button; the icon only fits from sm up.
          The wrapper hides it, since the icon font sets its own display. */}
      <span className="hidden shrink-0 sm:inline-flex" aria-hidden="true">
        <span className={`material-symbols-outlined text-[16px] ${playing ? "opacity-90" : "opacity-30"}`}>volume_up</span>
      </span>
    </button>
  );
}

/**
 * Präsens · Perfekt · Präteritum for one verb, in the class slide's layout.
 * Every cell plays its row's audio. On a phone the person column narrows and
 * the Perfekt column wraps "hast … gehabt" onto two lines.
 */
export function ConjugationTableView({ table }: { table: ConjugationTable }) {
  const { play, playingPath } = useClipPlayer();
  return (
    <section className="rounded-[24px] border border-white/20 bg-white/80 px-1.5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:p-5">
      <div className="mb-3 flex items-center gap-2 px-2 sm:px-1">
        <span className="rounded-xl bg-gradient-to-r from-[#c9f7d4] to-[#8fb5ff] px-3 py-1 text-[18px] font-extrabold text-[#1d1d1f]">
          {table.verb}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-medium text-[#86868b]">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            volume_up
          </span>
          Chạm vào ô để nghe
        </span>
      </div>
      <table className="w-full table-fixed border-separate border-spacing-x-0.5 border-spacing-y-0.5 sm:border-spacing-x-1">
        <colgroup>
          {/* Perfekt holds two words ("… gewesen"), so it gets the widest column. */}
          <col className="w-[19%] sm:w-[22%]" />
          <col className="w-[22%] sm:w-auto" />
          <col className="w-[33%] sm:w-auto" />
          <col className="w-[26%] sm:w-auto" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Ngôi
            </th>
            {table.tenses.map((tense) => (
              <th
                key={tense.id}
                scope="col"
                className={`rounded-xl px-0.5 py-2 text-center ${TENSE_TONE[tense.id].head}`}
              >
                <span className="block text-[11px] font-extrabold min-[380px]:text-[13px] sm:text-[16px]">{tense.label}</span>
                <span className="block text-[11px] font-medium opacity-80 sm:text-[13px]">{tense.labelVi}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.person.id} className="align-middle">
              <th scope="row" className="px-1 text-left text-[14px] leading-tight font-semibold text-[#1d1d1f] min-[380px]:text-[15px] sm:text-[18px]">
                {wrappable(row.person.label)}
              </th>
              {table.tenses.map((tense) => {
                const cell = row.cells[tense.id];
                return (
                  <td key={tense.id}>
                    <CellButton
                      cell={cell}
                      tense={tense.id}
                      personLabel={row.person.label}
                      playing={cell.audioPath !== null && cell.audioPath === playingPath}
                      onPlay={play}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
