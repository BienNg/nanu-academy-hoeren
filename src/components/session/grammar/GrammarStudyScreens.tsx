"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { GrammarTense, PrepTone, StudyExample, TenseTables } from "@/lib/grammar-lessons";
import {
  STUDY_TABLE_TENSES,
  type GrammarStudyScreen,
  type StudyCue,
  type StudyTableCell,
} from "@/lib/grammar-node";
import { FOCUS_RING } from "@/lib/keyboard";
import { Emphasize, HighlightedForm, PhraseRow, PREP_TONE, TENSE_TONE, useClipPlayer } from "@/components/session/grammar/grammar-ui";

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

/** A Vietnamese line with its marked word in the tense or preposition color. */
export function CueText({ cue }: { cue: StudyCue }) {
  const markClass = cue.tone
    ? `font-extrabold ${PREP_TONE[cue.tone].text}`
    : cue.tense
      ? `font-extrabold ${TENSE_TONE[cue.tense].label}`
      : "font-extrabold text-[#1d1d1f]";
  return <Emphasize text={cue.vi} terms={cue.markerVi ? [cue.markerVi] : []} markClass={markClass} />;
}

/**
 * Slides in the piece a step adds. The card around it stays put.
 * `fresh` is only the forward step that introduces this piece.
 */
function Reveal({
  fresh,
  children,
  className,
  style,
  as = "div",
}: {
  fresh: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "li";
}) {
  const reduceMotion = useReducedMotion();
  const Tag = as;
  const piece = fresh && !reduceMotion ? "study-piece-in" : "";
  return (
    <Tag className={[className, piece].filter(Boolean).join(" ") || undefined} style={style}>
      {children}
    </Tag>
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

function KnownScreen({
  screen,
  tables,
  reveal,
}: {
  screen: Extract<ReadScreen, { kind: "known" }>;
  tables: TenseTables;
  reveal: boolean;
}) {
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
                  <Reveal key={screen.callout ? "circled" : "plain"} fresh={reveal && screen.callout}>
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
                    </Reveal>
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
        <Reveal
          key="callout"
          fresh={reveal}
          className="rounded-2xl border-2 border-b-4 border-[#84d8ff] bg-[#ddf4ff] px-4 py-3 text-center text-[16px] font-bold text-[#0066cc]"
        >
          Das lernen wir heute. – Hôm nay học <span aria-hidden="true">🤙</span>
        </Reveal>
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
  wir: "Wir",
  "sie/Sie": "sie/Sie",
};

/** Step 1 pronouns, 2 Präsens, 3 Perfekt, 4 a question mark, 5 Präteritum. */
function TableScreen({
  screen,
  tables,
  reveal,
}: {
  screen: Extract<ReadScreen, { kind: "table" }>;
  tables: TenseTables;
  reveal: boolean;
}) {
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
                  fresh={reveal && tense === freshTense}
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
              key="question"
              fresh={reveal}
              className="flex items-center justify-center text-[72px] font-black leading-none text-[#c364e0] sm:text-[96px]"
              style={{ gridRow: `2 / span ${screen.rows.length}`, gridColumn: column("praeteritum") }}
            >
              <span aria-label="Präteritum: ?">?</span>
            </Reveal>
          ) : null}
      </div>
      </section>
      {step >= 2 ? (
          <Reveal key="listen" fresh={reveal && step === 2} className="text-center text-[13px] font-medium text-[#86868b]">
            Chạm vào từng từ để nghe.
          </Reveal>
      ) : null}
    </div>
  );
}

