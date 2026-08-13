// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the WebAudio HRTF + FDN-room spatial field for orbit•hall.
//
// THE SCIENCE. Distance perception in a room is governed by the
// Direct-to-Reverberant Ratio (DRR): the level of the direct sound relative to
// the reverberant tail. Near source → high DRR (loud direct, little reverb,
// bright). Far source → low DRR (quiet direct, lots of reverb, dark). See the
// survey arXiv:2503.12948. This file implements that literally.
//
// THE TECHNIQUE. Each voice is an OscillatorNode bank. It splits into:
//   • a DRY path — per-source dry gain → PannerNode (HRTF) → master. Direct sound.
//   • a WET path — per-source wet-send gain → a shared FEEDBACK-DELAY-NETWORK
//     room → master. Reverberant sound.
// The FDN is a ring of four DelayNodes, each fed back through a damping lowpass
// into the next line, producing a diffuse decaying tail. This is deliberately a
// different reverberator from a ConvolverNode — an FDN is a recirculating
// structure, not a fixed impulse convolution — which is what makes this a
// distinct technical approach from a convolution room.
//
// Each frame we compute source→listener distance d and set, with a ~50 ms
// setTargetAtTime glide so nothing zippers:
//   dry     ∝ 1/(1 + k·d)                (falls with distance)
//   wetSend ∝ rises and saturates with d (grows with distance)
//   cutoff  falls with d                 (far = darker direct sound)
// so the DRR falls with distance — the felt depth cue. The realised DRR (in dB)
// is exposed per source so the 3-D tether viz can draw it.
//
// HRTF binaural: each dry path is a PannerNode with panningModel:"HRTF" at the
// source's fixed 3-D position; the single AudioListener is moved to the avatar
// each frame. Genuine binaural on headphones.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed source placement (metres) in the room plane + a cool map hue. */
export interface SourceSpec {
  x: number;
  z: number;
  hue: number; // degrees, kept in a cool 180–215 band
}

/** Per-frame public view of one source, for the 3-D viz. */
export interface SourceView {
  x: number;
  z: number;
  hue: number;
  /** Current breathing level 0..1 (drives glow size / brightness). */
  level: number;
  /** Current source→listener distance (metres). */
  d: number;
  /** Normalised Direct-to-Reverberant Ratio, 1 = near/dry, 0 = far/wet. */
  drr01: number;
}

export interface HallAudio {
  setListener: (x: number, y: number, z: number) => void;
  step: (dt: number) => void;
  sources: SourceView[];
  stop: () => void;
}

// Sources placed at DELIBERATELY VARIED distances/angles so "near vs far" reads
// spatially rather than sitting on one ring.
const SOURCES: SourceSpec[] = [
  { x: -0.9, z: -1.1, hue: 188 }, // near, front-left
  { x: 2.9, z: -0.4, hue: 200 }, // far, right
  { x: -3.2, z: 1.6, hue: 210 }, // far, back-left
  { x: 1.2, z: 1.0, hue: 194 }, // mid, back-right
  { x: 0.2, z: 3.1, hue: 205 }, // far, deep-back
];

// A low, calm inharmonic drone set — meditative, not a melody.
const VOICES: { freq: number; lfoHz: number }[] = [
  { freq: 55.0, lfoHz: 0.031 }, // A1
  { freq: 66.0, lfoHz: 0.045 }, // 6/5
  { freq: 82.5, lfoHz: 0.038 }, // 3/2
  { freq: 88.0, lfoHz: 0.053 }, // 8/5
  { freq: 110.0, lfoHz: 0.027 }, // 2/1
];

const PARTIALS: { ratio: number; gain: number }[] = [
  { ratio: 1.0, gain: 1.0 },
  { ratio: 1.004, gain: 0.6 }, // detuned unison → width
  { ratio: 2.01, gain: 0.34 },
  { ratio: 3.02, gain: 0.15 },
];

