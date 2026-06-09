// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — warm, expressive, resolving synthesized piano stand-in for
// "Piano Phrase Painter". Used when Karel's recording cannot be loaded.
//
// Architecture: Web Audio API oscillator bank producing a cinematic chord
// progression through the SAME AnalyserNode→analysis path as the real audio,
// so the musical analysis still drives real image generation and visual field.
//
// Progression resolves on purpose: V7→I cadences interspersed.
// All 12-TET (440 Hz standard tuning). Soft attack, slow decay.
// ─────────────────────────────────────────────────────────────────────────────

// ── Chord progression ─────────────────────────────────────────────────────────
// Each entry: [root_hz, ...chord_tones] + a descriptive name.
// Ends with a V7→I authentic cadence for resolution.
const PROGRESSION: Array<{ hz: number[]; name: string; durationSec: number }> = [
  { hz: [130.81, 164.81, 196.00, 246.94], name: "Cmaj", durationSec: 8 },
  { hz: [146.83, 174.61, 220.00, 293.66], name: "Dm7",  durationSec: 7 },
  { hz: [155.56, 195.99, 246.94, 311.13], name: "Eb m", durationSec: 9 },
  { hz: [138.59, 174.61, 220.00, 277.18], name: "C#m",  durationSec: 8 },
  { hz: [123.47, 155.56, 196.00, 246.94], name: "Bm9",  durationSec: 7 },
  { hz: [146.83, 185.00, 220.00, 293.66], name: "Dm",   durationSec: 6 },
  // V7 → I authentic cadence
  { hz: [196.00, 246.94, 293.66, 369.99], name: "G7",   durationSec: 5 },
  { hz: [130.81, 164.81, 196.00, 261.63], name: "Cmaj9",durationSec: 12 },
];

// ── Arpeggio on top ────────────────────────────────────────────────────────────
const ARP_STEP_S = 0.35;

// ── Reverb impulse (exponential noise) ────────────────────────────────────────
function buildReverb(ctx: AudioContext, decaySec: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * decaySec);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.0);
    }
  }
  return buf;
}

export interface SynthEngine {
  analyser: AnalyserNode;
  /** Apply image color feedback: brightness [0-1], hue [0-360], warmth [0-1]. */
  applyImageFeedback: (brightness: number, hue: number, warmth: number) => void;
  stop: () => void;
}

export function buildSynthEngine(ctx: AudioContext): SynthEngine {
  // ── Master chain ─────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.55, ctx.currentTime);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(3800, ctx.currentTime);
  lowpass.Q.setValueAtTime(0.8, ctx.currentTime);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, ctx.currentTime);
  compressor.knee.setValueAtTime(8, ctx.currentTime);
  compressor.ratio.setValueAtTime(4, ctx.currentTime);
  compressor.attack.setValueAtTime(0.005, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);

  const convolver = ctx.createConvolver();
  convolver.buffer = buildReverb(ctx, 3.2);

  const reverbGain = ctx.createGain();
  reverbGain.gain.setValueAtTime(0.38, ctx.currentTime);

  const dryGain = ctx.createGain();
  dryGain.gain.setValueAtTime(0.65, ctx.currentTime);

  // master → analyser → (dry + reverb) → lowpass → compressor → destination
  master.connect(analyser);
  master.connect(dryGain);
  master.connect(convolver);
  convolver.connect(reverbGain);
  dryGain.connect(lowpass);
  reverbGain.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(ctx.destination);

  // ── Active oscillator pool ───────────────────────────────────────────────
  const activeNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = [];

  function killAll(): void {
    const t = ctx.currentTime;
    for (const { osc, gain } of activeNodes) {
      gain.gain.setTargetAtTime(0, t, 0.08);
      osc.stop(t + 0.5);
    }
    activeNodes.length = 0;
  }

  function playChord(hz: number[]): void {
    killAll();
    const t = ctx.currentTime;
    for (const freq of hz) {
      // Fundamental
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.08);
      g.gain.setTargetAtTime(0.12, t + 0.08, 1.5);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      activeNodes.push({ osc, gain: g });

      // Slight 2nd harmonic for warmth
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, t);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.04, t + 0.06);
      g2.gain.setTargetAtTime(0.02, t + 0.06, 1.0);
      osc2.connect(g2);
      g2.connect(master);
      osc2.start(t);
      activeNodes.push({ osc: osc2, gain: g2 });
    }
  }

  // ── Arpeggio layer ───────────────────────────────────────────────────────
  let currentHz: number[] = [];
  let arpIdx = 0;
  let arpTimerId: ReturnType<typeof setInterval> | null = null;

  function startArp(): void {
    if (arpTimerId) return;
    arpTimerId = setInterval(() => {
      if (currentHz.length === 0) return;
      const freq = currentHz[arpIdx % currentHz.length];
      arpIdx++;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * 2, t); // one octave up
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.65);
    }, Math.round(ARP_STEP_S * 1000));
  }

  // ── Chord sequencer ───────────────────────────────────────────────────────
  let chordIdx = 0;
  let chordTimerId: ReturnType<typeof setTimeout> | null = null;

  function scheduleNextChord(): void {
    const chord = PROGRESSION[chordIdx % PROGRESSION.length];
    currentHz = chord.hz;
    arpIdx = 0;
    playChord(chord.hz);
    chordIdx++;
    chordTimerId = setTimeout(scheduleNextChord, chord.durationSec * 1000);
  }

  scheduleNextChord();
  startArp();

  // ── Image feedback ────────────────────────────────────────────────────────
  function applyImageFeedback(brightness: number, hue: number, warmth: number): void {
    const t = ctx.currentTime;
    // Brighter → more open high-end
    const cutoff = 1200 + brightness * 5000;
    lowpass.frequency.setTargetAtTime(cutoff, t, 0.8);
    // Warmer → longer reverb (approximate by raising reverb gain)
    const revWet = 0.25 + warmth * 0.4;
    reverbGain.gain.setTargetAtTime(revWet, t, 1.0);
    // Hue: cool blues → shimmer via subtle master boost
    const hueNorm = hue / 360;
    const shimmer = 0.5 + (hueNorm > 0.55 && hueNorm < 0.85 ? 0.05 : 0);
    master.gain.setTargetAtTime(shimmer, t, 1.5);
  }

  function stop(): void {
    if (chordTimerId) clearTimeout(chordTimerId);
    if (arpTimerId) clearInterval(arpTimerId);
    killAll();
    try { master.disconnect(); } catch { /* ok */ }
  }

  return { analyser, applyImageFeedback, stop };
}
