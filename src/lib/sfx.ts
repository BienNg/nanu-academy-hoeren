import { Howl, Howler } from "howler";

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

/**
 * A soft wooden click for each name the opponent reel passes. Play the first
 * one from the start click so the AudioContext can unlock on iOS.
 */
export function playReelTickSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  playMalletNote(ctx, getOutput(ctx), 1760, ctx.currentTime + 0.005, 0.06, 0.05);
}

/** Seconds between pulses of the challenger warning lights. */
export const CHALLENGER_ALARM_STEP = 0.18;

const CHALLENGER_ALARM_SRC = "/sfx/challenger-alarm.mp3";

let challengerAlarm: Howl | null = null;

function getChallengerAlarm(): Howl {
  if (!challengerAlarm) {
    challengerAlarm = new Howl({
      src: [CHALLENGER_ALARM_SRC],
      preload: true,
      volume: 0.5,
    });
  }
  return challengerAlarm;
}

/**
 * The Smash Bros new-foe sting for an open challenge. Returns a stop
 * function for when the overlay closes early.
 */
export function playChallengerAlarm(): () => void {
  if (typeof window === "undefined") return () => {};

  const howl = getChallengerAlarm();
  const id = howl.play();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    howl.stop(id);
  };
}

/** The reel locking on an opponent: a low thud under a bright two-note hit. */
export function playReelLockSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const output = getOutput(ctx);
  const t = ctx.currentTime + 0.01;

  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = "sine";
  thud.frequency.setValueAtTime(150, t);
  thud.frequency.exponentialRampToValueAtTime(55, t + 0.22);
  thudGain.gain.setValueAtTime(0.0001, t);
  thudGain.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  thud.connect(thudGain);
  thudGain.connect(output);
  thud.start(t);
  thud.stop(t + 0.28);

  playMalletNote(ctx, output, 783.99, t, 0.35, 0.16);
  playMalletNote(ctx, output, 1046.5, t + 0.07, 0.5, 0.18);
}

/**
 * Longer fanfare for finishing a listening part. A rising major line, a
 * resolving chord, and a bright cymbal wash — played from the continue click
 * so the AudioContext can unlock on iOS.
 */
export function playCelebrationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const output = getOutput(ctx);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.9, ctx.currentTime);
  bus.connect(output);

  const t = ctx.currentTime + 0.02;
  const melody: ReadonlyArray<{
    freq: number;
    at: number;
    dur: number;
    amp: number;
  }> = [
    { freq: 392.0, at: 0, dur: 0.18, amp: 0.14 },
    { freq: 523.25, at: 0.12, dur: 0.18, amp: 0.15 },
    { freq: 659.25, at: 0.24, dur: 0.2, amp: 0.16 },
    { freq: 783.99, at: 0.36, dur: 0.28, amp: 0.17 },
    { freq: 1046.5, at: 0.5, dur: 0.55, amp: 0.18 },
  ];

  for (const note of melody) {
    playMalletNote(ctx, bus, note.freq, t + note.at, note.dur, note.amp);
  }

  const rise = ctx.createOscillator();
  const riseGain = ctx.createGain();
  rise.type = "triangle";
  rise.frequency.setValueAtTime(523.25, t + 0.42);
  rise.frequency.exponentialRampToValueAtTime(1046.5, t + 0.68);
  riseGain.gain.setValueAtTime(0.0001, t + 0.42);
  riseGain.gain.exponentialRampToValueAtTime(0.06, t + 0.62);
  riseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
  rise.connect(riseGain);
  riseGain.connect(bus);
  rise.start(t + 0.42);
  rise.stop(t + 0.8);

  const chordAt = t + 0.7;
  const chord = [130.81, 261.63, 329.63, 392.0, 523.25, 659.25];
  for (const freq of chord) {
    playMalletNote(ctx, bus, freq, chordAt, 0.95, freq < 200 ? 0.07 : 0.045);
  }

  const sparkles = [1174.66, 1567.98, 2093.0, 2637.02];
  sparkles.forEach((freq, index) => {
    playMalletNote(ctx, bus, freq, chordAt + 0.04 + index * 0.07, 0.4, 0.04);
  });

  const washSeconds = 0.45;
  const wash = ctx.createBuffer(
    1,
    Math.max(1, Math.floor(ctx.sampleRate * washSeconds)),
    ctx.sampleRate,
  );
  const washData = wash.getChannelData(0);
  for (let i = 0; i < washData.length; i += 1) {
    washData[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = wash;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.setValueAtTime(4000, chordAt);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, chordAt);
  noiseGain.gain.exponentialRampToValueAtTime(0.12, chordAt + 0.02);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, chordAt + washSeconds);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(bus);
  noise.start(chordAt);
  noise.stop(chordAt + washSeconds);
}

/**
 * Playful cartoon "bwomp" when a listening heart is lost.
 * A soft thud plus two downward pitch slides. Call from the submit gesture
 * so the AudioContext can unlock on iOS.
 */
export function playHeartLostSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const output = getOutput(ctx);
  const t = ctx.currentTime + 0.01;

  const thud = ctx.createBufferSource();
  thud.buffer = getNoiseBuffer(ctx);
  const thudFilter = ctx.createBiquadFilter();
  thudFilter.type = "lowpass";
  thudFilter.frequency.setValueAtTime(520, t);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.16, t);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  thud.connect(thudFilter);
  thudFilter.connect(thudGain);
  thudGain.connect(output);
  thud.start(t);
  thud.stop(t + 0.06);

  const slides: ReadonlyArray<{
    at: number;
    from: number;
    to: number;
    dur: number;
    peak: number;
  }> = [
    { at: 0, from: 523, to: 196, dur: 0.16, peak: 0.16 },
    { at: 0.12, from: 262, to: 131, dur: 0.26, peak: 0.12 },
  ];

  for (const slide of slides) {
    const start = t + slide.at;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(slide.from, start);
    osc.frequency.exponentialRampToValueAtTime(slide.to, start + slide.dur);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, start);
    filter.frequency.exponentialRampToValueAtTime(500, start + slide.dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(slide.peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + slide.dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    osc.start(start);
    osc.stop(start + slide.dur + 0.02);
  }
}
