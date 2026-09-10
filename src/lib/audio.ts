import { Howl } from "howler";

/** Public URL for a clip's `audioPath` from content.ts (e.g. `ausbildung/common/…`). */
export function resolveAudioUrl(audioPath: string): string {
  const normalized = audioPath.replace(/^\/+/, "");
  return `/audio/${normalized}`;
}

export type PlaybackRate = 1 | 0.8 | 0.6;

export const PLAYBACK_RATES: PlaybackRate[] = [1, 0.8, 0.6];

export function nextPlaybackRate(current: PlaybackRate): PlaybackRate {
  const index = PLAYBACK_RATES.indexOf(current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
}

export function formatPlaybackRate(rate: PlaybackRate): string {
  return `${rate.toFixed(1)}x`;
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export type ClipHowlCallbacks = {
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onStop?: () => void;
  onLoad?: (durationSeconds: number) => void;
  onLoadError?: (message: string) => void;
};

/**
 * Create a Howler instance for a single dictation clip.
 * Caller owns lifecycle (unload on clip change / unmount).
 */
export function createClipHowl(
  src: string,
  rate: PlaybackRate,
  callbacks: ClipHowlCallbacks = {},
): Howl {
  return new Howl({
    src: [src],
    html5: true,
    preload: true,
    rate,
    onplay: () => callbacks.onPlay?.(),
    onpause: () => callbacks.onPause?.(),
    onend: () => callbacks.onEnd?.(),
    onstop: () => callbacks.onStop?.(),
    onload: function onLoad(this: Howl) {
      callbacks.onLoad?.(this.duration());
    },
    onloaderror: (_id, error) => {
      callbacks.onLoadError?.(String(error));
    },
  });
}

export function seekBySeconds(howl: Howl, deltaSeconds: number): number {
  const duration = howl.duration() || 0;
  const next = Math.min(
    Math.max((howl.seek() as number) + deltaSeconds, 0),
    duration,
  );
  howl.seek(next);
  return next;
}

export function restartClip(howl: Howl): void {
  howl.stop();
  howl.seek(0);
  howl.play();
}
