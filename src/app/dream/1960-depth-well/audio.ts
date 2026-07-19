// audio.ts — spatial just-intonation MEMORY engine for 1960 · DEPTH WELL.
//
// Pure Web Audio (no deps). Every durable memory-node owns a soft voice that
// keeps sounding a partial of a low root; the live "present" locus has its own
// warm amber voice that tracks wherever your body currently is. Nothing clicks:
// every gain/frequency change glides via setTargetAtTime.
//
// Signal path:
//   node voices ─┐
//                ├─► mixBus ─► softClip (tanh) ─► limiter ─► master (≤0.16) ─► out
//   present ─────┘
//
// The scale is a NON-pentatonic just-intonation stack over 55 Hz, spread across
// two octaves so DEPTH can pick both a partial and a register.

export const ROOT = 55;
export const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

// Two-octave just scale, low → high (near presence = brighter/higher partials).
export const SCALE: number[] = (() => {
  const s: number[] = [];
  for (const r of JI) s.push(ROOT * r); // 55 .. 110
  for (let i = 1; i < JI.length; i++) s.push(ROOT * 2 * JI[i]); // 123.75 .. 220
  return s;
})();

/** Map a 0..1 depth band to a scale frequency + its index. */
export function freqForDepth(band: number): { freq: number; index: number } {
  const b = Math.max(0, Math.min(1, band));
  const index = Math.round(b * (SCALE.length - 1));
  return { freq: SCALE[index], index };
}

interface Voice {
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  oscs: OscillatorNode[];
  base: number;
  peak: number;
}

export interface WellAudio {
  readonly running: boolean;
  ensureNode(id: number, freq: number, pan: number): void;
  updateNode(id: number, swell01: number): void;
  pluckNode(id: number): void;
  removeNode(id: number): void;
  updatePresent(freq: number, pan: number, level01: number): void;
  stop(): void;
}

const MASTER_PEAK = 0.16;

function tanhCurve() {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.6);
  }
  return c;
}

export async function startWellAudio(): Promise<WellAudio> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();
  const now = ctx.currentTime;

  // ── master chain ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(MASTER_PEAK, now + 1.6);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(8, now);
  limiter.ratio.setValueAtTime(12, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.25, now);

  const shaper = ctx.createWaveShaper();
  shaper.curve = tanhCurve();
  shaper.oversample = "2x";

  shaper.connect(limiter);
  limiter.connect(master);
  master.connect(ctx.destination);

  const mixBus = ctx.createGain();
  mixBus.gain.value = 1;
  mixBus.connect(shaper);

  const voices = new Map<number, Voice>();

  function makeVoice(freq: number, pan: number): Voice {
    const oscA = ctx.createOscillator();
    oscA.type = "triangle";
    oscA.frequency.setValueAtTime(freq, ctx.currentTime);
    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.setValueAtTime(freq * 2, ctx.currentTime); // octave shimmer
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.35;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 3.2, ctx.currentTime);
    filter.Q.value = 0.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);

    oscA.connect(filter);
    oscB.connect(oscBGain);
    oscBGain.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(mixBus);
    oscA.start();
    oscB.start();

    return { gain, filter, panner, oscs: [oscA, oscB], base: 0.014, peak: 0.085 };
  }

  // ── present (amber) locus voice ─────────────────────────────────────────────
  const presFilter = ctx.createBiquadFilter();
  presFilter.type = "lowpass";
  presFilter.frequency.setValueAtTime(600, now);
  presFilter.Q.value = 0.5;
  const presGain = ctx.createGain();
  presGain.gain.setValueAtTime(0.0001, now);
  const presPan = ctx.createStereoPanner();
  const presA = ctx.createOscillator();
  presA.type = "sine";
  presA.frequency.setValueAtTime(110, now);
  const presB = ctx.createOscillator();
  presB.type = "triangle";
  presB.frequency.setValueAtTime(110, now);
  const presBGain = ctx.createGain();
  presBGain.gain.value = 0.25;
  presA.connect(presFilter);
  presB.connect(presBGain);
  presBGain.connect(presFilter);
  presFilter.connect(presGain);
  presGain.connect(presPan);
  presPan.connect(mixBus);
  presA.start();
  presB.start();

  let alive = true;

  return {
    get running() {
      return alive;
    },
    ensureNode(id, freq, pan) {
      if (!alive || voices.has(id)) return;
      voices.set(id, makeVoice(freq, pan));
    },
    updateNode(id, swell01) {
      const v = voices.get(id);
      if (!v) return;
      const s = Math.max(0, Math.min(1, swell01));
      const g = v.base + s * (v.peak - v.base);
      const t = ctx.currentTime;
      v.gain.gain.setTargetAtTime(g, t, 0.14);
      v.filter.frequency.setTargetAtTime(
        v.oscs[0].frequency.value * (2.2 + s * 3.5),
        t,
        0.2,
      );
    },
    pluckNode(id) {
      const v = voices.get(id);
      if (!v) return;
      const t = ctx.currentTime;
      // gentle chime: quick swell then settle, plus a filter bloom.
      const cur = v.gain.gain.value;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(Math.max(0.0001, cur), t);
      v.gain.gain.linearRampToValueAtTime(v.peak * 1.15, t + 0.04);
      v.gain.gain.setTargetAtTime(v.base + v.peak * 0.4, t + 0.05, 0.5);
      const f0 = v.oscs[0].frequency.value;
      v.filter.frequency.cancelScheduledValues(t);
      v.filter.frequency.setValueAtTime(f0 * 6.5, t);
      v.filter.frequency.setTargetAtTime(f0 * 2.6, t, 0.4);
    },
    removeNode(id) {
      const v = voices.get(id);
      if (!v) return;
      voices.delete(id);
      const t = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
      v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      window.setTimeout(() => {
        for (const o of v.oscs) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        }
        try {
          v.panner.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
        } catch {
          /* ignore */
        }
      }, 700);
    },
    updatePresent(freq, pan, level01) {
      if (!alive) return;
      const t = ctx.currentTime;
      const lv = Math.max(0, Math.min(1, level01));
      presA.frequency.setTargetAtTime(freq, t, 0.12);
      presB.frequency.setTargetAtTime(freq, t, 0.12);
      presFilter.frequency.setTargetAtTime(freq * (2 + lv * 4), t, 0.2);
      presGain.gain.setTargetAtTime(lv * 0.05, t, 0.12);
      presPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
    },
    stop() {
      alive = false;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.0001, t + 0.2);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        for (const v of voices.values()) {
          for (const o of v.oscs) {
            try {
              o.stop();
            } catch {
              /* ignore */
            }
          }
        }
        try {
          presA.stop();
          presB.stop();
        } catch {
          /* ignore */
        }
        void ctx.close().catch(() => {});
      }, 260);
    },
  };
}
