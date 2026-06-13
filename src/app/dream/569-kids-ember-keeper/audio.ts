/**
 * audio.ts — kids-safe Web Audio engine for the Ember Keeper.
 *
 * Master chain (brick-wall safe): gain → lowpass(≤8kHz) → compressor(-10,20:1) → destination.
 * No sudden loud transients; all gain changes via setTargetAtTime. C-major pentatonic only.
 *
 * The AudioContext is created INSIDE the user gesture (iOS unlock).
 */

import { degreeToMidi, midiToFreq } from "./genome";

export type AudioEngine = {
  ctx: AudioContext;
  /** Connect the mic into an analyser for pitch detection (analysis-only). */
  attachMic: () => Promise<AnalyserNode>;
  /** Sing one soft note from a pentatonic degree. */
  sing: (degree: number, when?: number, dur?: number) => void;
  /** Sing a short "hello again" phrase from the learned palette. */
  greet: (palette: number[]) => void;
  /** Warm "growth" chime when a new part appears. */
  growChime: (degree: number) => void;
  dispose: () => void;
};

export async function bootAudio(): Promise<AudioEngine> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctor();
  if (ctx.state === "suspended") await ctx.resume();

  // ── Master safety chain ──────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 8000; // ≤ 8 kHz, gentle on little ears

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 0;
  limiter.ratio.value = 20; // brick-wall
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(limiter);
  limiter.connect(ctx.destination);

  // Ease master up gently.
  master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.2);

  let micStream: MediaStream | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;

  function singDegree(degree: number, when: number, dur: number, peak: number) {
    const t = when;
    const freq = midiToFreq(degreeToMidi(degree));

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    // A soft sine partial for warmth.
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2;

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const g2 = ctx.createGain();
    g2.gain.value = 0.0001;

    osc.connect(g);
    osc2.connect(g2);
    g.connect(master);
    g2.connect(master);

    // Soft attack/release — no transients.
    g.gain.setTargetAtTime(peak, t, 0.04);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, 0.18);
    g2.gain.setTargetAtTime(peak * 0.3, t, 0.05);
    g2.gain.setTargetAtTime(0.0001, t + dur * 0.5, 0.18);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.5);
    osc2.stop(t + dur + 0.5);
  }

  return {
    ctx,

    async attachMic(): Promise<AnalyserNode> {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
      micSource = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // Analysis-only: the analyser is a dead-end. It is NOT connected to master,
      // so the mic is never played back, recorded, or transmitted.
      micSource.connect(analyser);
      return analyser;
    },

    sing(degree: number, when = ctx.currentTime + 0.02, dur = 0.5) {
      singDegree(degree, when, dur, 0.32);
    },

    greet(palette: number[]) {
      const phrase = palette.length ? palette : [0, 2, 4];
      const start = ctx.currentTime + 0.05;
      const step = 0.26;
      // A short, friendly "hello again" — rises through the learned palette.
      const notes = phrase.slice(0, 5);
      notes.forEach((deg, i) => {
        singDegree(deg, start + i * step, 0.34, 0.28);
      });
      // A little resolving note up top.
      singDegree(
        Math.min(notes[notes.length - 1] + 1, 10),
        start + notes.length * step,
        0.5,
        0.3,
      );
    },

    growChime(degree: number) {
      const t = ctx.currentTime + 0.02;
      // Two stacked pentatonic notes — a warm, unmistakably positive "ding".
      singDegree(degree, t, 0.6, 0.3);
      singDegree(Math.min(degree + 2, 10), t + 0.08, 0.6, 0.22);
    },

    dispose() {
      try {
        if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
        micSource?.disconnect();
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
        setTimeout(() => ctx.close().catch(() => {}), 300);
      } catch {
        /* ignore */
      }
    },
  };
}
