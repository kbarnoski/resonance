// instrument.ts — the granular voice. Re-voices Karel's piano corpus as a
// cosmic drift driven by the river's emergent flow stats (CataRT-style, Schwarz
// DAFx 2006): each scheduling tick the flow becomes a target descriptor
// (pitch / brightness / density / onset) and we retrieve + play the best grain.
//
// Signal path per grain:
//   AudioBufferSourceNode(slice) → raised-cosine GainNode env → StereoPanner →
//   master DynamicsCompressor (limiter) → destination
//
// The piece is QUIET and near-still when idle — it only sings when stirred.

import { selectGrain, type Grain } from "./source";
import type { FlowStats } from "./flow";

// Just / pentatonic scale degrees (semitones from root) the focused flow locks
// onto — a JI-flavoured pentatonic so coherent currents ring consonantly.
const PENTATONIC = [0, 2, 4, 7, 9];

export interface InstrumentHandle {
  /** Schedule grains for one tick from the current flow stats. */
  feed(stats: FlowStats): void;
  /** Latest smoothed output RMS (0..1) for flow feedback. */
  getRms(): number;
  /** Swap the grain corpus (drag-drop). */
  setCorpus(corpus: Grain[]): void;
  /** Master AudioBuffer slices index into. */
  setBuffer(buffer: AudioBuffer): void;
  /** Tear down all nodes. */
  dispose(): void;
}

