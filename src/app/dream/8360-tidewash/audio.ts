// Granular synthesis of a warm, self-contained pad — stirred by the fluid.
//
// A short warm chord tone is rendered once into an AudioBuffer (deterministic,
// mulberry32). Grains are cut from it at a constellation of "listening points"
// that sample the flow field: where the fluid swirls fast, grains fire denser,
// brighter and shorter; calm pools go sparse, long and deep. A quiet detuned
// bed drone under everything means calm never means silence — it means depth.
// Everything runs through a synthesized convolution reverb for cosmic space.

import { mulberry32 } from "./prng";

export interface PointEnergy {
  /** stereo pan, -1..1 */
  pan: number;
  /** base frequency for grains at this point (Hz) */
  freq: number;
  /** local flow speed 0..1 */
  speed: number;
  /** local vorticity -1..1 */
  vort: number;
  /** local dye energy 0..1 */
  energy: number;
}

export interface GranularEngine {
  start(): void;
  update(points: PointEnergy[]): void;
  stop(): void;
}

const FREF = 220; // reference pitch the pad buffer is rendered at

function makePadBuffer(ctx: AudioContext, rnd: () => number): AudioBuffer {
  const dur = 3.2;
  const sr = ctx.sampleRate;
  const len = Math.floor(dur * sr);
  const buf = ctx.createBuffer(2, len, sr);
  // warm additive tone: harmonic series with 1/n falloff + gentle detune beats
  const partials = 8;
  const detune: number[] = [];
  const amp: number[] = [];
  const phase: number[] = [];
  for (let k = 1; k <= partials; k++) {
    detune.push(1 + (rnd() - 0.5) * 0.004 * k);
    amp.push(Math.pow(1 / k, 1.15) * (0.7 + rnd() * 0.3));
    phase.push(rnd() * Math.PI * 2);
  }
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const stereoDet = ch === 0 ? 0.9985 : 1.0015;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let s = 0;
      for (let k = 0; k < partials; k++) {
        const f = FREF * (k + 1) * detune[k] * stereoDet;
        // slow FM shimmer keeps the pad alive rather than static
        const fm = 1 + 0.0015 * Math.sin(2 * Math.PI * 0.7 * (k + 1) * t);
        s += amp[k] * Math.sin(2 * Math.PI * f * fm * t + phase[k]);
      }
      // soft overall breathing so grains never sound identical
      s *= 0.16 * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.13 * t));
      data[i] = s;
    }
  }
  return buf;
}

function makeReverbIR(ctx: AudioContext, rnd: () => number): AudioBuffer {
  const dur = 3.4;
  const sr = ctx.sampleRate;
  const len = Math.floor(dur * sr);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      d[i] = (rnd() * 2 - 1) * decay;
    }
  }
  return ir;
}

export function makeGranularEngine(
  ctx: AudioContext,
  seed: number,
  calm: boolean,
): GranularEngine {
  const rnd = mulberry32(seed);
  const pad = makePadBuffer(ctx, rnd);
  const ir = makeReverbIR(ctx, mulberry32(seed ^ 0x9e3779b9));

  // ── master bus ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  const wet = ctx.createGain();
  wet.gain.value = 0.42;
  const verb = ctx.createConvolver();
  verb.buffer = ir;

  const grainBus = ctx.createGain();
  grainBus.gain.value = 1;
  grainBus.connect(dry);
  grainBus.connect(verb);
  verb.connect(wet);
  dry.connect(master);
  wet.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── bed drone (never silent, just deep when calm) ─────────────────────────
  const bedRoots = [110, 146.83, 130.81, 98]; // A2, D3, C3, G2 — warm drift
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.0;
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 520;
  bedFilter.Q.value = 0.6;
  bedGain.connect(bedFilter);
  bedFilter.connect(dry);
  bedFilter.connect(verb);
  const bedOscs: OscillatorNode[] = [];
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = bedRoots[0] * (i === 2 ? 2 : 1);
    o.detune.value = (i - 1) * 6;
    o.connect(bedGain);
    bedOscs.push(o);
  }

  let points: PointEnergy[] = [];
  const nextTime: number[] = [];
  let timer: number | null = null;
  let bedIdx = 0;
  let bedTimer: number | null = null;
  let started = false;

  const maxDensity = calm ? 0.55 : 1;

  function scheduleGrain(p: PointEnergy, when: number): void {
    const d = Math.min(1, p.speed * 0.85 + p.energy * 0.5);
    const amp =
      (0.04 + p.energy * 0.5 + p.speed * 0.4) * (calm ? 0.7 : 1) * 0.5;
    if (amp < 0.006) return;
    const dur = 0.06 + (1 - d) * 0.18;

    const src = ctx.createBufferSource();
    src.buffer = pad;
    // pitch: point base freq, occasionally an octave up in vigorous flow
    let rate = p.freq / FREF;
    if (p.speed > 0.6 && rnd() < 0.3) rate *= 2;
    src.playbackRate.value = rate * (0.997 + rnd() * 0.006);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(amp, when + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Math.min(
      12000,
      p.freq * (2 + p.speed * 5) + Math.abs(p.vort) * 1500,
    );
    bp.Q.value = 1.4;

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, p.pan));

    src.connect(g);
    g.connect(bp);
    bp.connect(pan);
    pan.connect(grainBus);

    const offset = rnd() * (pad.duration - dur - 0.05);
    src.start(when, Math.max(0, offset), dur + 0.02);
    src.stop(when + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      bp.disconnect();
      pan.disconnect();
    };
  }

  function tick(): void {
    const now = ctx.currentTime;
    const horizon = now + 0.12;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (nextTime[i] < now) nextTime[i] = now + 0.01;
      const d = Math.min(maxDensity, p.speed * 0.85 + p.energy * 0.5);
      const interval = 0.5 - d * 0.45; // dense where the flow swirls fast
      while (nextTime[i] < horizon) {
        scheduleGrain(p, nextTime[i]);
        nextTime[i] += Math.max(0.04, interval);
      }
    }
  }

  function driftBed(): void {
    bedIdx = (bedIdx + 1) % bedRoots.length;
    const root = bedRoots[bedIdx];
    const t = ctx.currentTime;
    bedOscs.forEach((o, i) => {
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(o.frequency.value, t);
      o.frequency.linearRampToValueAtTime(root * (i === 2 ? 2 : 1), t + 6);
    });
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      const t = ctx.currentTime;
      bedGain.gain.setValueAtTime(0.0001, t);
      bedGain.gain.linearRampToValueAtTime(calm ? 0.05 : 0.08, t + 3);
      bedOscs.forEach((o) => o.start());
      timer = window.setInterval(tick, 30);
      bedTimer = window.setInterval(driftBed, 9000);
    },
    update(next: PointEnergy[]): void {
      points = next;
      while (nextTime.length < points.length) {
        nextTime.push(ctx.currentTime);
      }
    },
    stop(): void {
      if (timer !== null) window.clearInterval(timer);
      if (bedTimer !== null) window.clearInterval(bedTimer);
      timer = null;
      bedTimer = null;
      try {
        bedOscs.forEach((o) => o.stop());
      } catch {
        /* already stopped */
      }
    },
  };
}
