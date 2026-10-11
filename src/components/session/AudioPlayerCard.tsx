"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { Howl } from "howler";
import turtleIcon from "./slow-turtle.png";
import {
  createClipHowl,
  NORMAL_PLAYBACK_RATE,
  resolveAudioUrl,
  SLOW_PLAYBACK_RATE,
  type PlaybackRate,
} from "@/lib/audio";
import {
  killWaveformAnimations,
  pulseWaveformPlayhead,
  resetWaveformIdle,
  setWaveformFinished,
  setWaveformProgress,
  WAVEFORM_BAR_HEIGHTS_PX,
} from "@/lib/animations";
import {
  cardShortcutsBlocked,
  enterOwnedByTarget,
  FOCUS_RING,
  hasModifier,
  isTextEntry,
} from "@/lib/keyboard";

export type AudioPlayerVisualState = "idle" | "playing" | "finished";

type AudioPlayerCardProps = {
  audioPath: string;
};

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
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

function TurtleIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block bg-current ${className ?? ""}`}
      style={{
        aspectRatio: `${turtleIcon.width} / ${turtleIcon.height}`,
        maskImage: `url("${turtleIcon.src}")`,
        WebkitMaskImage: `url("${turtleIcon.src}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

const SLOW_BUTTON =
  "flex h-12 shrink-0 items-center justify-center rounded-full bg-[#0066cc] px-3 text-white shadow-[0_4px_0_#004c99] transition-[translate,box-shadow,filter] duration-100 hover:brightness-110 active:translate-y-1 active:shadow-none [@media(max-height:760px)]:h-10 [@media(max-height:760px)]:px-2.5 [@media(max-height:760px)]:shadow-[0_3px_0_#004c99] [@media(max-height:760px)]:active:translate-y-[3px]";

/** Ctrl+Space is Duolingo's replay key; Ctrl+Enter covers macOS, where Ctrl+Space switches input source. */
const REPLAY_KEYS = "Control+Space Control+Enter Space";

function isReplayKey(event: KeyboardEvent): boolean {
  if (cardShortcutsBlocked(event) || event.shiftKey || event.altKey || event.metaKey) return false;
  if (event.ctrlKey) return event.code === "Space" || event.key === "Enter";
  // Plain Space only when it would otherwise scroll the page.
  return (
    event.code === "Space" &&
    !hasModifier(event) &&
    !isTextEntry(event.target) &&
    !enterOwnedByTarget(event.target)
  );
}

/**
 * Remount this component (via `key={clipId}`) when the active clip changes.
 * Space plays or pauses; Ctrl+Space or Ctrl+Enter does too while typing.
 */
export function AudioPlayerCard({ audioPath }: AudioPlayerCardProps) {
  const howlRef = useRef<Howl | null>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const pulseCleanupRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  const [visualState, setVisualState] =
    useState<AudioPlayerVisualState>("idle");
  const [rate, setRate] = useState<PlaybackRate>(NORMAL_PLAYBACK_RATE);

  const getBars = useCallback(
    () =>
      barsRef.current.filter((bar): bar is HTMLSpanElement => Boolean(bar)),
    [],
  );

  const paintProgress = useCallback(
    (progress: number, playing: boolean) => {
      const bars = getBars();
      if (bars.length === 0) return;
      setWaveformProgress(bars, progress);
      pulseCleanupRef.current?.();
      pulseCleanupRef.current = null;
      if (playing) {
        pulseCleanupRef.current = pulseWaveformPlayhead(bars, progress);
      }
    },
    [getBars],
  );

  useEffect(() => {
    const bars = getBars();
    killWaveformAnimations(bars);
    resetWaveformIdle(bars);

    const stopLocalRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const stopLocalPulse = () => {
      pulseCleanupRef.current?.();
      pulseCleanupRef.current = null;
    };

    const tick = () => {
      const active = howlRef.current;
      if (!active || !active.playing()) {
        stopLocalRaf();
        return;
      }
      const seek = active.seek() as number;
      const total = active.duration() || 1;
      paintProgress(seek / total, true);
      rafRef.current = requestAnimationFrame(tick);
    };

    const howl = createClipHowl(resolveAudioUrl(audioPath), 1, {
      onPlay: () => {
        setVisualState("playing");
        stopLocalRaf();
        rafRef.current = requestAnimationFrame(tick);
      },
      onPause: () => {
        stopLocalRaf();
        stopLocalPulse();
        const seek = howl.seek() as number;
        const total = howl.duration() || 1;
        paintProgress(seek / total, false);
        setVisualState("idle");
      },
      onStop: () => {
        stopLocalRaf();
        stopLocalPulse();
      },
      onEnd: () => {
        stopLocalRaf();
        stopLocalPulse();
        setWaveformFinished(getBars());
        setVisualState("finished");
      },
    });

    howlRef.current = howl;
    // Auto-play when the page or a new question loads (component remounts via key).
    // Browsers may block this without a prior user gesture; UI stays idle if so.
    howl.play();

    return () => {
      stopLocalRaf();
      stopLocalPulse();
      howl.unload();
      howlRef.current = null;
    };
  }, [audioPath, getBars, paintProgress]);

  useEffect(() => {
    howlRef.current?.rate(rate);
  }, [rate]);

  const playAt = (nextRate: PlaybackRate, fromStart: boolean) => {
    const howl = howlRef.current;
    if (!howl) return;

    setRate(nextRate);
    howl.rate(nextRate);
    if (fromStart || visualState === "finished") {
      howl.seek(0);
      resetWaveformIdle(getBars());
    }
    if (!howl.playing()) howl.play();
  };

  const handlePlayPause = () => {
    const howl = howlRef.current;
    if (!howl) return;

    if (visualState === "playing") {
      howl.pause();
      return;
    }

    playAt(NORMAL_PLAYBACK_RATE, false);
  };

  const handleSlowPlay = () => {
    const howl = howlRef.current;
    if (!howl) return;

    if (visualState === "playing" && rate === SLOW_PLAYBACK_RATE) {
      howl.pause();
      return;
    }

    playAt(SLOW_PLAYBACK_RATE, true);
  };

  const onReplayKey = useEffectEvent(handlePlayPause);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isReplayKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onReplayKey();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const isPlaying = visualState === "playing";
  const slowPlaying = isPlaying && rate === SLOW_PLAYBACK_RATE;

  return (
    <section className="mt-2 flex flex-col items-center gap-3 [@media(max-height:760px)]:mt-1 [@media(max-height:760px)]:gap-2">
      <button
        type="button"
        aria-label="Dạng sóng âm thanh — chạm để phát hoặc tạm dừng"
        // The big play button below is the keyboard stop for the same action.
        tabIndex={-1}
        onClick={handlePlayPause}
        className="flex h-[76px] w-full items-center justify-between gap-1 overflow-hidden rounded-full border-2 border-[#e5e5ea] bg-white px-6 transition-colors hover:bg-[#fafafa] [@media(max-height:760px)]:h-14 [@media(max-height:760px)]:px-4"
      >
        {WAVEFORM_BAR_HEIGHTS_PX.map((height, index) => (
          <span
            key={`bar-${index}`}
            ref={(el) => {
              barsRef.current[index] = el;
            }}
            className="block w-[6px] shrink-0 rounded-full bg-[#e5e5ea] transition-colors duration-150"
            style={{ height }}
          />
        ))}
      </button>

      <div className="flex items-center justify-center gap-3">
        <span className={`invisible ${SLOW_BUTTON}`} aria-hidden="true">
          <TurtleIcon className="h-6 w-auto [@media(max-height:760px)]:h-5" />
        </span>
        <button
          type="button"
          aria-label={isPlaying ? "Tạm dừng âm thanh" : "Phát âm thanh"}
          aria-keyshortcuts={REPLAY_KEYS}
          title="Space · Ctrl+Space"
          onClick={handlePlayPause}
          className={`flex h-[76px] w-[76px] shrink-0 select-none items-center justify-center rounded-full bg-[#0066cc] text-white shadow-[0_6px_0_#004c99] transition-[translate,box-shadow,filter] duration-100 hover:brightness-110 active:translate-y-[6px] active:shadow-none [@media(max-height:760px)]:h-14 [@media(max-height:760px)]:w-14 [@media(max-height:760px)]:shadow-[0_4px_0_#004c99] [@media(max-height:760px)]:active:translate-y-[4px] ${FOCUS_RING}`}
        >
          <MaterialIcon
            name={isPlaying ? "pause" : "play_arrow"}
            className={isPlaying ? "text-[44px] [@media(max-height:760px)]:text-[28px]" : "ml-1 text-[48px] [@media(max-height:760px)]:text-[32px]"}
            filled
          />
        </button>
        <button
          type="button"
          aria-label={slowPlaying ? "Tạm dừng phát chậm" : "Phát chậm"}
          aria-pressed={slowPlaying}
          title="Phát ở 60% tốc độ"
          onClick={handleSlowPlay}
          className={`select-none ${SLOW_BUTTON} ${FOCUS_RING}`}
        >
          <TurtleIcon className="h-6 w-auto [@media(max-height:760px)]:h-5" />
        </button>
      </div>
    </section>
  );
}