const BASE_LEVEL = 0.13; // per-voice ceiling before breathing

/** The fixed source layout — exported so the viz can draw before audio starts. */
export function sourceLayout(): SourceSpec[] {
  return SOURCES.map((s) => ({ ...s }));
}

/** Euclidean distance from the listener (metres) to a source in the room plane. */
export function hallDistance(
  lx: number,
  lz: number,
  sx: number,
  sz: number,
): number {
  const dx = sx - lx;
  const dz = sz - lz;
  return Math.sqrt(dx * dx + dz * dz);
}

const DRY_K = 0.55;
function dryFromDistance(d: number): number {
  return 1 / (1 + DRY_K * d);
}
function wetFromDistance(d: number): number {
  return 0.1 + 0.24 * (d / (1 + 0.35 * d));
}
function cutoffFromDistance(d: number): number {
  return 900 + 7200 / (1 + 0.6 * d);
}

/**
 * Realised Direct-to-Reverberant Ratio, normalised to 0..1 for the viz.
 * 1 = near / high-DRR / dry, 0 = far / low-DRR / wet. Shared by audio + visuals
 * so the tethers show exactly the ratio the ears are getting.
 */
export function drrFromDistance(d: number): number {
  const dry = dryFromDistance(d);
  const wet = wetFromDistance(d);
  const db = 20 * Math.log10(dry / wet);
  // Map the useful DRR span (≈ −6 dB … +18 dB) onto 0..1.
  return Math.min(1, Math.max(0, (db + 6) / 24));
}

