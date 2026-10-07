"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import type { GrammarTense, StudyExample, TenseTables } from "@/lib/grammar-lessons";
import {
  STUDY_TABLE_TENSES,
  type GrammarStudyScreen,
  type StudyCue,
  type StudyTableCell,
} from "@/lib/grammar-node";
import { FOCUS_RING } from "@/lib/keyboard";
import { Emphasize, HighlightedForm, PhraseRow, TENSE_TONE, useClipPlayer } from "@/components/session/grammar/grammar-ui";

type ReadScreen = Exclude<GrammarStudyScreen, { kind: "choice" | "translate" }>;

/** When each past tense is used, as on the class slide. */
const TENSE_USE: Partial<Record<GrammarTense, { icon: string; de: string; vi: string }>> = {
  perfekt: { icon: "campaign", de: "Umgangssprachlich", vi: "dùng trong văn nói nhiều" },
  praeteritum: { icon: "edit", de: "schriftlich", vi: "dùng trong văn viết nhiều" },
};

function tenseMeta(tables: TenseTables, tense: GrammarTense): { label: string; labelVi: string } {
  const meta = tables.tenses.find((entry) => entry.id === tense);
  return { label: meta?.label ?? tense, labelVi: meta?.labelVi ?? "" };
}

/** Same white card as the practice exercises. */
const CARD =
  "rounded-[24px] border border-white/20 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl";

