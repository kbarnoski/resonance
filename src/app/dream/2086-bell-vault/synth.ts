// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — the Bell Vault physical-modeling voice engine.
//
// A browser Web-Audio realization of the banded-waveguide / modal-synthesis
// family (Essl & Cook, ICMC 1999; Perry Cook's STK modal & banded-waveguide
// models). Every struck body is a REAL dispersive resonant object built from a
// bank of high-Q bandpass resonators, one per vibrational mode:
//
//     exciter burst  ──►  dispersion allpass  ──►  ┌ bandpass @ f·r₀ (Q₀) ┐
//     (raised-cosine)                               ├ bandpass @ f·r₁ (Q₁) ┤ ─► voice
//     + per-strike jitter                           └ bandpass @ f·rₙ (Qₙ) ┘
//
//   • The ring you hear is the resonators' own decay, NOT an imposed sample.
//     Each mode's decay time τ = Q / (π·f), so bright high modes fade first —
//     the frequency-dependent damping of a real metal body falls out for free.
//   • Materials differ ONLY by their INHARMONIC partial ratios + decay + gain.
//     We derive our own stretched sets per material (documented below); we do
//     NOT use the lab-banned Chladni set {1, 2.76, 5.40, 8.93}.
//   • A raised-cosine exciter + seeded per-strike jitter means no two strikes
//     are identical. Holding a key BOWS the body (continuous filtered-noise
//     energy injected into the same resonator bank) instead of striking it.
//
// No React, no DOM — pure TS + Web Audio. Deterministic: all randomness comes
// from a seeded mulberry32, never Math.random()/Date.now().
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32). Deterministic — the whole engine's jitter is
 *  reproducible from the seed, so the autopilot demo is identical every run. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MaterialId = "bronze" | "bowl" | "plate";

export interface Partial {
  /** Frequency ratio relative to the fundamental (inharmonic on purpose). */
  ratio: number;
  /** Relative excitation gain of this mode. */
  gain: number;
  /** Decay multiplier relative to the material's base decay. */
  decay: number;
}

export interface Material {
  id: MaterialId;
  label: string;
  /** Short human blurb for the HUD / notes. */
  blurb: string;
  /** Base ring time (seconds) of the fundamental at ~mid pitch. */
  baseDecay: number;
  /** Overall level trim so materials sit at similar loudness. */
  level: number;
  /** Dispersion allpass centre as a multiple of the fundamental. */
  dispersion: number;
  /** Slight detune (cents) of a twin fundamental → the beating "shimmer". */
  beatCents: number;
  partials: Partial[];
}

// ── Material partial-sets ─────────────────────────────────────────────────────
// All ratios chosen by hand to be INHARMONIC and material-flavoured. None of the
// materials use {1, 2.76, 5.40, 8.93} (banned lab-wide).
//
//   bronze — a tuned vibraphone/bronze BAR. Bars are deliberately voiced so the
//     first overtones land near 1 : 4 : 10.7 (the classic vibe "octave + two-
//     octaves-and-a-third" tuning). Bright attack, medium ring.
//   bowl  — a singing BOWL. Near-harmonic-ish but perturbed, with a close
//     detuned twin fundamental that produces the slow acoustic beat every real
//     bowl has. Very long ring; the natural body to BOW.
//   plate — a struck bronze PLATE. Dense, clangorous, strongly inharmonic set;
//     shorter ring, lots of metallic grit up top.
export const MATERIALS: Record<MaterialId, Material> = {
  bronze: {
    id: "bronze",
    label: "Bronze bar",
    blurb: "Tuned vibraphone bar — ratios 1 · 3.98 · 10.68 · 17.9",
    baseDecay: 3.4,
    level: 1.0,
    dispersion: 6.5,
    beatCents: 0,
    partials: [
      { ratio: 1.0, gain: 1.0, decay: 1.0 },
      { ratio: 3.98, gain: 0.5, decay: 0.62 },
      { ratio: 10.68, gain: 0.2, decay: 0.34 },
      { ratio: 17.9, gain: 0.09, decay: 0.2 },
    ],
  },
  bowl: {
    id: "bowl",
    label: "Singing bowl",
    blurb: "Perturbed bowl w/ beating twin — 1 · 2.66 · 4.97 · 7.36 · 10.2",
    baseDecay: 7.5,
    level: 0.92,
    dispersion: 3.0,
    beatCents: 7, // ~7 cent twin → a slow ~1 Hz beat at mid pitch
    partials: [
      { ratio: 1.0, gain: 1.0, decay: 1.0 },
      { ratio: 2.66, gain: 0.55, decay: 0.85 },
      { ratio: 4.97, gain: 0.3, decay: 0.6 },
      { ratio: 7.36, gain: 0.16, decay: 0.42 },
      { ratio: 10.2, gain: 0.08, decay: 0.28 },
    ],
  },
  plate: {
    id: "plate",
    label: "Bronze plate",
    blurb: "Clangorous struck plate — 1 · 2.31 · 3.79 · 5.44 · 7.18 · 9.10",
    baseDecay: 2.2,
    level: 0.85,
    dispersion: 9.0,
    beatCents: 0,
    partials: [
      { ratio: 1.0, gain: 1.0, decay: 1.0 },
      { ratio: 2.31, gain: 0.7, decay: 0.8 },
      { ratio: 3.79, gain: 0.5, decay: 0.62 },
      { ratio: 5.44, gain: 0.36, decay: 0.48 },
      { ratio: 7.18, gain: 0.22, decay: 0.36 },
      { ratio: 9.1, gain: 0.12, decay: 0.26 },
    ],
  },
};

