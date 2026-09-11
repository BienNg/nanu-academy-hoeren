import { Howler } from "howler";

/** Short UI sounds (success chime, etc.). Browser-only — call from user gestures. */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let fallbackContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const howlerCtx = Howler.ctx as AudioContext | undefined;
  if (howlerCtx && howlerCtx.state !== "closed") {
    return howlerCtx;
  }

  const Ctor =
    window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;

  if (!fallbackContext || fallbackContext.state === "closed") {
    fallbackContext = new Ctor();
    noiseBuffer = null;
  }

  return fallbackContext;
}

function getOutput(ctx: AudioContext): AudioNode {
  const master = Howler.masterGain as GainNode | undefined;
  if (master && Howler.ctx === ctx) return master;
  return ctx.destination;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }

  const duration = 0.04;
  const buffer = ctx.createBuffer(
    1,
    Math.max(1, Math.floor(ctx.sampleRate * duration)),
    ctx.sampleRate,
  );
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Bright xylophone-like note: decaying sine partials plus a short mallet click.
 */
function playMalletNote(
  ctx: AudioContext,
  output: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  amplitude: number,
): void {
  const master = ctx.createGain();
  master.connect(output);

  const partials: ReadonlyArray<readonly [ratio: number, level: number]> = [
    [1, 1],
    [2.005, 0.2],
    [3.01, 0.07],
    [4.02, 0.03],
  ];

  for (const [ratio, level] of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency * ratio, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(
      amplitude * level,
      startTime + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(frequency * 2, startTime);
  noiseFilter.Q.setValueAtTime(1.4, startTime);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(amplitude * 0.12, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.03);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(startTime);
  noise.stop(startTime + 0.04);
}

/**
 * Duolingo-style ascending C-major sparkle. Safe to call from a click/Enter
 * handler so the AudioContext can unlock on iOS.
 */
export function playSuccessSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const output = getOutput(ctx);
  const t = ctx.currentTime + 0.01;
  const notes: ReadonlyArray<{
    freq: number;
    at: number;
    dur: number;
    amp: number;
  }> = [
    { freq: 523.25, at: 0, dur: 0.28, amp: 0.2 },
    { freq: 659.25, at: 0.075, dur: 0.28, amp: 0.18 },
    { freq: 783.99, at: 0.15, dur: 0.32, amp: 0.18 },
    { freq: 1046.5, at: 0.225, dur: 0.5, amp: 0.22 },
  ];

  for (const note of notes) {
    playMalletNote(ctx, output, note.freq, t + note.at, note.dur, note.amp);
  }
}
