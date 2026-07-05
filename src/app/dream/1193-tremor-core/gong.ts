// ════════════════════════════════════════════════════════════════════════════
// gong.ts — GongEngine: a seismic bell/gong synth for Tremor Core (1193)
//
// Each earthquake STRIKES a resonant, inharmonic metal gong. A strike is:
//
//   [stick-slip friction burst]  →  a very short bandpass-swept noise onset
//        that gives the gong a "grinding" seismic attack rather than a clean
//        mallet. (Modelled after "Echoes of the Land", arXiv 2507.14947, 2025,
//        which treats quakes as stick-slip friction events.)
//   +
//   [7 inharmonic bell partials]  →  ratios [0.5, 1, 1.19, 1.71, 2, 2.74, 3],
//        each its own oscillator with its OWN exponential decay (lower partials
//        ring longer) → a per-voice lowpass.
//
//   → shared procedural convolver REVERB (generated impulse response)
//   → master DynamicsCompressor limiter
//   → master gain (~0.2, ramped from 0 on start)
//
// Mappings:
//   mag   → LOWER fundamental for bigger quakes (660 Hz small … 55 Hz great),
//           SNAPPED to a just-intonation pentatonic grid so overlaps stay consonant
//   mag   → louder + longer ring
//   depth → darker lowpass + slightly more inharmonic detune (deep = muffled)
//
// 16-voice oldest-steal polyphony. Full teardown on stop()/dispose().
// ════════════════════════════════════════════════════════════════════════════

import type { Quake } from "./feeds";

// Inharmonic bell partial ratios and per-partial decay multipliers (lower
// partials ring longer, giving the long metallic hum under the shimmer).
const PARTIAL_RATIOS = [0.5, 1.0, 1.19, 1.71, 2.0, 2.74, 3.0];
const PARTIAL_DECAY = [1.6, 1.35, 1.0, 0.85, 0.7, 0.55, 0.45];
const PARTIAL_GAIN = [0.5, 1.0, 0.55, 0.42, 0.5, 0.28, 0.24];

// Just-intonation pentatonic ratios within an octave.
const JI_PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

interface Voice {
  startedAt: number; // audio-clock time the voice began
  endsAt: number; // when it fully decays (audio-clock)
  nodes: AudioNode[]; // everything to disconnect on steal/teardown
  oscs: OscillatorNode[]; // schedulable sources to stop
}

// Snap an arbitrary frequency to the nearest JI-pentatonic grid frequency,
// anchored on a low reference so overlapping gongs stay consonant.
function snapToPentatonic(freq: number): number {
  const ref = 55; // A1 anchor
  const grid: number[] = [];
  for (let octave = 0; octave < 6; octave++) {
    const base = ref * Math.pow(2, octave);
    for (const r of JI_PENTATONIC) grid.push(base * r);
  }
  let best = grid[0];
  let bestDist = Infinity;
  for (const g of grid) {
    // compare in log space (musical distance)
    const d = Math.abs(Math.log2(g) - Math.log2(freq));
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  }
  return best;
}

// mag 0..7 → ~660 Hz (small) down to ~55 Hz (great), then snapped.
function magToFundamental(mag: number): number {
  const m = Math.max(0, Math.min(7, mag));
  const t = m / 7; // 0..1
  // exponential glide from 660 → 55
  const raw = 660 * Math.pow(55 / 660, t);
  return snapToPentatonic(raw);
}