export const MATERIAL_ORDER: MaterialId[] = ["bronze", "bowl", "plate"];

/** Convert a MIDI note number to frequency (Hz). */
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const TWO_PI = Math.PI * 2;

/** A live vibrational mode, tracked in JS so the visualizer can read exact,
 *  audio-matched energy without a per-mode analyser. */
interface ModeState {
  freq: number;
  partialIndex: number;
  material: MaterialId;
  amp0: number; // peak energy 0..1
  tau: number; // decay time constant (s), derived from the real biquad Q
  t0: number; // strike time (audio-clock seconds)
  bowed: boolean;
  bowLevel: number; // current sustain target for bowed modes (0..1)
  releaseT: number; // release start time, Infinity while sustaining
  key: number; // owning note key (midi) for bowed grouping
}

/** One snapshot bar for the visualizer. */
export interface SpectrumBar {
  freq: number;
  energy: number; // 0..1
  material: MaterialId;
  partialIndex: number;
}

interface VoiceNodes {
  sources: AudioBufferSourceNode[];
  nodes: AudioNode[];
  bowGain?: GainNode;
  noise?: AudioBufferSourceNode;
  key: number;
}

const MAX_Q = 1800; // stability ceiling for the ringing bandpass filters
const MAX_MODES = 220; // visualizer/perf guard

export interface StartResult {
  ok: boolean;
  reason?: string;
}

export class BellVault {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  private dryBus!: GainNode;
  private wetSend!: GainNode;
  private convolver!: ConvolverNode;
  private droneGain!: GainNode;
  private material: MaterialId = "bronze";
  private modes: ModeState[] = [];
  private bowVoices = new Map<number, VoiceNodes>();
  private excitePool: AudioBuffer[] = [];
  private noiseLoop: AudioBuffer | null = null;
  private rng: () => number;
  private strikeCount = 0;

  constructor(seed = 0x2086) {
    this.rng = makeRng(seed);
  }

