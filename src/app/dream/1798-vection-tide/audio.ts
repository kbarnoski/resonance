// ─────────────────────────────────────────────────────────────────────────────
// 1798-vection-tide · audio.ts — the HRTF orbit engine (the STAR of the piece)
//
//   Sound is the primary medium here; the screen is deliberately near-dark. A
//   small field of warm pad partials + one soft "wind" band of noise each ride
//   its own slow 3-D orbit around the listener via a PannerNode with
//   panningModel:"HRTF". As the whole sound-world lifts, tilts and sweeps around
//   a still head, the brain reads the coherent spatial motion as SELF motion —
//   auditory VECTION. Nothing here relies on a beat frequency; the lever is the
//   MOTION of the sources (PLOS One 2024, PMC11290623).
//
//   Two sources also carry a real audio-rate SPATIAL oscillation: an oscillator
//   is patched straight into panner.positionY at 6 Hz and 40 Hz, so the source
//   POSITION wobbles at those rates (not its amplitude — no strobe, no flicker).
//   That is the exact variable the research isolates.
//
//   Determinism: every rendered/position value is a pure function of an integer
//   frame counter (60 fps clock) and, when present, a smoothed mic-breath scalar.
//   The noise bed is filled from a mulberry32 PRNG seeded with 0x1798. No
//   Math.random / Date.now / new Date anywhere. performance.now() is never used;
//   ctx.currentTime is used only as the audio-scheduling clock, never for visuals.
//
//   Master chain: every voice → bus → DynamicsCompressor → modest master gain
//   (≤0.16) → destination, so layered orbits can never clip. HRTF collapses to a
//   StereoPannerNode fallback if PannerNode is somehow missing (essentially never).
// ─────────────────────────────────────────────────────────────────────────────

const SEED = 0x1798;

/** Deterministic PRNG — only used to fill the static wind-noise buffer once. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/** Live tide description shown to the listener, plus values for the dim horizon. */
export interface TideReadout {
  /** "drifting" | "lifting" | "carried" — the felt phase of the sound-bath. */
  state: string;
  /** 0..1 smoothed breath (mic or self-driving). Drives the horizon glow. */
  breath: number;
  /** -1..1 mean vertical tilt of the field this frame (horizon tilt/rise). */
  lift: number;
  /** 0..1 how far the field has swept open (radius envelope). */
  spread: number;
  /** True when running from the deterministic self-driving tide (no mic). */
  autonomous: boolean;
}

interface OrbitParams {
  radius: number; // base orbit radius (metres in listener space)
  height: number; // base vertical offset
  liftAmp: number; // vertical sweep amplitude
  rateHz: number; // orbital rate (0.05–0.3 Hz — deep, slow)
  phase: number; // starting phase
  figure8: boolean; // trace a figure-8 instead of an ellipse
  tilt: number; // z-vs-x asymmetry of the ellipse
}

interface Voice {
  setPos: (x: number, y: number, z: number) => void;
  orbit: OrbitParams;
  gain: GainNode;
}

// A warm, mostly-consonant field. Each source carries a different partial so the
// spatial separation is genuinely audible: you can point at each voice.
const PAD_FREQS = [110, 164.81, 220, 277.18]; // A2 · E3 · A3 · C#4 (open, warm)

const PAD_ORBITS: OrbitParams[] = [
  { radius: 2.4, height: -0.2, liftAmp: 0.5, rateHz: 0.06, phase: 0.0, figure8: false, tilt: 0.85 },
  { radius: 2.0, height: 0.3, liftAmp: 0.9, rateHz: 0.09, phase: 1.7, figure8: true, tilt: 1.0 },
  { radius: 3.1, height: 0.1, liftAmp: 0.7, rateHz: 0.045, phase: 3.4, figure8: false, tilt: 0.6 },
  { radius: 1.7, height: -0.4, liftAmp: 1.2, rateHz: 0.13, phase: 5.0, figure8: true, tilt: 0.9 },
];

export class VectionEngine {
  private ctx: AudioContext;
  private bus: GainNode;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private wobbleOscs: OscillatorNode[] = [];
  private oscs: OscillatorNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private hrtf = true;
  private started = false;
  private stopped = false;
  private muted = false;
  private motionScale = 1; // damped when the user prefers reduced motion
  private wobbleGains: GainNode[] = [];

  /** Slow the orbits and soften the positional wobble for reduced-motion users. */
  setReducedMotion(reduced: boolean) {
    this.motionScale = reduced ? 0.55 : 1;
    if (reduced) {
      const now = this.ctx.currentTime;
      for (const g of this.wobbleGains) {
        g.gain.setTargetAtTime(g.gain.value * 0.5, now, 0.2);
      }
    }
  }

