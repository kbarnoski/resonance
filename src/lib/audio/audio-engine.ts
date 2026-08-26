/**
 * Audio Engine Singleton
 *
 * A module-level singleton that creates the AudioContext, HTMLAudioElement,
 * and Web Audio node graph exactly once. Survives across route changes because
 * it lives outside the React component tree.
 *
 * Audio graph:  source -> analyser -> gain -> destination
 *
 * CRITICAL: createMediaElementSource() can only be called ONCE per HTMLAudioElement.
 * The singleton pattern enforces this constraint.
 */

import { NativeAnalyserNode } from "./native-analyser";

/** Union type: either browser AnalyserNode or native NativeAnalyserNode */
export type AnalyserLike = AnalyserNode | NativeAnalyserNode;

let audioContext: AudioContext | null = null;
let audioElement: HTMLAudioElement | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let gainNode: GainNode | null = null;
let ambientOsc: OscillatorNode | null = null;
let ambientGain: GainNode | null = null;

export interface AudioEngine {
  audioContext: AudioContext;
  audioElement: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  analyserNode: AnalyserNode;
  gainNode: GainNode;
}

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") {
    throw new Error("AudioEngine can only be used in the browser");
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (!audioElement) {
    audioElement = new Audio();
    audioElement.crossOrigin = "anonymous";
    audioElement.preload = "auto";
  }

  if (!sourceNode) {
    sourceNode = audioContext.createMediaElementSource(audioElement);

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    gainNode = audioContext.createGain();

    sourceNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
  }

  return {
    audioContext: audioContext!,
    audioElement: audioElement!,
    sourceNode: sourceNode!,
    analyserNode: analyserNode!,
    gainNode: gainNode!,
  };
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

// ─── Gain envelopes — the "never abrupt" law, applied to audio ───
// Every pause / stop / src-swap should ride a short linear ramp instead of
// cutting. Ramps are deliberately short (~200ms) so rapid transitions
// (installation loop journey handoffs) never stack or lag, and every ramp
// cancels previously scheduled values first so overlapping calls can't fight.

/** Canonical ramp length for stop/pause/src-swap fades */
export const GAIN_RAMP_MS = 200;
/** Shorter ramp for volume / mute changes — removes the click without lag */
export const VOLUME_RAMP_MS = 120;

/** The gain the engine should sit at while audibly playing (user volume).
 *  tryPlay restores to this so no play path can start stuck at 0 after a fade. */
let targetGain = 1;

/**
 * Ramp the master gain to `target` over `ms` milliseconds.
 * Cancels any in-flight ramp first (cancelScheduledValues + re-pin current
 * value) so back-to-back calls always start from the actual current gain.
 * Resolves after the ramp duration has elapsed.
 */
