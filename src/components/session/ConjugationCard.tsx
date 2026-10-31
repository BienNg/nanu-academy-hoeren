"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Howl } from "howler";
import type { SessionClip } from "@/lib/content";
import type { ConjugationRow, ConjugationSegment } from "@/lib/conjugation";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";
import { FOCUS_RING } from "@/lib/keyboard";

const SPECIAL_CHARS = ["ä", "ö", "ü", "ß"] as const;

const SEGMENT_CLASS: Record<ConjugationSegment["tone"], string> = {
  stem: "",
  change: "rounded-[5px] bg-[#ff9500]/15 px-px text-[#c75c00]",
  ending: "text-[#0066cc]",
};

function MaterialIcon({ name, className, filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/** Plays one row at a time, or every row in order. */
function useRowPlayer(rows: readonly ConjugationRow[]) {
  const howlRef = useRef<Howl | null>(null);
  const runRef = useRef(0);
  const [playing, setPlaying] = useState<number | null>(null);

  const stop = () => {
    runRef.current += 1;
    howlRef.current?.unload();
    howlRef.current = null;
    setPlaying(null);
  };

  useEffect(() => stop, []);

  const playFrom = (index: number, chain: boolean) => {
    const run = ++runRef.current;
    howlRef.current?.unload();
    const path = rows[index]?.audioPath;
    if (!path) {
      howlRef.current = null;
      setPlaying(null);
      return;
    }
    const next = () => {
      if (runRef.current !== run) return;
      const following = rows.findIndex((row, at) => at > index && row.audioPath !== null);
      if (chain && following >= 0) playFrom(following, true);
      else setPlaying(null);
    };
    const howl = createClipHowl(resolveAudioUrl(path), 1, { onEnd: next });
    howlRef.current = howl;
    setPlaying(index);
    howl.play();
  };

  return {
    playing,
    canPlayAll: rows.some((row) => row.audioPath !== null),
    toggleRow: (index: number) => (playing === index ? stop() : playFrom(index, false)),
    playAll: () => {
      const first = rows.findIndex((row) => row.audioPath !== null);
      if (playing !== null) stop();
      else if (first >= 0) playFrom(first, true);
    },
  };
}

function FormText({ segments }: { segments: readonly ConjugationSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index} className={SEGMENT_CLASS[segment.tone]}>
          {segment.text}
        </span>
      ))}
    </>
  );
}