function BeispieleScreen({
  screen,
  tables,
  reveal,
}: {
  screen: Extract<ReadScreen, { kind: "beispiele" }>;
  tables: TenseTables;
  reveal: boolean;
}) {
  const { play, playAll, playingPath } = useClipPlayer();
  const heard = useRef(0);
  useEffect(() => {
    let committed = false;
    const frame = requestAnimationFrame(() => {
      committed = true;
    });
    const previous = heard.current;
    if (screen.shown <= previous) {
      heard.current = screen.shown;
      return () => cancelAnimationFrame(frame);
    }
    const added = screen.rows.slice(previous, screen.shown);
    heard.current = screen.shown;
    const paths = added.flatMap((row) => (row.audioPath ? [row.audioPath] : []));
    if (paths.length > 0) playAll(paths);
    return () => {
      cancelAnimationFrame(frame);
      if (!committed) heard.current = previous;
    };
  }, [playAll, screen.rows, screen.shown]);
  return (
    <div className="flex flex-col gap-4">
      <PromptCard icon="forum" eyebrow="Beispiele" title="Ví dụ" />
      <ul className="flex flex-col gap-4">
        {screen.rows.slice(0, screen.shown).map((row: StudyExample, index) => {
          const verbMark = row.tense
            ? `font-extrabold ${TENSE_TONE[row.tense].label}`
            : row.tone
              ? `font-extrabold ${PREP_TONE[row.tone].text}`
              : "font-extrabold text-[#1d1d1f]";
          return (
              <Reveal
                key={`${row.tense ?? row.tone ?? "line"}-${row.de}`}
                as="li"
                fresh={reveal && index === screen.newest && index > 0}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  {row.tense ? (
                    <span className={`rounded-lg px-2.5 py-1 text-[13px] font-extrabold ${TENSE_TONE[row.tense].head}`}>
                      {tenseMeta(tables, row.tense).label}
                    </span>
                  ) : null}
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
                      <Emphasize text={row.de} terms={row.verbWords} markClass={verbMark} />
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
          );
        })}
      </ul>
    </div>
  );
}

/** A chunky white tile, the same shape as the practice phrase rows. */
const TILE = "rounded-2xl border-2 border-b-4 border-[#e5e5ea] bg-white";

/** Highlights one copy of `mark`. `end` picks the last copy, for "một năm" at the end of a line. */
function MarkedLine({
  text,
  mark,
  tone,
  at = "start",
}: {
  text: string;
  mark?: string;
  tone?: PrepTone;
  at?: "start" | "end";
}) {
  if (!mark || !tone) return <>{text}</>;
  const haystack = text.toLowerCase();
  const needle = mark.toLowerCase();
  const index = at === "end" ? haystack.lastIndexOf(needle) : haystack.indexOf(needle);
  if (index < 0) return <>{text}</>;
  const markClass = ["font-extrabold underline decoration-[3px] underline-offset-[5px]", PREP_TONE[tone].text].join(" ");
  return (
    <>
      {text.slice(0, index)}
      <strong className={markClass}>{text.slice(index, index + mark.length)}</strong>
      {text.slice(index + mark.length)}
    </>
  );
}

/** A short prompt bubble, only as wide as its words, so a phone does not show an empty card. */
function SpeechPrompt({ icon, eyebrow, title }: { icon: string; eyebrow: string; title: string }) {
  return (
    <div className="flex items-end gap-3">
      <div className={`${TILE} flex h-12 w-12 shrink-0 items-center justify-center text-[#1cb0f6]`}>
        <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className={`${TILE} min-w-0 px-4 py-3`}>
        <p className="text-[12px] font-extrabold tracking-wide text-[#1cb0f6] uppercase">{eyebrow}</p>
        <h1 className="text-[18px] leading-snug font-extrabold text-balance text-[#3c3c3c]">{title}</h1>
      </div>
    </div>
  );
}

function HookScreen({ screen, reveal }: { screen: Extract<ReadScreen, { kind: "hook" }>; reveal: boolean }) {
  return (
    <div className="flex w-full flex-col gap-3">
      <SpeechPrompt icon="chat" eyebrow="Ngữ pháp mới" title={screen.title} />
      <ul className="flex flex-col gap-3">
        {screen.lines.slice(0, screen.shown).map((line, index) => (
          <Reveal key={line.text} as="li" fresh={reveal && index === screen.newest}>
            <div className={`${TILE} px-4 py-3 text-[16px] leading-snug font-bold text-[#3c3c3c]`}>
              <MarkedLine text={line.text} mark={line.mark} tone={line.tone} at={line.markAt} />
            </div>
          </Reveal>
        ))}
      </ul>
      {screen.callout ? (
        <Reveal fresh={reveal} className={`${TILE} px-4 py-3 text-[16px] leading-snug font-extrabold text-[#3c3c3c]`}>
          Bây giờ chúng ta học.
        </Reveal>
      ) : null}
    </div>
  );
}

/** Past sits above "jetzt", future below, so the line reads on a phone without sideways scrolling. */
const TIMELINE_BEFORE: readonly PrepTone[] = ["vor", "seit"];
const TIMELINE_AFTER: readonly PrepTone[] = ["in", "in-spaeter", "fuer"];