export class GongEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private reverb: ConvolverNode;
  private reverbGain: GainNode;
  private dryGain: GainNode;
  private noiseBuffer: AudioBuffer;
  private voices: Voice[] = [];
  private readonly maxVoices = 16;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // ramped up in start()

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    // Procedural convolution reverb — exponential-decay noise impulse.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.4, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.85;

    // Reusable white-noise buffer for the stick-slip attack transient.
    this.noiseBuffer = this.makeNoise(0.5);

    // Wiring:  voices → {dry, reverb} → limiter → master → destination
    this.dryGain.connect(this.limiter);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);
  }

  // Generate an exponential-decay noise impulse response for the convolver.
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = this.ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Ramp the master gain up from 0 (call after a user gesture). */
  start(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(0.2, now + 0.8);
  }

  // Reap finished voices; steal oldest if over the cap.
  private reap(now: number): void {
    this.voices = this.voices.filter((v) => {
      if (v.endsAt <= now) {
        this.killVoice(v);
        return false;
      }
      return true;
    });
    while (this.voices.length >= this.maxVoices) {
      const oldest = this.voices.shift();
      if (oldest) this.killVoice(oldest);
    }
  }

  private killVoice(v: Voice): void {
    for (const o of v.oscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  /** Strike the gong for one quake. */
  strike(q: Quake): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.reap(now);

    const mag = Math.max(0, Math.min(7, q.mag));
    const magT = mag / 7; // 0..1
    const depthT = Math.max(0, Math.min(1, q.depth / 700)); // 0 shallow, 1 deep

    const f0 = magToFundamental(mag);

    // amplitude + ring length scale with magnitude.
    const peak = 0.16 + magT * 0.5;
    const ringBase = 1.6 + magT * 5.5; // seconds for the fundamental

    // depth → darker lowpass (deep = muffled) and more inharmonic detune.
    const cutoff = 6500 - depthT * 5200; // 6500 (shallow) → 1300 Hz (deep)
    const detuneAmt = depthT * 22; // cents of extra inharmonic spread

    const voiceNodes: AudioNode[] = [];
    const voiceOscs: OscillatorNode[] = [];

    // Per-voice lowpass shared by all partials of this strike.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(200, cutoff);
    lp.Q.value = 0.6;
    lp.connect(this.dryGain);
    lp.connect(this.reverb);
    voiceNodes.push(lp);

    let voiceEnd = now + ringBase;

    // ── The clean inharmonic bell partials ──
    for (let i = 0; i < PARTIAL_RATIOS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const detune = (i % 2 === 0 ? 1 : -1) * detuneAmt * (i / PARTIAL_RATIOS.length);
      osc.frequency.value = f0 * PARTIAL_RATIOS[i];
      osc.detune.value = detune;

      const g = ctx.createGain();
      const decay = ringBase * PARTIAL_DECAY[i];
      const pPeak = Math.max(0.001, peak * PARTIAL_GAIN[i]);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(pPeak, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(g);
      g.connect(lp);
      osc.start(now);
      osc.stop(now + decay + 0.05);
      voiceOscs.push(osc);
      voiceNodes.push(osc, g);
      voiceEnd = Math.max(voiceEnd, now + decay + 0.05);
    }

    // ── Stick-slip friction attack: short bandpass-swept noise burst ──
    const burstLen = 0.04 + magT * 0.05; // 40–90 ms, bigger quakes grind longer
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    // sweep the band down for a "grinding release" — from high friction to seat
    const bpStart = 900 + (1 - depthT) * 1600;
    const bpEnd = 180 + magT * 120;
    bp.frequency.setValueAtTime(bpStart, now);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, bpEnd), now + burstLen);

    const ng = ctx.createGain();
    const nPeak = Math.max(0.001, (0.1 + magT * 0.28));
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(nPeak, now + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + burstLen);

    noise.connect(bp);
    bp.connect(ng);
    ng.connect(lp);
    noise.start(now);
    noise.stop(now + burstLen + 0.02);
    voiceOscs.push(noise as unknown as OscillatorNode); // shares stop() interface
    voiceNodes.push(noise, bp, ng);

    this.voices.push({
      startedAt: now,
      endsAt: voiceEnd,
      nodes: voiceNodes,
      oscs: voiceOscs,
    });
  }

  /** Ramp master down (soft stop) without tearing down the graph. */
  stop(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 0.4);
  }

  /** Fully tear down: stop all voices, disconnect all nodes, close context. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const v of this.voices) this.killVoice(v);
    this.voices = [];
    for (const n of [
      this.dryGain,
      this.reverb,
      this.reverbGain,
      this.limiter,
      this.master,
    ]) {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {
        /* noop */
      });
    }
  }
}