export function rampGainTo(target: number, ms: number = GAIN_RAMP_MS): Promise<void> {
  if (!audioContext || !gainNode) return Promise.resolve();
  try {
    const now = audioContext.currentTime;
    const gain = gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(Math.max(0, target), now + ms / 1000);
  } catch {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Set the user-intended volume with a smooth ramp (no gain step click). */
export function setEngineVolume(volume: number): void {
  targetGain = Math.max(0, Math.min(1, volume));
  void rampGainTo(targetGain, VOLUME_RAMP_MS);
}

/** Fade the master gain to silence, then run the action (pause / src swap /
 *  stop). Gain stays at 0 afterward — the next tryPlay ramps it back up. */
export async function fadeOutThen(action: () => void, ms: number = GAIN_RAMP_MS): Promise<void> {
  await rampGainTo(0, ms);
  action();
}

export function getDataArray(): Uint8Array | null {
  if (!analyserNode) return null;
  return new Uint8Array(analyserNode.frequencyBinCount);
}

/** Resume AudioContext after user gesture (browser autoplay policy) */
export async function ensureResumed(): Promise<void> {
  if (audioContext && audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

// HTMLAudioElement.play() only works if first called inside a user
// gesture (iOS Safari is strict, Chrome/Firefox depend on autoplay
// policy). After one successful play() in a gesture the element is
// "unlocked" for the session — subsequent src changes + plays work
// even from async callbacks. Must run synchronously from the click.
let audioElementUnlocked = false;
let lastPrimingError: string | null = null;
let lastPlayError: string | null = null;
export function isAudioElementUnlocked(): boolean { return audioElementUnlocked; }
export function getLastPrimingError(): string | null { return lastPrimingError; }
export function getLastPlayError(): string | null { return lastPlayError; }
export function setLastPlayError(err: string | null): void { lastPlayError = err; }
/** Wrap audio.play() to capture its rejection reason for diagnostics.
 *  audio-provider, the watchdog, and anywhere else that calls play()
 *  on the engine element should funnel through here. */
export function tryPlay(el: HTMLAudioElement): Promise<void> {
  // Restore the master gain toward the user volume with a short ramp.
  // Every stop/pause fade parks the gain at 0 — without this, any play
  // path (provider, watchdog, installation loop) could start silent.
  void rampGainTo(targetGain, GAIN_RAMP_MS);
  const p = el.play();
  if (!p || typeof p.then !== "function") return Promise.resolve();
  return p.then(
    () => { lastPlayError = null; },
    (err: unknown) => {
      lastPlayError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      // AbortError = a pause() landed while this play() was still
      // resolving. Benign: end-of-track + credits handoff, or any
      // play/pause sync race. Still recorded in lastPlayError for
      // diagnostics; just don't pollute the console with it.
      if (err instanceof Error && err.name === "AbortError") return;
      // eslint-disable-next-line no-console
      console.warn("[audio] play() rejected:", lastPlayError);
    }
  );
}

let primingInFlight = false;

export function primeAudioElement(): void {
  if (audioElementUnlocked) return;
  // CRITICAL: also early-return if a previous prime call is in flight
  // OR if the audio element already has a non-silent src loaded. The
  // installation loop hits a race here — Begin-tap fires
  // primeAudioElement, which sets src to silent WAV + calls play();
  // before that play() promise resolves, the loop client's
  // setQueue+startJourney runs and audio-provider replaces the src
  // with the journey's track. The silent WAV's play() never resolves
  // (src was swapped), so audioElementUnlocked stays false. Without
  // this guard, every subsequent touch event on the page re-ran
  // primeAudioElement, which yanked src back to the silent WAV mid-
  // journey — read by the user as "tap stops audio, tap again starts
  // it" (the second tap let the new prime complete + audio-provider
  // re-loaded the journey).
  if (primingInFlight) return;
  const engine = getAudioEngine();
  const el = engine.audioElement;
  // If src is already set to a non-data URL, the audio-provider has
  // already loaded a real track. Don't yank it.
  if (el.src && !el.src.startsWith("data:")) {
    audioElementUnlocked = true;
    return;
  }
  primingInFlight = true;
  el.src =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAKhWAAACABAAZGF0YQAAAAA=";
  el.muted = false;
  el.volume = 1.0;
  const p = el.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      audioElementUnlocked = true;
      primingInFlight = false;
      lastPrimingError = null;
    }).catch((err: unknown) => {
      lastPrimingError = err instanceof Error ? err.message : String(err);
      primingInFlight = false;
      // eslint-disable-next-line no-console
      console.warn("[audio] primeAudioElement play() rejected:", err);
    });
  } else {
    audioElementUnlocked = true;
    primingInFlight = false;
  }
}

/**
 * Start a silent ambient oscillator connected to the analyser.
 * Used when no track is playing so shaders still receive data.
 */
export function startAmbient(): void {
  if (ambientOsc || !audioContext || !analyserNode) return;

  ambientOsc = audioContext.createOscillator();
  ambientGain = audioContext.createGain();
  ambientGain.gain.value = 0; // silent
  ambientOsc.connect(ambientGain);
  ambientGain.connect(analyserNode);
  ambientOsc.start();
}

export function stopAmbient(): void {
  if (ambientOsc) {
    try { ambientOsc.stop(); } catch {}
    ambientOsc = null;
  }
  if (ambientGain) {
    try { ambientGain.disconnect(); } catch {}
    ambientGain = null;
  }
}

// ─── Native analyser singleton (desktop mode) ───

let nativeAnalyser: NativeAnalyserNode | null = null;

export function initNativeAnalyser(): NativeAnalyserNode {
  if (!nativeAnalyser) {
    nativeAnalyser = new NativeAnalyserNode();
  }
  return nativeAnalyser;
}

export function getNativeAnalyser(): NativeAnalyserNode | null {
  return nativeAnalyser;
}
