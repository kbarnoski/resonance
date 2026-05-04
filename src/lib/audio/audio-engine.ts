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
  const p = el.play();
  if (!p || typeof p.then !== "function") return Promise.resolve();
  return p.then(
    () => { lastPlayError = null; },
    (err: unknown) => {
      lastPlayError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      // eslint-disable-next-line no-console
      console.warn("[audio] play() rejected:", lastPlayError);
    }
  );
}

export function primeAudioElement(): void {
  if (audioElementUnlocked) return;
  const engine = getAudioEngine();
  const el = engine.audioElement;
  // ALWAYS set the silent WAV. The previous `if (!el.src)` guard meant a
  // stale src from prior page navigation would skip priming and the next
  // play() rejected (silently) — which was the actual reason audio never
  // started in the installation loop.
  el.src =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAKhWAAACABAAZGF0YQAAAAA=";
  el.muted = false;
  el.volume = 1.0;
  const p = el.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      audioElementUnlocked = true;
      lastPrimingError = null;
    }).catch((err: unknown) => {
      lastPrimingError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn("[audio] primeAudioElement play() rejected:", err);
    });
  } else {
    audioElementUnlocked = true;
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
