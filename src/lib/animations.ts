import gsap from "gsap";

/** Static bar heights matching design-reference/excercise_screen waveform. */
export const WAVEFORM_BAR_HEIGHTS_PX = [
  18, 30, 42, 26, 48, 34, 44, 22, 36, 46, 30, 18, 38, 48, 28, 24, 44, 30, 48,
  26, 36, 20, 34, 44, 22, 40, 30, 16,
] as const;

const PLAYED_CLASS = "bg-[#0066cc]";
const UNPLAYED_CLASS = "bg-[#e5e5ea]";

function clearBarColor(bar: HTMLElement): void {
  bar.classList.remove(PLAYED_CLASS, UNPLAYED_CLASS);
}

/**
 * Paint waveform bars by playback progress (0–1).
 * Played → brand blue; unplayed → light gray.
 */
export function setWaveformProgress(
  bars: HTMLElement[],
  progress: number,
): void {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const playedCount = Math.round(clamped * bars.length);

  bars.forEach((bar, index) => {
    clearBarColor(bar);
    bar.classList.add(index < playedCount ? PLAYED_CLASS : UNPLAYED_CLASS);
  });
}

/** Reset all bars to the idle (unplayed) look. */
export function resetWaveformIdle(bars: HTMLElement[]): void {
  setWaveformProgress(bars, 0);
}

/** Mark the full waveform as finished (all played). */
export function setWaveformFinished(bars: HTMLElement[]): void {
  setWaveformProgress(bars, 1);
}

/**
 * Soft pulse on the active (playhead) bar while audio is playing.
 * Returns a cleanup that kills the tween.
 */
export function pulseWaveformPlayhead(
  bars: HTMLElement[],
  progress: number,
): () => void {
  const index = Math.min(
    Math.max(Math.floor(progress * bars.length), 0),
    Math.max(bars.length - 1, 0),
  );
  const bar = bars[index];
  if (!bar) {
    return () => {};
  }

  const baseHeight = WAVEFORM_BAR_HEIGHTS_PX[index] ?? 24;
  const tween = gsap.to(bar, {
    height: baseHeight * 1.12,
    duration: 0.45,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });

  return () => {
    tween.kill();
    gsap.set(bar, { height: baseHeight });
  };
}

/** Kill any GSAP tweens attached to waveform bars. */
export function killWaveformAnimations(bars: HTMLElement[]): void {
  if (bars.length === 0) return;
  gsap.killTweensOf(bars);
  bars.forEach((bar, index) => {
    gsap.set(bar, { height: WAVEFORM_BAR_HEIGHTS_PX[index] ?? 24 });
  });
}

/** Brief press feedback for control buttons (shared micro-interaction). */
export function pressScale(element: HTMLElement): void {
  gsap.fromTo(
    element,
    { scale: 1 },
    { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out" },
  );
}
