// instrument.ts — the flock IS the corpus-navigation agent.
//
// Each audio tick we read the flock's emergent shape statistics and translate
// them into CataRT-style granular re-synthesis of Karel's piano:
//
//   • centroid.y      -> target register (high centroid = bright/high notes).
//   • order/alignment -> just-intonation locking. A tight, aligned herd snaps
//                        target pitches to a JI scale (focused, consonant);
//                        a scattered, disordered flock detunes them into a
//                        shimmering cosmic cloud.
//   • dispersion      -> grain density + stereo width + detune spread.
//   • speed           -> grain rate and brightness target.
//   • sudden contraction (falling dispersion) -> an onset BURST of grains.
//
// Each grain = BufferSource (looped slice of the piano) + raised-cosine gain
// envelope + StereoPanner, summed into a master bus -> DynamicsCompressor
// limiter -> destination. Gesture-gated start; full teardown on stop.
//
// Diemo Schwarz, CataRT / corpus-based concatenative synthesis; "The
// Concatenator" (arXiv 2411.04366) & MACataRT (arXiv 2502.00023) frame
// concatenative synthesis as an agent navigating a corpus — the flock is that
// agent here.

import { selectGrain, type Grain } from "./source";
import type { FlockStats } from "./flock";

// 7-limit-ish just intonation ratios over an octave (focused/consonant set).
const JI_RATIOS = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const ROOT_MIDI = 50; // D3 — anchor of the cosmic drift

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Quantize a continuous target MIDI to the nearest JI scale tone (lock=1) or
 *  leave it freely detuned (lock=0), interpolating between. */
function runScaleLock(targetMidi: number, lock: number): number {
  // candidate JI pitches across 4 octaves from ROOT
  let best = targetMidi;
  let bestD = Infinity;
  for (let oct = 0; oct < 4; oct++) {
    for (const ratio of JI_RATIOS) {
      const hz = midiToHz(ROOT_MIDI) * ratio * Math.pow(2, oct);
      const m = 69 + 12 * Math.log2(hz / 440);
      const d = Math.abs(m - targetMidi);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
  }
  return targetMidi + (best - targetMidi) * lock;
}

export interface InstrumentHandle {
  /** Drive the instrument from this frame's flock statistics. */
  update(stats: FlockStats): void;
  /** Tear down every audio node. Idempotent. */
  destroy(): void;
}

export function createInstrument(
  ctx: AudioContext,
  buffer: AudioBuffer,
  corpus: Grain[],
): InstrumentHandle {
  // master bus -> limiter -> destination
  const master = ctx.createGain();
  master.gain.value = 0.0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.18;
  // a touch of cosmic space
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const conv = ctx.createConvolver();
  conv.buffer = makeReverbIR(ctx, 2.4);

  master.connect(limiter);
  master.connect(conv);
  conv.connect(wet);
  wet.connect(limiter);
  limiter.connect(ctx.destination);

  // fade master in
  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.85, now + 1.2);

  let destroyed = false;
  let voices = 0;
  const MAX_VOICES = 18;
  let lastDispersion = 0.2;
  let grainClock = 0; // accumulates time; when >= interval, fire a grain
  let prevTime = ctx.currentTime;

  const live = new Set<{ src: AudioBufferSourceNode; g: GainNode; p: StereoPannerNode }>();

  function fireGrain(stats: FlockStats, burst = false) {
    if (destroyed || voices >= MAX_VOICES) return;
    const lock = stats.order; // alignment -> JI lock amount
    // centroid.y (0 top..1 bottom) -> register: top of screen = high
    const register = ROOT_MIDI + 6 + (1 - stats.cy) * 30; // ~D3..A5
    const wobble = (Math.random() - 0.5) * stats.dispersion * 14; // cosmic detune
    let targetMidi = runScaleLock(register + wobble, lock);
    if (burst) targetMidi += [0, 7, 12, 4][Math.floor(Math.random() * 4)] - 0;

    const brightTarget = Math.min(1, 0.25 + stats.speed * 0.7);
    const grain = selectGrain(corpus, targetMidi, brightTarget);
    if (!grain) return;

    // playbackRate to retune the chosen grain toward the target pitch
    const rate = midiToHz(targetMidi) / Math.max(40, grain.hz);
    const clampedRate = Math.min(2.6, Math.max(0.4, rate));

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clampedRate;

    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    // dispersion -> stereo width; centroid.x -> base position
    pan.pan.value = Math.max(-1, Math.min(1,
      (stats.cx - 0.5) * 1.4 + (Math.random() - 0.5) * stats.dispersion * 2.4));

    src.connect(g);
    g.connect(pan);
    pan.connect(master);

    const t0 = ctx.currentTime;
    const dur = grain.duration * (0.8 + Math.random() * 0.6);
    const peak = (burst ? 0.5 : 0.3) * (0.5 + grain.rms * 0.7);
    const attack = burst ? 0.006 : 0.03 + Math.random() * 0.05;
    const release = dur * 0.7;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.01, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);

    src.start(t0, grain.offset, dur + 0.05);
    voices++;
    const voice = { src, g, p: pan };
    live.add(voice);
    src.onended = () => {
      try {
        g.disconnect();
        pan.disconnect();
      } catch {
        /* ignore */
      }
      live.delete(voice);
      voices = Math.max(0, voices - 1);
    };
  }

  function update(stats: FlockStats) {
    if (destroyed) return;
    const t = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, t - prevTime));
    prevTime = t;

    // grain rate: faster, denser when the flock is energetic & spread
    const density = 0.4 + stats.speed * 2.2 + stats.dispersion * 3.0;
    const interval = 1 / Math.max(0.4, Math.min(14, density)); // seconds/grain
    grainClock += dt;
    while (grainClock >= interval) {
      grainClock -= interval;
      fireGrain(stats);
    }

    // sudden contraction detection -> onset burst
    const contraction = lastDispersion - stats.dispersion;
    if (contraction > 0.025 && stats.order > 0.25) {
      const burstN = Math.min(5, Math.floor(contraction * 80));
      for (let i = 0; i < burstN; i++) fireGrain(stats, true);
    }
    lastDispersion = lastDispersion * 0.9 + stats.dispersion * 0.1;

    // master loudness follows energy a little (quiet at idle, present when conducted)
    const targetGain = 0.5 + Math.min(0.45, stats.speed * 0.5 + stats.order * 0.2);
    master.gain.setTargetAtTime(targetGain, t, 0.25);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.15);
    } catch {
      /* ignore */
    }
    for (const v of live) {
      try {
        v.src.stop();
        v.src.disconnect();
        v.g.disconnect();
        v.p.disconnect();
      } catch {
        /* ignore */
      }
    }
    live.clear();
    setTimeout(() => {
      try {
        master.disconnect();
        limiter.disconnect();
        conv.disconnect();
        wet.disconnect();
      } catch {
        /* ignore */
      }
    }, 220);
  }

  return { update, destroy };
}

/** Small algorithmic reverb impulse response (decaying noise) for cosmic space. */
function makeReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
    }
  }
  return ir;
}