function setListenerOrientation(listener: AudioListener) {
  // Face −Z, up +Y (the hall's "front" wall is straight ahead).
  if (listener.forwardX) {
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else if (typeof listener.setOrientation === "function") {
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }
}

interface Voice {
  oscs: OscillatorNode[];
  voiceGain: GainNode;
  drySend: GainNode;
  wetSend: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode;
  lfoHz: number;
  lfoPhase: number;
}

// ── the shared feedback-delay-network room ───────────────────────────────────
interface Fdn {
  input: GainNode;
  delays: DelayNode[];
  damps: BiquadFilterNode[];
  fbs: GainNode[];
  out: GainNode;
  disconnect: () => void;
}

function makeFdn(ctx: AudioContext, dest: AudioNode): Fdn {
  // Four mutually-prime delay times → a diffuse, uncoloured tail.
  const times = [0.0231, 0.0313, 0.0417, 0.0529];
  const input = ctx.createGain();
  input.gain.value = 1;
  const out = ctx.createGain();
  out.gain.value = 0.9;

  const delays: DelayNode[] = [];
  const damps: BiquadFilterNode[] = [];
  const fbs: GainNode[] = [];

  for (let i = 0; i < times.length; i++) {
    const d = ctx.createDelay(0.2);
    d.delayTime.value = times[i];
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 3200; // absorb highs each pass — a real room does
    damp.Q.value = 0.707;
    const fb = ctx.createGain();
    fb.gain.value = 0.82; // ring loop-gain 0.82^4 ≈ 0.45 → decays, always stable
    delays.push(d);
    damps.push(damp);
    fbs.push(fb);
  }

  for (let i = 0; i < delays.length; i++) {
    input.connect(delays[i]); // inject the wet bus into every line
    delays[i].connect(damps[i]);
    damps[i].connect(fbs[i]);
    fbs[i].connect(delays[(i + 1) % delays.length]); // feedback ring
    delays[i].connect(out); // tap the tail
  }
  out.connect(dest);

  return {
    input,
    delays,
    damps,
    fbs,
    out,
    disconnect() {
      try {
        input.disconnect();
        out.disconnect();
        for (const n of [...delays, ...damps, ...fbs]) n.disconnect();
      } catch {
        /* ctx closing */
      }
    },
  };
}

export function makeHallAudio(ctx: AudioContext, dest: AudioNode): HallAudio {
  const now = ctx.currentTime;
  setListenerOrientation(ctx.listener);

  const fdn = makeFdn(ctx, dest);

  const voices: Voice[] = VOICES.map((spec, i) => {
    const s = SOURCES[i];

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 24;
    panner.rolloffFactor = 0.6;
    if (panner.positionX) {
      panner.positionX.value = s.x;
      panner.positionY.value = 0;
      panner.positionZ.value = s.z;
    } else {
      panner.setPosition(s.x, 0, s.z);
    }
    panner.connect(dest);

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = BASE_LEVEL * 0.5;

    // per-source darkening lowpass sits before the split so both dry + wet dim
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    lp.Q.value = 0.707;
    voiceGain.connect(lp);

    const drySend = ctx.createGain();
    drySend.gain.value = 0.8;
    lp.connect(drySend);
    drySend.connect(panner);

    const wetSend = ctx.createGain();
    wetSend.gain.value = 0.15;
    lp.connect(wetSend);
    wetSend.connect(fdn.input);

    const oscs: OscillatorNode[] = PARTIALS.map((part) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = spec.freq * part.ratio;
      const g = ctx.createGain();
      g.gain.value = part.gain / PARTIALS.length;
      osc.connect(g);
      g.connect(voiceGain);
      osc.start(now);
      return osc;
    });

    return {
      oscs,
      voiceGain,
      drySend,
      wetSend,
      lp,
      panner,
      lfoHz: spec.lfoHz,
      lfoPhase: (i / VOICES.length) * Math.PI * 2,
    };
  });

  let clock = 0;
  let stopped = false;
  let lx = 0;
  let lz = 0;

  const sources: SourceView[] = SOURCES.map((s) => ({
    x: s.x,
    z: s.z,
    hue: s.hue,
    level: 0.5,
    d: hallDistance(0, 0, s.x, s.z),
    drr01: drrFromDistance(hallDistance(0, 0, s.x, s.z)),
  }));

  return {
    sources,
    setListener(x: number, y: number, z: number) {
      if (stopped) return;
      lx = x;
      lz = z;
      const t = ctx.currentTime;
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.setTargetAtTime(x, t, 0.05);
        l.positionY.setTargetAtTime(y, t, 0.05);
        l.positionZ.setTargetAtTime(z, t, 0.05);
      } else {
        l.setPosition(x, y, z);
      }
    },
    step(dt: number) {
      if (stopped) return;
      clock += dt;
      const t = ctx.currentTime;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        const s = SOURCES[i];
        // Slow breathing: level ∈ [0.4, 1]. Well under any flicker concern.
        const b =
          0.5 + 0.5 * Math.sin(clock * v.lfoHz * Math.PI * 2 + v.lfoPhase);
        const level = 0.4 + 0.6 * b;

        const d = hallDistance(lx, lz, s.x, s.z);
        const dry = dryFromDistance(d);
        const wet = wetFromDistance(d);
        const cutoff = cutoffFromDistance(d);

        v.voiceGain.gain.setTargetAtTime(BASE_LEVEL * level, t, 0.2);
        v.drySend.gain.setTargetAtTime(dry, t, 0.05);
        v.wetSend.gain.setTargetAtTime(wet, t, 0.05);
        v.lp.frequency.setTargetAtTime(cutoff, t, 0.05);

        sources[i].level = level;
        sources[i].d = d;
        sources[i].drr01 = drrFromDistance(d);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      for (const v of voices) {
        try {
          v.voiceGain.gain.cancelScheduledValues(t);
          v.voiceGain.gain.setValueAtTime(v.voiceGain.gain.value, t);
          v.voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          for (const osc of v.oscs) osc.stop(t + 0.7);
        } catch {
          /* ctx already closing */
        }
      }
      window.setTimeout(() => fdn.disconnect(), 800);
    },
  };
}
