"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { Howl } from "howler";
import {
  createClipHowl,
  formatPlaybackRate,
  nextPlaybackRate,
  resolveAudioUrl,
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
  const [rate, setRate] = useState<PlaybackRate>(1);

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

  const handlePlayPause = () => {
    const howl = howlRef.current;
    if (!howl) return;

    if (visualState === "playing") {
      howl.pause();
      return;
    }

    if (visualState === "finished") {
      howl.seek(0);
      resetWaveformIdle(getBars());
    }

    howl.play();
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

  const handleSpeedToggle = () => {
    setRate((current) => nextPlaybackRate(current));
  };

  const isPlaying = visualState === "playing";

  return (
    <section className="mt-3 flex flex-col items-center gap-5">
      <button
        type="button"
        aria-label="Dạng sóng âm thanh — chạm để phát hoặc tạm dừng"
        // The big play button below is the keyboard stop for the same action.
        tabIndex={-1}
        onClick={handlePlayPause}
        className="flex h-[76px] w-full items-center justify-between gap-1 rounded-full border-2 border-[#e5e5ea] bg-white px-6 transition-colors hover:bg-[#fafafa]"
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

      <div className="relative flex w-full items-center justify-center">
        <button
          type="button"
          aria-label={isPlaying ? "Tạm dừng âm thanh" : "Phát âm thanh"}
          aria-keyshortcuts={REPLAY_KEYS}
          title="Space · Ctrl+Space"
          onClick={handlePlayPause}
          className={`flex h-[76px] w-[76px] select-none items-center justify-center rounded-full bg-[#0066cc] text-white shadow-[0_6px_0_#004c99] transition-[translate,box-shadow,filter] duration-100 hover:brightness-110 active:translate-y-[6px] active:shadow-none ${FOCUS_RING}`}
        >
          <MaterialIcon
            name={isPlaying ? "pause" : "play_arrow"}
            className={isPlaying ? "text-[44px]" : "ml-1 text-[48px]"}
            filled
          />
        </button>
        <button
          type="button"
          aria-label="Đổi tốc độ phát"
          onClick={handleSpeedToggle}
          className={`absolute right-0 flex h-11 min-w-[56px] select-none items-center justify-center rounded-2xl border-2 border-[#e5e5ea] bg-white px-3 text-[13px] font-extrabold text-[#86868b] shadow-[0_3px_0_#e5e5ea] transition-[translate,box-shadow] duration-100 active:translate-y-[3px] active:shadow-none ${FOCUS_RING}`}
        >
          {formatPlaybackRate(rate)}
        </button>
      </div>
    </section>
  );
}