/** Prompt row shared with multiple choice: a blue icon, a small label, the title. */
function PromptCard({ icon, eyebrow, title }: { icon: string; eyebrow: string; title: string }) {
  return (
    <section className={`${CARD} flex items-center gap-3 p-5 md:p-6`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-wide text-[#0066cc]">{eyebrow}</p>
        <h1 className="text-[20px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">{title}</h1>
      </div>
    </section>
  );
}

/** The slides' tense box: the German name over its Vietnamese meaning. */
function TensePill({ tables, tense, compact = false }: { tables: TenseTables; tense: GrammarTense; compact?: boolean }) {
  const { label, labelVi } = tenseMeta(tables, tense);
  return (
    <span
      className={`flex w-full min-w-0 flex-col items-center justify-center rounded-xl text-center shadow-[0_3px_0_rgba(0,0,0,0.12)] ${TENSE_TONE[tense].head} ${
        compact ? "px-0.5 py-1.5" : "px-3 py-2"
      }`}
    >
      <span className={`max-w-full truncate font-extrabold ${compact ? "text-[11px] min-[360px]:text-[12px]" : "text-[16px]"}`}>
        {label}
      </span>
      <span className={`max-w-full truncate ${compact ? "text-[10px] min-[360px]:text-[11px]" : "text-[13px]"}`}>{labelVi}</span>
    </span>
  );
}

/** A Vietnamese line with its tense word in the tense's color. */
export function CueText({ cue }: { cue: StudyCue }) {
  return (
    <Emphasize
      text={cue.vi}
      terms={cue.markerVi ? [cue.markerVi] : []}
      markClass={`font-extrabold ${TENSE_TONE[cue.tense].label}`}
    />
  );
}

/** Fades in the part a step adds; the rest of the screen stays still. */
function Reveal({
  fresh,
  children,
  className,
  style,
}: {
  fresh: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  if (!fresh || reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.7 }}
    >
      {children}
    </motion.div>
  );
}

function OverviewScreen({ tables }: { tables: TenseTables }) {
  return (
    <div className="flex flex-col gap-4">
      <PromptCard icon="school" eyebrow="Ngữ pháp mới" title="Vergangenheit – Quá khứ" />
      <ul className="flex flex-col gap-3">
        {STUDY_TABLE_TENSES.map((tense) => {
          const use = TENSE_USE[tense];
          const { label, labelVi } = tenseMeta(tables, tense);
          return (
            <li key={tense} className={`overflow-hidden rounded-2xl border-2 border-b-4 bg-white ${TENSE_TONE[tense].ring}`}>
              <div className={`flex items-baseline justify-between gap-3 px-4 py-3 ${TENSE_TONE[tense].head}`}>
                <span className="text-[16px] font-extrabold">{label}</span>
                <span className="text-[14px]">{labelVi}</span>
              </div>
              {use ? (
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className={`material-symbols-outlined text-[26px] ${TENSE_TONE[tense].label}`} aria-hidden="true">
                    {use.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[16px] font-bold text-[#1d1d1f]">{use.de}</span>
                    <span className="block text-[14px] italic leading-snug text-[#3a3a3c]">{use.vi}</span>
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function KnownScreen({ screen, tables }: { screen: Extract<ReadScreen, { kind: "known" }>; tables: TenseTables }) {
  return (
    <div className="flex flex-col gap-4">
      <PromptCard icon="lightbulb" eyebrow="Bạn đã biết" title="Vergangenheit – Quá khứ" />
      <section className={`${CARD} p-4 md:p-5`}>
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-3">
          {STUDY_TABLE_TENSES.map((tense) => (
            <TensePill key={tense} tables={tables} tense={tense} compact />
          ))}
          {screen.rows.map((row, index) => (
            <div key={row.praesens} className="contents">
              {index > 0 ? <div className="col-span-3 h-px bg-black/[0.06]" style={{ gridColumn: "1 / -1" }} /> : null}
              <span className="text-[16px] font-semibold text-[#1d1d1f]">{row.praesens}</span>
              <span className={`text-[15px] font-semibold ${TENSE_TONE.perfekt.text}`}>{row.perfekt}</span>
              {row.today ? (
                <span className="flex justify-center">
                  <span
                    className={
                      screen.callout
                        ? "flex h-11 w-11 items-center justify-center rounded-full border-2 border-b-4 border-[#9a3ec0] bg-[#f7ebfb] text-[22px] font-black text-[#8a2fb0]"
                        : "text-[28px] font-black leading-none text-[#8a2fb0]"
                    }
                    aria-label="Hôm nay học"
                  >
                    ?
                  </span>
                </span>
              ) : (
                <span className="rounded-xl bg-[#f5f5f7] px-1.5 py-1 text-center text-[12px] font-medium leading-snug text-[#86868b]">
                  noch nicht gelernt – chưa học
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
      {screen.callout ? (
        <p className="rounded-2xl border-2 border-b-4 border-[#84d8ff] bg-[#ddf4ff] px-4 py-3 text-center text-[16px] font-bold text-[#0066cc]">
          Das lernen wir heute. – Hôm nay học <span aria-hidden="true">🤙</span>
        </p>
      ) : null}
    </div>
  );
}

function TableCell({
  cell,
  tense,
  playing,
  onPlay,
}: {
  cell: StudyTableCell;
  tense: GrammarTense;
  playing: boolean;
  onPlay: (audioPath: string) => void;
}) {
  const tone = TENSE_TONE[tense];
  const text = (
    // Präteritum stems stay light so the bold ending stands out, as on the slides.
    <span
      className={`text-[16px] leading-tight min-[380px]:text-[17px] ${tense === "praeteritum" ? "font-medium" : "font-bold"} ${tone.text}`}
    >
      <HighlightedForm text={cell.text} highlight={cell.highlight} markClass={tone.mark} />
    </span>
  );
  if (!cell.audioPath) return <span className="block px-1.5 py-1.5">{text}</span>;
  const audioPath = cell.audioPath;
  return (
    <button
      type="button"
      onClick={() => onPlay(audioPath)}
      aria-label={`Nghe: ${cell.spoken}`}
      className={`block w-full rounded-xl px-1.5 py-1.5 text-left transition-colors ${
        playing ? "bg-[#ddf4ff]" : "hover:bg-[#f5f5f7] active:bg-[#f0f0f3]"
      } ${FOCUS_RING}`}
    >
      {text}
    </button>
  );
}

/** Slide labels. The table data stores them in lowercase. */
const SLIDE_PERSON: Record<string, string> = {
  ich: "Ich",
  du: "Du",
  "er/sie/es": "Er/Sie/Es",
  ihr: "Ihr",
  // Spaced as on the slide, so it wraps on a narrow phone.
  "wir/sie/Sie": "Wir/ sie/ Sie",
};

/** Step 1 pronouns, 2 Präsens, 3 Perfekt, 4 a question mark, 5 Präteritum. */
function TableScreen({ screen, tables }: { screen: Extract<ReadScreen, { kind: "table" }>; tables: TenseTables }) {
  const { play, playingPath } = useClipPlayer();
  const { step } = screen;
  const shown: Record<GrammarTense, boolean> = { praesens: step >= 2, perfekt: step >= 3, praeteritum: step >= 5 };
  const freshTense: GrammarTense | null = step === 2 ? "praesens" : step === 3 ? "perfekt" : step === 5 ? "praeteritum" : null;
  const column = (tense: GrammarTense) => STUDY_TABLE_TENSES.indexOf(tense) + 2;
  return (
    <div className="flex flex-col gap-4">
      <PromptCard icon="table_chart" eyebrow="Chia thì" title={screen.verb} />
      <section className={`${CARD} p-3 sm:p-5`}>
      <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1.5">
        {STUDY_TABLE_TENSES.map((tense) => (
          <div key={tense} style={{ gridRow: 1, gridColumn: column(tense) }} className="flex">
            <TensePill tables={tables} tense={tense} compact />
          </div>
        ))}
        {screen.rows.map((row, index) => (
          <div key={row.personLabel} className="contents">
            <span
              style={{ gridRow: index + 2, gridColumn: 1 }}
              className="py-1.5 text-[15px] font-semibold text-[#3a3a3c] min-[380px]:text-[16px]"
            >
              {SLIDE_PERSON[row.personLabel] ?? row.personLabel}
            </span>
            {STUDY_TABLE_TENSES.filter((tense) => shown[tense]).map((tense) => (
              <Reveal
                key={tense}
                fresh={tense === freshTense}
                className="min-w-0"
                style={{ gridRow: index + 2, gridColumn: column(tense) }}
              >
                <TableCell
                  cell={row.cells[tense]}
                  tense={tense}
                  playing={row.cells[tense].audioPath !== null && playingPath === row.cells[tense].audioPath}
                  onPlay={play}
                />
              </Reveal>
            ))}
          </div>
        ))}
        {step === 4 ? (
          <Reveal
            fresh
            className="flex items-center justify-center text-[72px] font-black leading-none text-[#c364e0] sm:text-[96px]"
            style={{ gridRow: `2 / span ${screen.rows.length}`, gridColumn: column("praeteritum") }}
          >
            <span aria-label="Präteritum: ?">?</span>
          </Reveal>
        ) : null}
      </div>
      </section>
      {step >= 2 ? <p className="text-center text-[13px] font-medium text-[#86868b]">Chạm vào từng từ để nghe.</p> : null}
    </div>
  );
}

function BeispieleScreen({ screen, tables }: { screen: Extract<ReadScreen, { kind: "beispiele" }>; tables: TenseTables }) {
  const { play, playingPath } = useClipPlayer();
  return (
    <div className="flex flex-col gap-4">
      <PromptCard icon="forum" eyebrow="Beispiele" title="Ví dụ" />
      <ul className="flex flex-col gap-4">
        {screen.rows.slice(0, screen.shown).map((row: StudyExample, index) => {
          const tone = TENSE_TONE[row.tense];
          return (
            <li key={`${row.tense}-${row.de}`}>
              <Reveal fresh={index === screen.newest && index > 0} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-[13px] font-extrabold ${tone.head}`}>
                    {tenseMeta(tables, row.tense).label}
                  </span>
                  <span className="text-[16px] text-[#3a3a3c]">
                    <CueText cue={row} />
                  </span>
                </div>
                <PhraseRow
                  audioPath={row.audioPath}
                  playing={row.audioPath !== null && playingPath === row.audioPath}
                  onPlay={play}
                  label={`Nghe: ${row.de}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[18px] font-semibold leading-snug text-[#1d1d1f]">
                      <Emphasize text={row.de} terms={row.verbWords} markClass={`font-extrabold ${tone.label}`} />
                    </span>
                    {row.tense === "praeteritum" ? (
                      <span
                        className="material-symbols-outlined shrink-0 text-[24px] text-[#34C759]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-label="Präteritum"
                      >
                        check_circle
                      </span>
                    ) : null}
                  </span>
                </PhraseRow>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Every study screen that is read, then continued. */
export function GrammarReadScreen({ screen, tables }: { screen: ReadScreen; tables: TenseTables }) {
  switch (screen.kind) {
    case "overview":
      return <OverviewScreen tables={tables} />;
    case "known":
      return <KnownScreen screen={screen} tables={tables} />;
    case "table":
      return <TableScreen screen={screen} tables={tables} />;
    case "beispiele":
      return <BeispieleScreen screen={screen} tables={tables} />;
  }
}