function CardHeader({ clip, badge }: { clip: SessionClip; badge?: ReactNode }) {
  return (
    <>
      {badge}
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-bold uppercase tracking-wider text-[#86868b]">Chia động từ</span>
        <p className="text-[26px] font-bold leading-tight text-[#1d1d1f]">{clip.script}</p>
        {clip.translationVi ? <p className="text-[15px] italic text-[#86868b]">“{clip.translationVi}”</p> : null}
      </div>
    </>
  );
}

/** Study face: the forms of the verb, tap a row to hear it. */
export function ConjugationStudyCard({ clip, badge }: { clip: SessionClip; badge?: ReactNode }) {
  const rows = clip.conjugation ?? [];
  const player = useRowPlayer(rows);
  return (
    <div className="flex w-full flex-col gap-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
      <CardHeader clip={clip} badge={badge} />
      <ul className="overflow-hidden rounded-[16px] border border-black/[0.05] bg-[#f5f5f7]/80">
        {rows.map((row, index) => {
          const isPlaying = player.playing === index;
          const label = `${row.person} ${row.form}`;
          return (
            <li key={row.person} className={index < rows.length - 1 ? "border-b border-black/[0.05]" : undefined}>
              <button
                type="button"
                disabled={row.audioPath === null}
                onClick={() => player.toggleRow(index)}
                aria-label={isPlaying ? `Tạm dừng ${label}` : `Phát ${label}`}
                className={`grid w-full grid-cols-[5.25rem_minmax(0,1fr)_auto] min-[380px]:grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-left transition-colors enabled:hover:bg-white/70 enabled:active:bg-white ${FOCUS_RING}`}
              >
                <span className="text-[16px] font-medium text-[#86868b]">{row.person}</span>
                <span className="min-w-0 text-[19px] font-semibold text-[#1d1d1f]">
                  <FormText segments={row.segments} />
                </span>
                {row.audioPath ? (
                  <MaterialIcon
                    name={isPlaying ? "pause" : "volume_up"}
                    filled
                    className={`text-[20px] ${isPlaying ? "text-[#0066cc]" : "text-[#0066cc]/60"}`}
                  />
                ) : (
                  <span className="w-5" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#86868b]">
          <span className={`font-semibold ${SEGMENT_CLASS.ending}`}>đuôi</span>
          {rows.some((row) => row.segments.some((segment) => segment.tone === "change")) ? (
            <span className={`font-semibold ${SEGMENT_CLASS.change}`}>nguyên âm thay đổi</span>
          ) : null}
        </p>
        {player.canPlayAll ? (
          <button
            type="button"
            onClick={player.playAll}
            className={`inline-flex items-center gap-1.5 rounded-full bg-[#0066cc]/10 px-3.5 py-1.5 text-[13px] font-bold text-[#0066cc] transition-colors hover:bg-[#0066cc]/15 ${FOCUS_RING}`}
          >
            <MaterialIcon name={player.playing !== null ? "stop" : "play_arrow"} filled className="text-[18px]" />
            {player.playing !== null ? "Dừng" : "Nghe tất cả"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Recall face: type every form. `checked` holds each row's result after
 * Kiểm tra; a wrong row shows its form and is typed again.
 */
export function ConjugationRecallCard({
  clip,
  values,
  onChange,
  checked,
  onSubmit,
}: {
  clip: SessionClip;
  values: readonly string[];
  onChange: (values: string[]) => void;
  checked: readonly boolean[] | null;
  onSubmit: () => void;
}) {
  const rows = clip.conjugation ?? [];
  const player = useRowPlayer(rows);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const lastFocusedRef = useRef(0);
  const locked = (index: number) => checked?.[index] === true;

  useEffect(() => {
    const first = rows.findIndex((_, index) => checked?.[index] !== true);
    if (first >= 0) inputsRef.current[first]?.focus();
    // Focus the first open row when the card opens and after each check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  const setValue = (index: number, value: string) => {
    const next = rows.map((_, at) => values[at] ?? "");
    next[index] = value;
    onChange(next);
  };

  const insertChar = (char: string) => {
    const index = lastFocusedRef.current;
    const input = inputsRef.current[index];
    if (!input || locked(index)) return;
    const value = values[index] ?? "";
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    setValue(index, value.slice(0, start) + char + value.slice(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + char.length, start + char.length);
    });
  };

  const focusNextOpen = (index: number): boolean => {
    const next = rows.findIndex((_, at) => at > index && !locked(at));
    if (next < 0) return false;
    inputsRef.current[next]?.focus();
    return true;
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
      <CardHeader clip={clip} />
      <p className="text-[20px] font-extrabold leading-tight text-[#1d1d1f]">Gõ dạng đúng của động từ</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const result = checked?.[index];
          const isPlaying = player.playing === index;
          return (
            <li key={row.person} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 min-[380px]:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
              <label htmlFor={`${clip.id}-form-${index}`} className="text-[16px] font-medium text-[#86868b]">
                {row.person}
              </label>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="relative">
                  <input
                    ref={(node) => {
                      inputsRef.current[index] = node;
                    }}
                    id={`${clip.id}-form-${index}`}
                    value={values[index] ?? ""}
                    readOnly={locked(index)}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={() => {
                      lastFocusedRef.current = index;
                    }}
                    onChange={(event) => setValue(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (!focusNextOpen(index)) onSubmit();
                    }}
                    className={`w-full rounded-xl border-2 px-3 py-2 pr-9 text-[18px] font-semibold text-[#1d1d1f] transition-colors focus:outline-none ${
                      result === true
                        ? "border-[#34C759]/50 bg-[#34C759]/10"
                        : result === false
                          ? "border-[#ff3b30]/50 bg-[#ff3b30]/5 focus:bg-white"
                          : "border-[#e5e5ea] bg-[#f7f7f9] focus:border-[#0066cc]/50 focus:bg-white"
                    }`}
                  />
                  {result !== undefined ? (
                    <MaterialIcon
                      name={result ? "check_circle" : "cancel"}
                      filled
                      className={`pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[20px] ${
                        result ? "text-[#34C759]" : "text-[#ff3b30]"
                      }`}
                    />
                  ) : null}
                </div>
                {result === false ? (
                  <p className="text-[14px] text-[#86868b]">
                    Đáp án:{" "}
                    <span className="font-semibold text-[#1d1d1f]">
                      <FormText segments={row.segments} />
                    </span>
                  </p>
                ) : null}
              </div>
              {row.audioPath ? (
                <button
                  type="button"
                  // Keep focus in the field being typed.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => player.toggleRow(index)}
                  aria-label={isPlaying ? `Tạm dừng ${row.person}` : `Phát ${row.person}`}
                  className={`mt-1 flex h-9 w-9 items-center justify-center self-start rounded-full transition-colors min-[380px]:mt-0.5 min-[380px]:h-10 min-[380px]:w-10 ${
                    isPlaying ? "bg-[#0066cc] text-white" : "bg-[#0066cc]/10 text-[#0066cc] hover:bg-[#0066cc]/15"
                  } ${FOCUS_RING}`}
                >
                  <MaterialIcon name={isPlaying ? "pause" : "volume_up"} filled className="text-[20px]" />
                </button>
              ) : (
                <span className="w-9 min-[380px]:w-10" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pt-1">
        {SPECIAL_CHARS.map((char) => (
          <button
            key={char}
            type="button"
            // Keep focus in the field the letter goes into.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertChar(char)}
            className={`flex h-11 min-w-[40px] flex-1 select-none items-center justify-center rounded-xl border-2 border-[#e5e5ea] bg-white text-[17px] font-bold text-[#1d1d1f] shadow-[0_3px_0_#e5e5ea] transition-[translate,box-shadow,background-color] duration-100 hover:bg-[#f7f7f9] active:translate-y-[3px] active:shadow-none ${FOCUS_RING}`}
          >
            {char}
          </button>
        ))}
      </div>
    </div>
  );
}