  // smoothed breath + a running readout the page polls each frame
  private breath = 0.35;
  private lift = 0;
  private spread = 0.4;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.35;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    // HRTF support probe. PannerNode with positionX is universal in modern
    // browsers; only fall back if createPanner is entirely absent.
    this.hrtf = typeof ctx.createPanner === "function";

    this.configureListener();
  }

  /** Point the listener down −Z with +Y up, seated at the origin. */
  private configureListener() {
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(0, t);
      L.positionY.setValueAtTime(0, t);
      L.positionZ.setValueAtTime(0, t);
      L.forwardX.setValueAtTime(0, t);
      L.forwardY.setValueAtTime(0, t);
      L.forwardZ.setValueAtTime(-1, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else {
      // Deprecated API, but keeps very old engines directional.
      const anyL = L as unknown as {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      };
      anyL.setPosition?.(0, 0, 0);
      anyL.setOrientation?.(0, 0, -1, 0, 1, 0);
    }
  }

  private makePanner(): {
    node: AudioNode;
    setPos: (x: number, y: number, z: number) => void;
    posY?: AudioParam;
  } {
    const ctx = this.ctx;
    if (this.hrtf) {
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "inverse";
      p.refDistance = 1.6;
      p.maxDistance = 40;
      p.rolloffFactor = 0.35; // gentle: motion should read as direction, not volume
      const setPos = (x: number, y: number, z: number) => {
        const now = ctx.currentTime;
        if (p.positionX) {
          // smooth toward the target so per-frame writes never click
          p.positionX.setTargetAtTime(x, now, 0.03);
          // positionY is left to setTargetAtTime for the base height; the 6/40 Hz
          // wobble oscillator is summed in on top of this intrinsic value.
          p.positionY.setTargetAtTime(y, now, 0.03);
          p.positionZ.setTargetAtTime(z, now, 0.03);
        } else {
          (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
        }
      };
      return { node: p, setPos, posY: p.positionY ?? undefined };
    }
    // Fallback: no 3-D, but keep it audibly directional via stereo azimuth.
    const sp = ctx.createStereoPanner();
    const setPos = (x: number, _y: number, z: number) => {
      void _y;
      const az = Math.atan2(x, -z); // −π..π
      const pan = Math.max(-1, Math.min(1, Math.sin(az)));
      sp.pan.setTargetAtTime(pan, ctx.currentTime, 0.04);
    };
    return { node: sp, setPos };
  }

  /** Build the field and ramp it in. Call once, inside a user gesture. */
  start() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    // ── warm pad voices, each on its own orbit ───────────────────────────────
    for (let i = 0; i < PAD_ORBITS.length; i++) {
      const orbit = PAD_ORBITS[i];
      const freq = PAD_FREQS[i];

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.0001;
      // higher partials a touch quieter so the low A stays the foundation
      const target = 0.14 / (1 + i * 0.35);
      voiceGain.gain.setValueAtTime(0.0001, t0);
      voiceGain.gain.exponentialRampToValueAtTime(target, t0 + 4 + i * 0.6);

      // warmth: a lowpass tames the triangle's edge into a soft pad
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 0.6;

      const pan = this.makePanner();

      // sine fundamental + gently detuned triangle for body
      const sine = ctx.createOscillator();
      sine.type = "sine";
      sine.frequency.value = freq;
      const tri = ctx.createOscillator();
      tri.type = "triangle";
      tri.frequency.value = freq;
      tri.detune.value = i % 2 === 0 ? 5 : -5;
      const triGain = ctx.createGain();
      triGain.gain.value = 0.35;

      sine.connect(lp);
      tri.connect(triGain);
      triGain.connect(lp);
      lp.connect(voiceGain);
      voiceGain.connect(pan.node);
      pan.node.connect(this.bus);

      sine.start(t0);
      tri.start(t0);
      this.oscs.push(sine, tri);

      // ── the research lever: patch a real 6 Hz / 40 Hz oscillator straight
      // into positionY on two of the sources, so the SOURCE POSITION oscillates
      // at that rate (audio-rate, additive with the base height). Not amplitude.
      if (pan.posY && (i === 1 || i === 3)) {
        const wob = ctx.createOscillator();
        wob.type = "sine";
        wob.frequency.value = i === 1 ? 6 : 40; // the two rates PLOS isolates
        const wobGain = ctx.createGain();
        wobGain.gain.value = i === 1 ? 0.18 : 0.1; // small spatial excursion
        wob.connect(wobGain);
        wobGain.connect(pan.posY);
        wob.start(t0);
        this.wobbleOscs.push(wob);
        this.wobbleGains.push(wobGain);
      }

      this.voices.push({ setPos: pan.setPos, orbit, gain: voiceGain });
    }

    // ── soft filtered-noise "wind", also orbiting ────────────────────────────
    const noiseBuf = this.makeNoiseBuffer(6);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.0001;
    windGain.gain.setValueAtTime(0.0001, t0);
    windGain.gain.exponentialRampToValueAtTime(0.05, t0 + 6);
    const windPan = this.makePanner();
    noise.connect(bp);
    bp.connect(windGain);
    windGain.connect(windPan.node);
    windPan.node.connect(this.bus);
    noise.start(t0);
    this.noiseSrc = noise;
    this.voices.push({
      setPos: windPan.setPos,
      gain: windGain,
      orbit: { radius: 3.6, height: 0.6, liftAmp: 1.4, rateHz: 0.035, phase: 2.2, figure8: true, tilt: 0.5 },
    });

    // master fade-in
    this.master.gain.setValueAtTime(0.0001, t0);
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.16, t0 + 3);
  }

  /** Fill a stereo-free mono noise buffer deterministically (seed 0x1798). */
  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rnd = mulberry32(SEED);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = rnd() * 2 - 1;
      // one-pole lowpass → soft "wind" rather than hiss
      last = last * 0.965 + white * 0.035;
      data[i] = last * 4.5;
    }
    return buf;
  }

  /**
   * Advance one visual frame. `frame` is the integer 60 fps counter (drives all
   * positions deterministically). `micBreath` is a 0..1 mic-RMS scalar, or null
   * to run the self-driving tide. Returns the live readout for the horizon.
   */
  update(frame: number, micBreath: number | null): TideReadout {
    const t = frame / 60;
    const autonomous = micBreath == null;

    // ── breath source ────────────────────────────────────────────────────────
    // Self-driving tide: an asymmetric ~0.05 Hz breathing curve (slow in, slower
    // out), purely a function of the frame counter → identical headless.
    let breathTarget: number;
    if (autonomous) {
      const s = 0.5 + 0.5 * Math.sin(TAU * 0.05 * t - Math.PI / 2);
      breathTarget = Math.pow(s, 1.3); // dwell longer near the exhale
    } else {
      breathTarget = Math.max(0, Math.min(1, micBreath as number));
    }
    // smooth so mic jitter never jerks the field
    this.breath += (breathTarget - this.breath) * 0.03;

    // breath opens the field: deeper breath → wider, higher, faster sweep
    const b = this.breath;
    const speed = (0.6 + b * 0.9) * this.motionScale; // global time-warp of the orbits
    const spreadK = 0.7 + b * 0.6; // radius multiplier
    this.spread += (Math.min(1, (spreadK - 0.7) / 0.6) - this.spread) * 0.05;

    // ── write every source's position from its orbit ─────────────────────────
    let liftSum = 0;
    for (const v of this.voices) {
      const o = v.orbit;
      const a = o.phase + TAU * o.rateHz * t * speed;
      const r = o.radius * spreadK;
      let x: number, z: number;
      if (o.figure8) {
        x = r * Math.sin(a) * o.tilt;
        z = -r * Math.sin(2 * a) * 0.6;
      } else {
        x = r * Math.cos(a) * o.tilt;
        z = -r * Math.sin(a);
      }
      const y = o.height + o.liftAmp * Math.sin(a * 0.5) * (0.5 + 0.5 * b);
      v.setPos(x, y, z);
      liftSum += y;
    }
    this.lift = Math.max(-1, Math.min(1, liftSum / (this.voices.length * 1.4)));

    // ── name the felt phase ──────────────────────────────────────────────────
    let state: string;
    if (b < 0.33) state = "drifting";
    else if (b < 0.66) state = "lifting";
    else state = "carried";

    return { state, breath: b, lift: this.lift, spread: this.spread, autonomous };
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.started || this.stopped) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.16, now, 0.2);
  }

  /** True when running with only the deterministic tide (no HRTF panner). */
  get usingHRTF() {
    return this.hrtf;
  }

  /** Fade out and tear down every node cleanly. Safe to call more than once. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    } catch {
      /* ctx already closing */
    }
    const killAt = now + 0.7;
    for (const o of [...this.oscs, ...this.wobbleOscs]) {
      try {
        o.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      this.noiseSrc?.stop(killAt);
    } catch {
      /* already stopped */
    }
  }
}