function TimelineMarkRow({
  mark,
  fresh,
}: {
  mark: { id: PrepTone; label: string; note: string };
  fresh: boolean;
}) {
  const tone = PREP_TONE[mark.id];
  return (
    <Reveal fresh={fresh} className={`${TILE} px-4 py-2.5`}>
      <p className={["text-[16px] leading-snug font-extrabold", tone.text].join(" ")}>{mark.label}</p>
      <p className="mt-1 text-[14px] leading-snug font-medium whitespace-pre-line text-[#3c3c3c]">{mark.note}</p>
    </Reveal>
  );
}

function TimelineScreen({
  screen,
  reveal,
}: {
  screen: Extract<ReadScreen, { kind: "timeline" }>;
  reveal: boolean;
}) {
  const byId = new Map(screen.marks.map((mark) => [mark.id, mark]));
  const row = (id: PrepTone) => {
    if (!screen.shown.includes(id)) return null;
    const mark = byId.get(id);
    if (!mark) return null;
    return <TimelineMarkRow key={id} mark={mark} fresh={reveal && screen.newest === id} />;
  };
  return (
    <div className="flex w-full flex-col gap-3">
      <SpeechPrompt icon="schedule" eyebrow="Ngữ pháp mới" title={screen.title} />
      <div className="flex flex-col gap-2 pb-2">
        {TIMELINE_BEFORE.map(row)}
        <p className={`${TILE} px-4 py-3 text-center text-[16px] leading-snug font-extrabold text-[#3c3c3c]`}>
          jetzt · heute · 10Uhr
        </p>
        {TIMELINE_AFTER.map(row)}
      </div>
    </div>
  );
}

function GlossScreen({ screen }: { screen: Extract<ReadScreen, { kind: "gloss" }> }) {
  const tone = PREP_TONE[screen.tone];
  return (
    <div className="flex w-full flex-col gap-3">
      <SpeechPrompt icon="menu_book" eyebrow="Beispiele" title={screen.label} />
      <ul className="flex flex-col gap-2">
        {screen.pairs.map((pair) => (
          <li key={pair.de} className={`${TILE} px-4 py-3`}>
            <p className={["text-[17px] leading-snug font-extrabold", tone.text].join(" ")}>
              <Emphasize
                text={pair.de}
                terms={pair.markDe ? [pair.markDe] : []}
                markClass="underline decoration-[3px] underline-offset-[5px]"
              />
            </p>
            <p className="mt-1 text-[16px] leading-snug font-semibold text-[#3c3c3c]">
              <Emphasize text={pair.vi} terms={pair.markVi ? [pair.markVi] : []} markClass={["font-extrabold", tone.text].join(" ")} />
            </p>
          </li>
        ))}
      </ul>
      {screen.aside ? (
        <p className="rounded-2xl border-2 border-b-4 border-[#ffd900] bg-[#fff4cc] px-4 py-3 text-[15px] leading-snug font-bold text-[#3c3c3c]">
          {screen.aside}
        </p>
      ) : null}
      {screen.sentence ? (
        <section className={`${TILE} px-4 py-3`}>
          <p className="text-[16px] leading-snug font-semibold text-[#3c3c3c]">{screen.sentence.vi}</p>
          <p className={["mt-1 text-[18px] leading-snug font-extrabold", tone.text].join(" ")}>
            <Emphasize
              text={screen.sentence.de}
              terms={[screen.sentence.mark]}
              markClass="underline decoration-[3px] underline-offset-[5px]"
            />
          </p>
          {screen.sentence.note ? <p className="mt-2 text-[14px] leading-snug font-medium text-[#3c3c3c]">{screen.sentence.note}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

/** Every study screen that is read, then continued. `reveal` slides in only a step's new piece. */
export function GrammarReadScreen({
  screen,
  tables,
  reveal,
}: {
  screen: ReadScreen;
  tables: TenseTables;
  reveal: boolean;
}) {
  switch (screen.kind) {
    case "overview":
      return <OverviewScreen tables={tables} />;
    case "known":
      return <KnownScreen screen={screen} tables={tables} reveal={reveal} />;
    case "table":
      return <TableScreen screen={screen} tables={tables} reveal={reveal} />;
    case "beispiele":
      return <BeispieleScreen screen={screen} tables={tables} reveal={reveal} />;
    case "hook":
      return <HookScreen screen={screen} reveal={reveal} />;
    case "timeline":
      return <TimelineScreen screen={screen} reveal={reveal} />;
    case "gloss":
      return <GlossScreen screen={screen} />;
  }
}
