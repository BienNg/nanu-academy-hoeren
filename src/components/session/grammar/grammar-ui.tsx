"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Howl } from "howler";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";
import { FOCUS_RING } from "@/lib/keyboard";
import type { GrammarTense, PrepTone } from "@/lib/grammar-lessons";

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
    mark: "font-extrabold",
    soft: "bg-[#f7ebfb]",
    ring: "border-[#c364e0]",
  },
};

/** Colors of the temporal-preposition slides. */
export const PREP_TONE: Record<PrepTone, { text: string; ring: string; soft: string }> = {
  vor: { text: "text-[#e0232a]", ring: "ring-[#e0232a]", soft: "bg-[#fde8e8]" },
  seit: { text: "text-[#7a33e0]", ring: "ring-[#7a33e0]", soft: "bg-[#f4e9fc]" },
  in: { text: "text-[#0e8ea8]", ring: "ring-[#0e8ea8]", soft: "bg-[#e5f6fa]" },
  "in-spaeter": { text: "text-[#2f6bff]", ring: "ring-[#2f6bff]", soft: "bg-[#e8efff]" },
  fuer: { text: "text-[#ef6a12]", ring: "ring-[#ef6a12]", soft: "bg-[#fff0e6]" },
};

/**
 * One shared player for many short clips, so a screen of rows does not hold
 * an audio element per row. Playing a new clip stops the one before.
 */
export function useClipPlayer() {
  const howlRef = useRef<Howl | null>(null);
  const generation = useRef(0);
  const [playingPath, setPlayingPath] = useState<string | null>(null);

  useEffect(
    () => () => {
      generation.current += 1;
      howlRef.current?.unload();
      howlRef.current = null;
    },
    [],
  );

  const start = useCallback((audioPath: string, token: number, onDone: (() => void) | null) => {
    howlRef.current?.unload();
    const howl = createClipHowl(resolveAudioUrl(audioPath), 1, {
      onPlay: () => setPlayingPath(audioPath),
      onEnd: () => {
        if (generation.current !== token) return;
        setPlayingPath(null);
        onDone?.();
      },
      onStop: () => {
        if (generation.current === token) setPlayingPath(null);
      },
      onLoadError: () => {
        if (generation.current !== token) return;
        setPlayingPath(null);
        onDone?.();
      },
    });
    howlRef.current = howl;
    howl.play();
  }, []);

  const play = useCallback(
    (audioPath: string) => {
      start(audioPath, ++generation.current, null);
    },
    [start],
  );

  /** Plays each clip after the one before it. A later `play` stops the queue. */
  const playAll = useCallback(
    (audioPaths: readonly string[]) => {
      const token = ++generation.current;
      const queue = audioPaths.filter((path) => path.length > 0);
      const step = (index: number) => {
        if (generation.current !== token) return;
        const path = queue[index];
        if (!path) return;
        start(path, token, () => step(index + 1));
      };
      step(0);
    },
    [start],
  );

  return { play, playAll, playingPath };
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