export function createInstrument(
  ctx: AudioContext,
  initialBuffer: AudioBuffer,
  initialCorpus: Grain[],
): InstrumentHandle {
  let buffer = initialBuffer;
  let corpus = initialCorpus;

  // master limiter
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -10;
  master.knee.value = 6;
  master.ratio.value = 12;
  master.attack.value = 0.003;
  master.release.value = 0.25;

  // overall gentle gain so idle is barely there
  const bus = ctx.createGain();
  bus.gain.value = 0.85;
  bus.connect(master);
  master.connect(ctx.destination);

  // RMS metering tap (river breathes with its own sound).
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  bus.connect(analyser);
  const meterBuf = new Float32Array(analyser.fftSize);
  let smoothedRms = 0;

  let nextGrainTime = 0; // audioContext time of next allowed grain
  const rootMidi = 50; // D3 root for the pentatonic lock

  function quantizeToScale(targetMidi: number): number {
    const rel = targetMidi - rootMidi;
    const oct = Math.floor(rel / 12);
    const within = rel - oct * 12;
    let best = PENTATONIC[0];
    let bestD = Infinity;
    for (const d of PENTATONIC) {
      const dd = Math.abs(d - within);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return rootMidi + oct * 12 + best;
  }

  function playGrain(
    targetMidi: number,
    targetBrightness: number,
    when: number,
    durScale: number,
    gain: number,
    pan: number,
    detuneCents: number,
  ): void {
    const g = selectGrain(corpus, targetMidi, targetBrightness);
    if (!g) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Pitch-shift the grain toward the (quantized) target via playbackRate.
    const ratio = Math.pow(2, (targetMidi - g.midi) / 12) * Math.pow(2, detuneCents / 1200);
    src.playbackRate.value = Math.max(0.25, Math.min(4, ratio));

    const dur = Math.min(g.duration, 0.5) * durScale;
    const env = ctx.createGain();
    // Raised-cosine (Hann) envelope approximated with ramps → no clicks.
    const a = Math.min(0.08, dur * 0.4);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + a);
    env.gain.setValueAtTime(gain, when + dur - a);
    env.gain.linearRampToValueAtTime(0.0001, when + dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    src.connect(env);
    env.connect(panner);
    panner.connect(bus);
    src.start(when, g.offset, dur + 0.02);
    src.stop(when + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      env.disconnect();
      panner.disconnect();
    };
  }

  function feed(stats: FlowStats): void {
    const t = ctx.currentTime;
    if (nextGrainTime < t) nextGrainTime = t;

    // Update RMS meter.
    analyser.getFloatTimeDomainData(meterBuf);
    let sq = 0;
    for (let i = 0; i < meterBuf.length; i++) sq += meterBuf[i] * meterBuf[i];
    const rms = Math.sqrt(sq / meterBuf.length);
    smoothedRms = smoothedRms * 0.85 + rms * 0.15;

    const {
      meanSpeed,
      coherence,
      vorticity,
      poolDensity,
      energyX,
      energyY,
      confluence,
    } = stats;

    const pan = (energyX - 0.5) * 1.6;
    // Higher energy → higher register; map energyY (top = bright/high).
    const registerMidi = rootMidi + Math.round((1 - energyY) * 24) - 4;
    const activity = meanSpeed * 6 + vorticity;

    // ── Idle: sparse twinkle. The instrument rests when not stirred. ──
    if (activity < 0.25 && poolDensity < 0.45 && !confluence) {
      if (t >= nextGrainTime && Math.random() < 0.12) {
        const tm = quantizeToScale(registerMidi + (Math.random() < 0.5 ? 12 : 0));
        playGrain(tm, 0.35, t + 0.01, 1.0, 0.06, pan * 0.5, 0);
        nextGrainTime = t + 0.6 + Math.random() * 0.8;
      }
      return;
    }

    // ── Confluence event: a deliberate two-grain harmonic fifth. ──
    if (confluence && t >= nextGrainTime) {
      const tm = quantizeToScale(registerMidi);
      playGrain(tm, 0.5, t + 0.01, 1.1, 0.16, pan, 0);
      playGrain(tm + 7, 0.55, t + 0.02, 1.1, 0.13, pan * 0.8, 4); // a fifth above
      nextGrainTime = t + 0.5;
      return;
    }

    // ── Forming pool: swell a sustained pad (long grains, slow rate). ──
    if (poolDensity > 0.6 && t >= nextGrainTime) {
      const tm = quantizeToScale(registerMidi);
      playGrain(tm, 0.3, t + 0.01, 2.0, 0.1 + poolDensity * 0.08, pan, 0);
      playGrain(tm + 4, 0.3, t + 0.05, 2.0, 0.06, pan * 0.6, -3);
      nextGrainTime = t + 0.45;
      return;
    }

    // ── Turbulent / high vorticity near cursor: detuned bright shimmer. ──
    if (vorticity > 0.45 && t >= nextGrainTime) {
      const n = 2 + Math.floor(vorticity * 3);
      for (let i = 0; i < n; i++) {
        const tm = quantizeToScale(registerMidi + 12 + (Math.random() < 0.5 ? 7 : 0));
        const detune = (Math.random() * 2 - 1) * 25;
        playGrain(tm, 0.8, t + 0.01 + i * 0.02, 0.7, 0.05, pan + (Math.random() - 0.5) * 0.5, detune);
      }
      nextGrainTime = t + 0.18;
      return;
    }

    // ── Coherent flowing current: focused JI-locked grains. ──
    if (coherence > 0.25 && t >= nextGrainTime) {
      const tm = quantizeToScale(registerMidi);
      const bright = 0.4 + meanSpeed * 2;
      playGrain(tm, Math.min(0.8, bright), t + 0.01, 1.0, 0.09 + coherence * 0.05, pan, 0);
      // Rate scales with speed — faster current, faster re-voicing.
      nextGrainTime = t + Math.max(0.14, 0.4 - meanSpeed * 1.2);
      return;
    }
  }

  return {
    feed,
    getRms: () => Math.min(1, smoothedRms * 6),
    setCorpus: (c) => {
      corpus = c;
    },
    setBuffer: (b) => {
      buffer = b;
    },
    dispose: () => {
      try {
        analyser.disconnect();
        bus.disconnect();
        master.disconnect();
      } catch {
        /* already torn down */
      }
    },
  };
}
