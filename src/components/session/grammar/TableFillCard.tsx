"use client";

import { useEffect, useState } from "react";
import { CheckBar } from "@/components/session/FeedbackSheet";
import { cardShortcutsBlocked, FOCUS_RING, isCardEnter } from "@/lib/keyboard";
import type { GrammarTense } from "@/lib/grammar-lessons";
import type { TableFillRow } from "@/lib/grammar-node";
import type { WordChip } from "@/lib/sentence-order";
import { TENSE_TONE } from "@/components/session/grammar/ConjugationTableView";

type TableFillCardProps = {
  verb: string;
  tense: GrammarTense;
  tenseLabel: string;
  rows: TableFillRow[];
  bank: WordChip[];
  onSubmit: (placed: (string | null)[]) => void;
  /** Checked: each blank shows whether it is right. */
  result?: { blanks: { correct: boolean }[] } | null;
};

/**
 * A table of one verb and tense with blanks. Tapping a chip fills the next
 * empty blank; tapping a filled blank gives its chip back. Remount via parent
 * `key` for each new card.
 */
export function TableFillCard({ verb, tense, tenseLabel, rows, bank, onSubmit, result = null }: TableFillCardProps) {
  const checked = result !== null;
  const blankCount = rows.filter((row) => row.text === null).length;
  /** Chip id in each blank, in row order. */
  const [placed, setPlaced] = useState<(string | null)[]>(() => Array.from({ length: blankCount }, () => null));
  const chipById = new Map(bank.map((chip) => [chip.id, chip]));
  const used = new Set(placed.filter((id): id is string => id !== null));
  const full = placed.every((id) => id !== null);
  const tone = TENSE_TONE[tense];

  const submit = () => {
    if (!full || checked) return;
    onSubmit(placed.map((id) => (id ? (chipById.get(id)?.text ?? null) : null)));
  };

  const place = (chipId: string) => {
    if (checked) return;
    setPlaced((current) => {
      const at = current.indexOf(null);
      if (at < 0) return current;
      const next = [...current];
      next[at] = chipId;
      return next;
    });
  };

  const clear = (blank: number) => {
    if (checked) return;
    setPlaced((current) => current.map((id, at) => (at === blank ? null : id)));
  };

  useEffect(() => {
    if (checked) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (cardShortcutsBlocked(event) || !isCardEnter(event) || !full) return;
      event.preventDefault();
      event.stopPropagation();
      submit();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  });

  /** Each row's blank number, or -1 for a filled-in row. */
  const blankOf = rows.map((row, at) =>
    row.text === null ? rows.slice(0, at).filter((earlier) => earlier.text === null).length : -1,
  );

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Điền bảng · Tabelle</span>
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-semibold tracking-tight text-[#1d1d1f]">{verb}</span>
          <span className={`rounded-lg px-2 py-0.5 text-[13px] font-bold ${tone.head}`}>{tenseLabel}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {rows.map((row, rowAt) => {
            if (row.text !== null) {
              return (
                <div key={row.personLabel} className="contents">
                  <dt className="text-[17px] font-semibold text-[#1d1d1f]">{row.personLabel}</dt>
                  <dd className={`px-3 py-2 text-[17px] font-medium ${tone.text}`}>{row.text}</dd>
                </div>
              );
            }
            const at = blankOf[rowAt]!;
            const chipId = placed[at] ?? null;
            const state = result?.blanks[at];
            const border = state
              ? state.correct
                ? "border-[#34C759] bg-[#34C759]/15 text-[#248a3d]"
                : "border-[#ff3b30] bg-[#ff3b30]/10 text-[#c4261d]"
              : chipId
                ? "border-[#0066cc] bg-[#0066cc]/10 text-[#0066cc]"
                : "border-dashed border-[#c7c7cc] bg-[#f5f5f7] text-[#aeaeb2]";
            return (
              <div key={row.personLabel} className="contents">
                <dt className="text-[17px] font-semibold text-[#1d1d1f]">{row.personLabel}</dt>
                <dd>
                  <button
                    type="button"
                    disabled={checked || !chipId}
                    onClick={() => clear(at)}
                    aria-label={chipId ? `Bỏ “${chipById.get(chipId)?.text}”` : `Ô trống cho ${row.personLabel}`}
                    className={`flex h-11 min-w-[120px] items-center rounded-xl border-2 px-3 text-[17px] font-bold ${border} ${FOCUS_RING}`}
                  >
                    {chipId ? chipById.get(chipId)?.text : "____"}
                  </button>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="mt-4 flex flex-wrap justify-center gap-2 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
        {bank.map((chip) =>
          used.has(chip.id) ? (
            <span
              key={chip.id}
              aria-hidden="true"
              className="flex h-11 items-center rounded-xl border border-transparent border-b-[3px] bg-[#e8e8ed] px-3.5 text-[17px] font-medium text-transparent select-none"
            >
              {chip.text}
            </span>
          ) : (
            <button
              key={chip.id}
              type="button"
              disabled={checked || full}
              onClick={() => place(chip.id)}
              className={`flex h-11 items-center rounded-xl border border-black/[0.08] border-b-[3px] bg-white px-3.5 text-[17px] font-medium text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#f5f5f7] active:translate-y-[1px] active:border-b disabled:opacity-60 ${FOCUS_RING}`}
            >
              {chip.text}
            </button>
          ),
        )}
      </section>

      {checked ? null : <CheckBar disabled={!full} onClick={submit} />}
    </>
  );
}
