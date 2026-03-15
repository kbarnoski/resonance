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
