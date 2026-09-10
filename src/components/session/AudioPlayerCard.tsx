"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Howl } from "howler";
import {
  createClipHowl,
  formatAudioTime,
  formatPlaybackRate,
  nextPlaybackRate,
  restartClip,
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

/**
 * Remount this component (via `key={clipId}`) when the active clip changes.
 */
export function AudioPlayerCard({ audioPath }: AudioPlayerCardProps) {
  const howlRef = useRef<Howl | null>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const pulseCleanupRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  const [visualState, setVisualState] =
    useState<AudioPlayerVisualState>("idle");
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const getBars = useCallback(
    () =>
      barsRef.current.filter((bar): bar is HTMLDivElement => Boolean(bar)),
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
      setCurrentTime(seek);
      paintProgress(seek / total, true);
      rafRef.current = requestAnimationFrame(tick);
    };

    const howl = createClipHowl(resolveAudioUrl(audioPath), 1, {
      onLoad: (loadedDuration) => {
        setDuration(loadedDuration);
      },
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
        setCurrentTime(seek);
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
        const total = howl.duration();
        setCurrentTime(total);
        setWaveformFinished(getBars());
        setVisualState("finished");
      },
    });

    howlRef.current = howl;

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
      setCurrentTime(0);
      resetWaveformIdle(getBars());
    }

    howl.play();
  };

  const handleRepeat = () => {
    const howl = howlRef.current;
    if (!howl) return;
    setVisualState("playing");
    restartClip(howl);
  };

  const handleSpeedToggle = () => {
    setRate((current) => nextPlaybackRate(current));
  };

  const playIcon = visualState === "playing" ? "pause" : "play_arrow";
  const playIconClass =
    visualState === "playing" ? "text-[32px]" : "ml-1 text-[32px]";

  return (
    <section className="mt-space-12 flex flex-col gap-space-16 rounded-[24px] bg-surface-container-lowest p-space-20 shadow-sm transition-all duration-200 md:p-space-24">
      <div className="flex items-center justify-end">
        <button
          type="button"
          aria-label="Đổi tốc độ phát"
          onClick={handleSpeedToggle}
          className="shrink-0 rounded-full bg-surface-container px-space-8 py-space-4 font-label-sm text-label-sm text-on-surface transition-transform active:scale-95"
        >
          {formatPlaybackRate(rate)}
        </button>
      </div>

      <div className="flex flex-col gap-space-8 pt-space-4">
        <div
          aria-label="Dạng sóng âm thanh"
          className="flex h-12 w-full items-end justify-between gap-[3px] px-space-4"
        >
          {WAVEFORM_BAR_HEIGHTS_PX.map((height, index) => (
            <div
              key={`bar-${index}`}
              ref={(el) => {
                barsRef.current[index] = el;
              }}
              className="w-full rounded-full bg-secondary-container"
              style={{ height }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between px-space-2 font-label-sm text-label-sm text-secondary">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-space-24 py-space-4">
        <button
          type="button"
          aria-label="Phát hoặc tạm dừng âm thanh"
          onClick={handlePlayPause}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-md transition-transform active:scale-95"
        >
          <MaterialIcon name={playIcon} className={playIconClass} filled />
        </button>
        <button
          type="button"
          aria-label="Lặp lại câu hiện tại"
          onClick={handleRepeat}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface transition-transform active:scale-90"
        >
          <MaterialIcon name="repeat" className="text-[20px]" />
        </button>
      </div>
    </section>
  );
}
