// ════════════════════════════════════════════════════════════════════════════
// audio.ts — Web Audio engine (1027 Kids Chaos Aurora)
//
// Warm soft-mallet / glass chime voices (sine + a couple of detuned partials,
// ≥10ms attack, gentle decay — never harsh, no loud transients) plus an
// always-on drone pad so the piece is never silent.
//
// Kids-safe master chain EXACTLY:
//   masterGain(~0.26) → lowpass(~6500Hz) → compressor(-10, 20:1) → destination
// AnalyserNode taps the master only; nothing connects to destination directly.
// ════════════════════════════════════════════════════════════════════════════

import { Chord, dronePadFreqs } from "./harmony";

export interface AudioEngine {
  ctx: AudioContext;
  analyser: AnalyserNode;
  playChime: (freq: number, brightness: number, when?: number) => void;
  setDrone: (chord: Chord) => void;
  close: () => Promise<void>;
}

export function createAudioEngine(): AudioEngine {
  const AudioCtor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtor();

  // ── Master chain (exact spec) ──────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.26;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6500;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.ratio.value = 20;
  compressor.knee.value = 6;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;

  masterGain.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(analyser);
  analyser.connect(ctx.destination);

  // ── Drone pad (always on) ───────────────────────────────────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(masterGain);

  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 1200;
  droneFilter.connect(droneGain);

  const droneOscs: OscillatorNode[] = [];
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 110;
    const detune = ctx.createGain(); // per-osc gentle balance
    detune.gain.value = 0.5;
    o.connect(detune);
    detune.connect(droneFilter);
    o.start();
    droneOscs.push(o);
  }
  // Slow swell up so its arrival is soft.
  droneGain.gain.setTargetAtTime(0.08, ctx.currentTime, 1.5);

  function setDrone(chord: Chord) {
    const [f0, f1] = dronePadFreqs(chord);
    const now = ctx.currentTime;
    if (droneOscs[0]) droneOscs[0].frequency.setTargetAtTime(f0, now, 0.6);
    if (droneOscs[1]) droneOscs[1].frequency.setTargetAtTime(f1 * 1.003, now, 0.6);
  }

  // ── Soft-mallet / glass chime voice ─────────────────────────────────────────
  // brightness in [0,1] opens a per-voice lowpass and adds a touch more partial.
  function playChime(freq: number, brightness: number, when = ctx.currentTime) {
    const b = Math.max(0, Math.min(1, brightness));
    const voiceGain = ctx.createGain();
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = "lowpass";
    voiceFilter.frequency.value = 900 + b * 4200;
    voiceFilter.Q.value = 0.7;

    voiceGain.connect(voiceFilter);
    voiceFilter.connect(masterGain);

    // Partials: fundamental + a gentle octave + a soft, slightly detuned 12th.
    const partials: Array<{ ratio: number; level: number; detune: number }> = [
      { ratio: 1, level: 1.0, detune: 0 },
      { ratio: 2, level: 0.32, detune: 2 },
      { ratio: 3.01, level: 0.14 * b + 0.04, detune: -3 },
    ];

    const attack = 0.012; // ≥10ms — no clicky transients
    const peak = 0.16;
    const decay = 1.6 + b * 0.8;

    voiceGain.gain.setValueAtTime(0.0001, when);
    voiceGain.gain.linearRampToValueAtTime(peak, when + attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);

    const oscs: OscillatorNode[] = [];
    for (const pt of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * pt.ratio;
      o.detune.value = pt.detune;
      const g = ctx.createGain();
      g.gain.value = pt.level;
      o.connect(g);
      g.connect(voiceGain);
      o.start(when);
      o.stop(when + attack + decay + 0.05);
      oscs.push(o);
    }

    // Cleanup once the tail is done.
    const last = oscs[oscs.length - 1];
    last.onended = () => {
      voiceGain.disconnect();
      voiceFilter.disconnect();
    };
  }

  async function close() {
    try {
      droneGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      for (const o of droneOscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      await ctx.close();
    } catch {
      /* context may already be closed */
    }
  }

  return { ctx, analyser, playChime, setDrone, close };
}
