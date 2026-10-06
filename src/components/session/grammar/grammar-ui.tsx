"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Howl } from "howler";
import { ReadingPingu } from "@/components/session/Pingu";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";
import { FOCUS_RING } from "@/lib/keyboard";
import type { GrammarTense } from "@/lib/grammar-lessons";

/** Colors of the class slide: Präsens cyan, Perfekt orange, Präteritum purple. */
export const TENSE_TONE: Record<
  GrammarTense,
  { head: string; text: string; mark: string; label: string; soft: string; ring: string }
> = {
  praesens: {
    head: "bg-[#8fdbe8] text-[#0b3b44]",
    label: "text-[#007a8a]",
    text: "text-[#0b5563]",
    mark: "text-[#007a8a]",
    soft: "bg-[#e6f8fb]",
    ring: "border-[#8fdbe8]",
  },
  perfekt: {
    head: "bg-[#ff8a4c] text-[#4a1800]",
    label: "text-[#d9480f]",
    text: "text-[#7a2e00]",
    mark: "text-[#d9480f]",
    soft: "bg-[#fff1e8]",
    ring: "border-[#ff8a4c]",
  },
  praeteritum: {
    head: "bg-[#c364e0] text-white",
    label: "text-[#8a2fb0]",
    text: "text-[#5b1a73]",
    mark: "text-[#1d6ff2] underline decoration-[3px] underline-offset-[5px]",
    soft: "bg-[#f7ebfb]",
    ring: "border-[#c364e0]",
  },
};

/**
 * One shared player for many short clips, so a screen of rows does not hold
 * an audio element per row. Playing a new clip stops the one before.
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
 * A form with its highlight (an ending or the Partizip) marked. "…" stays with
 * the Partizip, so a narrow Perfekt form breaks as "hast" / "… gehabt".
 */
export function HighlightedForm({ text, highlight, markClass }: { text: string; highlight: string; markClass: string }) {
  const kept = text.replace(" … ", " … ");
  if (!highlight || !kept.endsWith(highlight)) return <>{kept}</>;
  return (
    <>
      {kept.slice(0, kept.length - highlight.length)}
      <span className={`font-extrabold ${markClass}`}>{highlight}</span>
    </>
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `text` with every German term in `terms` set in bold, so the forms stand out in Vietnamese. */
export function Emphasize({
  text,
  terms,
  markClass = "font-extrabold text-[#1d1d1f]",
}: {
  text: string;
  terms: readonly string[];
  markClass?: string;
}) {
  const words = [...new Set(terms.filter((term) => term.trim().length > 1))].sort((a, b) => b.length - a.length);
  if (words.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(?<![\\p{L}])(${words.map(escapeRegExp).join("|")})(?![\\p{L}])`, "giu");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className={markClass}>
            {part}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Pingu teaching: the mascot on the left, a speech bubble pointing at him. */
export function PinguSays({ children, size = 64 }: { children: ReactNode; size?: number }) {
  return (
    <div className="flex items-end gap-2">
      <div className="shrink-0 translate-y-1" aria-hidden="true">
        <ReadingPingu size={size} />
      </div>
      <div className="relative mb-3 min-w-0 flex-1 rounded-2xl border-2 border-[#e5e5ea] bg-white px-3.5 py-2.5 text-[14px] leading-snug text-[#3a3a3c] min-[380px]:px-4 min-[380px]:py-3 min-[380px]:text-[15px]">
        <span
          aria-hidden="true"
          className="absolute bottom-4 -left-[9px] h-4 w-4 rotate-45 border-b-2 border-l-2 border-[#e5e5ea] bg-white"
        />
        <div className="relative flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}

/** Pingu saying several things: one bubble each, like a chat, Pingu beside the last. */
export function PinguChat({ bubbles, size = 64 }: { bubbles: readonly ReactNode[]; size?: number }) {
  if (bubbles.length <= 1) return <PinguSays size={size}>{bubbles[0]}</PinguSays>;
  return (
    <div className="flex flex-col gap-2">
      {bubbles.slice(0, -1).map((bubble, index) => (
        <div
          key={index}
          className="ml-[calc(var(--pingu)+0.5rem)] rounded-2xl border-2 border-[#e5e5ea] bg-white px-3.5 py-2.5 text-[14px] leading-snug text-[#3a3a3c] min-[380px]:px-4 min-[380px]:py-3 min-[380px]:text-[15px]"
          style={{ "--pingu": `${size}px` } as React.CSSProperties}
        >
          {bubble}
        </div>
      ))}
      <PinguSays size={size}>{bubbles[bubbles.length - 1]}</PinguSays>
    </div>
  );
}

/** Where the student is in Präsens → Präteritum → Perfekt. */
export function TenseStepper({
  order,
  current,
  labels,
}: {
  order: readonly GrammarTense[];
  current: GrammarTense;
  labels: Record<GrammarTense, string>;
}) {
  const at = order.indexOf(current);
  return (
    <ol className="flex items-center gap-1.5" aria-label="Các thì">
      {order.map((tense, index) => {
        const state = index < at ? "done" : index === at ? "current" : "next";
        const tone = TENSE_TONE[tense];
        return (
          <li key={tense} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-full px-2 text-[12px] font-extrabold ${
                state === "next" ? "bg-[#f0f0f3] text-[#aeaeb2]" : tone.head
              } ${state === "current" ? "ring-2 ring-offset-2 ring-[#1d1d1f]/15" : ""}`}
            >
              {state === "done" ? (
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  check
                </span>
              ) : null}
              <span className="truncate">{labels[tense]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A tappable phrase in Duolingo's key-phrase style: a round speaker, then the
 * text. The whole row plays it. Without audio the row is plain.
 */
export function PhraseRow({
  audioPath,
  playing,
  onPlay,
  label,
  children,
}: {
  audioPath: string | null;
  playing: boolean;
  onPlay: (audioPath: string) => void;
  /** What a screen reader hears, e.g. "Nghe: du hattest". */
  label: string;
  children: ReactNode;
}) {
  const shell = `flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 bg-white px-3 py-2 text-left transition-colors [@media(max-height:700px)]:py-0.5 ${
    playing ? "border-[#1cb0f6] bg-[#ddf4ff]" : "border-[#e5e5ea]"
  }`;
  const speaker = (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full [@media(max-height:700px)]:h-8 [@media(max-height:700px)]:w-8 ${
        audioPath ? "bg-[#1cb0f6] text-white" : "bg-[#f0f0f3] text-[#c7c7cc]"
      }`}
      aria-hidden="true"
    >
      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        {playing ? "graphic_eq" : "volume_up"}
      </span>
    </span>
  );
  if (!audioPath) {
    return (
      <div className={shell}>
        {speaker}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPlay(audioPath)}
      aria-label={label}
      className={`${shell} active:translate-y-[2px] active:border-b-2 ${FOCUS_RING}`}
    >
      {speaker}
      <div className="min-w-0 flex-1">{children}</div>
    </button>
  );
}