  /** Resume/create the AudioContext inside a user gesture and build the graph. */
  async start(): Promise<StartResult> {
    if (this.ctx) return { ok: true };
    const Ctor: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!Ctor) return { ok: false, reason: "no-web-audio" };

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return { ok: false, reason: "no-web-audio" };
    }
    this.ctx = ctx;

    // Master chain: dry+wet → limiter → out.
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(ctx.destination);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 0.85;
    this.dryBus.connect(this.master);

    // Subsystem 4a: synthesized room impulse → convolver reverb bed.
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeImpulse(ctx, 3.2, 2.6);
    this.wetSend = ctx.createGain();
    this.wetSend.gain.value = 0.42;
    const wetOut = ctx.createGain();
    wetOut.gain.value = 0.9;
    this.wetSend.connect(this.convolver).connect(wetOut).connect(this.master);

    // Subsystem 4b: a low drone "vault air" the strikes ring into.
    this.buildDrone(ctx);

    // Exciter bank: a pool of seeded raised-cosine noise bursts + a loop for bowing.
    this.buildExciters(ctx);

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore — gesture will retry */
      }
    }
    return { ok: true };
  }

  setMaterial(id: MaterialId): void {
    this.material = id;
  }

  getMaterial(): MaterialId {
    return this.material;
  }

  // ── exciter construction ────────────────────────────────────────────────────
  private buildExciters(ctx: AudioContext): void {
    const sr = ctx.sampleRate;
    // 8 raised-cosine windowed noise bursts of varying length/brightness.
    for (let i = 0; i < 8; i++) {
      const ms = 2.5 + this.rng() * 4.0; // 2.5–6.5 ms
      const len = Math.max(24, Math.floor((ms / 1000) * sr));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      // brighter bursts for shorter windows (harder mallet)
      const smooth = 0.25 + this.rng() * 0.5;
      let prev = 0;
      for (let n = 0; n < len; n++) {
        const w = 0.5 - 0.5 * Math.cos((TWO_PI * n) / (len - 1)); // Hann
        const white = this.rng() * 2 - 1;
        prev = prev + smooth * (white - prev); // 1-pole lowpass → softer mallet
        d[n] = prev * w;
      }
      this.excitePool.push(buf);
    }
    // A 2-second looping pink-ish noise buffer for bowing.
    const bl = Math.floor(sr * 2);
    const nb = ctx.createBuffer(1, bl, sr);
    const nd = nb.getChannelData(0);
    let lp = 0;
    for (let n = 0; n < bl; n++) {
      const white = this.rng() * 2 - 1;
      lp = lp + 0.06 * (white - lp);
      nd[n] = lp * 3.2;
    }
    this.noiseLoop = nb;
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let n = 0; n < len; n++) {
        const t = n / len;
        // exponentially-decaying noise, slight early build for a "stone room"
        const env = Math.pow(1 - t, decay) * (t < 0.02 ? t / 0.02 : 1);
        d[n] = (this.rng() * 2 - 1) * env;
      }
    }
    return buf;
  }

  private buildDrone(ctx: AudioContext): void {
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    lp.Q.value = 0.6;
    const base = midiToFreq(36); // deep C
    const freqs = [base, base * 1.5, base * 2.005]; // root, fifth, faintly-beating octave
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = freqs[i];
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0.4;
      o.connect(g).connect(lp);
      o.start();
    }
    // very slow filter drift (≪ 3 Hz, honours the flicker rule)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    lp.connect(this.droneGain).connect(this.master);
    // also feed a touch of the drone into the reverb for depth
    this.droneGain.connect(this.wetSend);
  }

  /** Fade the drone bed in/out (0..1). */
  setDrone(level: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setTargetAtTime(0.06 * level, now, 0.4);
  }

  // ── striking ────────────────────────────────────────────────────────────────
  /** Strike a note. velocity 0..1. Returns nothing — energy is read via spectrum(). */
  strike(midi: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const mat = MATERIALS[this.material];
    const f0 = midiToFreq(midi);
    const now = ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1, velocity));
    this.strikeCount++;

    // per-strike jitter (seeded) → no two strikes identical
    const detune = 1 + (this.rng() - 0.5) * 0.004; // ±0.2%
    const burst = this.excitePool[Math.floor(this.rng() * this.excitePool.length)];

    const src = ctx.createBufferSource();
    src.buffer = burst;
    // harder strikes → slightly faster playback (brighter mallet contact)
    src.playbackRate.value = 0.85 + vel * 0.5 + (this.rng() - 0.5) * 0.1;

    const strikeGain = ctx.createGain();
    strikeGain.gain.value = vel * 0.9 * mat.level;

    const disp = ctx.createBiquadFilter();
    disp.type = "allpass";
    disp.frequency.value = Math.min(16000, f0 * mat.dispersion);
    disp.Q.value = 0.7;

    src.connect(disp);

    const created = this.buildBank(ctx, f0 * detune, mat, vel, now, strikeGain, disp, midi, false);
    strikeGain.connect(this.dryBus);
    strikeGain.connect(this.wetSend);

    src.start(now);
    src.stop(now + burst.duration + 0.02);

    // schedule cleanup after the longest ring completes
    const maxTau = Math.max(...created.map((m) => m.tau));
    const life = Math.min((maxTau * 4 + 0.3) * 1000, 30000);
    window.setTimeout(() => {
      try {
        src.disconnect();
        disp.disconnect();
        strikeGain.disconnect();
      } catch {
        /* ignore */
      }
    }, life);
  }

  /** Build the resonator bank for one voice; push mode-states for the visualizer. */
  private buildBank(
    ctx: AudioContext,
    f0: number,
    mat: Material,
    vel: number,
    t0: number,
    out: GainNode,
    input: AudioNode,
    key: number,
    bowed: boolean,
  ): ModeState[] {
    const created: ModeState[] = [];
    const twin = mat.beatCents !== 0;
    for (let i = 0; i < mat.partials.length; i++) {
      const p = mat.partials[i];
      // build one (or two, for beating) bandpass resonators per partial
      const copies = i === 0 && twin ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        const centsShift = c === 1 ? mat.beatCents : 0;
        const f = f0 * p.ratio * Math.pow(2, centsShift / 1200);
        if (f > 18000) continue;
        // desired ring time for this mode → real biquad Q (capped for stability).
        // Bowed voices are sustained-driven, so a high-Q resonator would build up
        // enormously — cap their Q much lower and lean on the swell instead.
        const qCap = bowed ? 320 : MAX_Q;
        const wantTau = mat.baseDecay * p.decay;
        const q = Math.min(qCap, Math.max(6, Math.PI * f * wantTau));
        const tau = q / (Math.PI * f); // the ACTUAL ring time the filter yields

        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = q;

        const mg = ctx.createGain();
        // A broadband impulse deposits ~1/Q of its energy into a narrow band, so
        // higher-Q modes ring quieter — compensate up with ~sqrt(Q) to balance
        // fundamentals against overtones. Bowed drive is scaled down separately.
        const comp = bowed ? 0.16 : 0.05 * Math.sqrt(q);
        mg.gain.value = (p.gain / copies) * comp;

        input.connect(bp).connect(mg).connect(out);

        if (this.modes.length < MAX_MODES) {
          const ms: ModeState = {
            freq: f,
            partialIndex: i,
            material: mat.id,
            amp0: Math.min(1, p.gain * vel),
            tau,
            t0,
            bowed,
            bowLevel: bowed ? Math.min(1, p.gain * vel) : 0,
            releaseT: bowed ? Infinity : t0,
            key,
          };
          this.modes.push(ms);
          created.push(ms);
        }
      }
    }
    return created;
  }

  // ── bowing (sustained excitation) ─────────────────────────────────────────────
  /** Begin bowing a note — continuous filtered noise into the resonator bank. */
  bowStart(midi: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseLoop) return;
    if (this.bowVoices.has(midi)) return; // already bowing
    const mat = MATERIALS[this.material];
    const f0 = midiToFreq(midi);
    const now = ctx.currentTime;
    const vel = Math.max(0.15, Math.min(1, velocity));

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseLoop;
    noise.loop = true;

    const bowGain = ctx.createGain();
    bowGain.gain.value = 0;
    bowGain.gain.setTargetAtTime(vel * 0.38 * mat.level, now, 0.18); // bow attack

    const strikeGain = ctx.createGain();
    strikeGain.gain.value = 1;

    const disp = ctx.createBiquadFilter();
    disp.type = "allpass";
    disp.frequency.value = Math.min(16000, f0 * mat.dispersion);

    noise.connect(bowGain).connect(disp);
    this.buildBank(ctx, f0, mat, vel, now, strikeGain, disp, midi, true);
    strikeGain.connect(this.dryBus);
    strikeGain.connect(this.wetSend);
    noise.start(now);

    this.bowVoices.set(midi, {
      sources: [noise],
      nodes: [bowGain, disp, strikeGain],
      bowGain,
      noise,
      key: midi,
    });
  }

  /** Release a bowed note — the body rings out on its own. */
  bowStop(midi: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.bowVoices.get(midi);
    if (!v) return;
    const now = ctx.currentTime;
    if (v.bowGain) v.bowGain.gain.setTargetAtTime(0, now, 0.12);
    // flip owning modes into release
    for (const m of this.modes) {
      if (m.bowed && m.key === midi && m.releaseT === Infinity) {
        m.releaseT = now;
      }
    }
    try {
      v.noise?.stop(now + 3.5);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      for (const n of v.nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        v.noise?.disconnect();
      } catch {
        /* ignore */
      }
    }, 4200);
    this.bowVoices.delete(midi);
  }

  isBowing(midi: number): boolean {
    return this.bowVoices.has(midi);
  }

  // ── visualizer read-out ───────────────────────────────────────────────────────
  /** Live per-mode energy snapshot, matched to what the ears hear. Prunes dead modes. */
  spectrum(): SpectrumBar[] {
    const ctx = this.ctx;
    if (!ctx) return [];
    const now = ctx.currentTime;
    const out: SpectrumBar[] = [];
    const kept: ModeState[] = [];
    for (const m of this.modes) {
      let e: number;
      if (m.bowed && m.releaseT === Infinity) {
        // bowed & held: ramp up toward sustain (matches the 0.18s attack)
        const up = 1 - Math.exp(-(now - m.t0) / 0.22);
        e = m.bowLevel * up;
      } else {
        const rt = m.bowed ? m.releaseT : m.t0;
        e = m.amp0 * Math.exp(-(now - rt) / m.tau);
      }
      if (e > 0.0016) {
        out.push({
          freq: m.freq,
          energy: Math.min(1, e),
          material: m.material,
          partialIndex: m.partialIndex,
        });
        kept.push(m);
      }
    }
    this.modes = kept;
    return out;
  }

  get activeModeCount(): number {
    return this.modes.length;
  }
  get strikes(): number {
    return this.strikeCount;
  }

  dispose(): void {
    for (const [k] of this.bowVoices) this.bowStop(k);
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    void ctx.close();
    this.ctx = null;
    this.modes = [];
  }
}
