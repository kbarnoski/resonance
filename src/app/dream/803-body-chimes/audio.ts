// ── Body Chimes · MODAL physical-modeling synthesis engine ───────────────────
// Each suspended body (bar / bowl / bell) is a *bank of damped sine modes* with
// INHARMONIC partial ratios. A strike excites every mode with one impulse; each
// mode rings as an exponentially-decaying sine whose decay shortens with mode
// index (higher partials die first — like a real struck metal body).
//
// We implement genuine modal synthesis with a bank of high-Q BiquadFilter
// bandpass resonators fed a short noise/impulse burst. A bandpass driven at its
// centre frequency with a tall Q rings as a decaying sinusoid — that ring IS the
// physical mode. This is CPU-friendly and lets us run a 16-voice polyphony cap.
//
// LONG-FORM ACCRETION: every strike also feeds a *sympathetic mode-bed* — a set
// of always-on, very-high-Q resonators tuned to the scale that are gently
// re-excited by passing energy. Struck-body "memory" slowly biases the bed's
// gain and a global root-detune drifts over minutes, so the room at minute 5 is
// a fuller, slightly-shifted shimmering cloud versus minute 1.

// ── Scale: just-intonation ratios over a low root (always consonant) ─────────
// Root ~ 110 Hz (A2). Pentatonic-ish just ratios → never a sour interval.
const ROOT_HZ = 110;
const JUST_RATIOS = [
  1 / 1, // root
  9 / 8, // major 2nd
  5 / 4, // major 3rd
  3 / 2, // perfect 5th
  5 / 3, // major 6th
  2 / 1, // octave
  9 / 4, // octave + 2nd
  5 / 2, // octave + 3rd
  3 / 1, // octave + 5th
];

// Body archetypes → inharmonic partial ratio sets + decay character.
export type BodyKind = "bell" | "bar" | "bowl";

interface ModalProfile {
  // Partial ratios relative to the body's fundamental.
  ratios: number[];
  // Per-mode relative excitation gain (parallel to ratios).
  gains: number[];
  // Base ring time (seconds) of the fundamental mode.
  baseDecay: number;
  // Q multiplier — higher = longer ring / purer mode.
  q: number;
}

// Inharmonic partial ratios characteristic of each struck body type.
// Bell: clangorous, stretched (hum, prime, tierce, quint, nominal...).
// Bar  : free-free bar overtones (1, 2.76, 5.40, 8.93 ...).
// Bowl : near-harmonic singing bowl, faint inharmonicity.
const PROFILES: Record<BodyKind, ModalProfile> = {
  bell: {
    ratios: [1.0, 2.0, 2.4, 3.0, 4.5, 5.33],
    gains: [1.0, 0.55, 0.7, 0.45, 0.3, 0.2],
    baseDecay: 7.5,
    q: 1.0,
  },
  bar: {
    ratios: [1.0, 2.76, 5.4, 8.93, 13.34],
    gains: [1.0, 0.4, 0.22, 0.12, 0.07],
    baseDecay: 4.0,
    q: 0.8,
  },
  bowl: {
    ratios: [1.0, 2.01, 2.83, 4.22, 5.0],
    gains: [1.0, 0.6, 0.4, 0.28, 0.18],
    baseDecay: 9.0,
    q: 1.3,
  },
};

export interface ResonantBodySpec {
  id: number;
  kind: BodyKind;
  freq: number; // fundamental Hz
  // Position in normalized scene space [-1,1] x/y, depth -1..1; set by page.
  pos: { x: number; y: number; z: number };
  hue: number; // 0..1 visual hue (warm-metallic range)
  radius: number; // collision + visual size
}

// Build the field of resonant bodies. count ~ 22.
export function makeBodyField(count: number): ResonantBodySpec[] {
  const kinds: BodyKind[] = ["bell", "bar", "bowl"];
  const out: ResonantBodySpec[] = [];
  // Distribute on a loose double-ring shell around the listener.
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % 3];
    // Pick a scale degree; lower bodies favour lower octaves for a grounded bed.
    const degree = i % JUST_RATIOS.length;
    const octShift = i < count / 2 ? 0 : 1;
    const freq = ROOT_HZ * JUST_RATIOS[degree] * (octShift ? 2 : 1);

    const ring = i % 2 === 0 ? 1 : 2;
    const ang = (i / count) * Math.PI * 2 * 1.6 + ring * 0.7;
    const rad = ring === 1 ? 0.62 : 0.95;
    const x = Math.cos(ang) * rad;
    const y = ((i * 73) % 100) / 100 - 0.5; // pseudo-random vertical scatter
    const z = Math.sin(ang) * rad;

    // Warm-metallic hue band: amber (0.08) ↔ violet (0.78), biased warm.
    const hue = kind === "bell" ? 0.08 : kind === "bowl" ? 0.12 : 0.78;
    const radius = (kind === "bowl" ? 0.26 : kind === "bell" ? 0.22 : 0.2) * (octShift ? 0.85 : 1.05);

    out.push({ id: i, kind, freq, pos: { x, y, z }, hue, radius });
  }
  return out;
}

// One live ring = a parallel bank of bandpass resonators + a master env gain.
interface Voice {
  bodyId: number;
  master: GainNode;
  modes: BiquadFilterNode[];
  modeGains: GainNode[];
  startedAt: number;
  endsAt: number;
}

export class ModalEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private convReverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  private voices: Voice[] = [];
  private readonly maxVoices = 16;

  // Sympathetic mode-bed (accretion). Always-on resonators excited by strikes.
  private bedInput: GainNode | null = null;
  private bedNodes: { filt: BiquadFilterNode; gain: GainNode }[] = [];
  private bedNoise: AudioBufferSourceNode | null = null;
  private bedMaster: GainNode | null = null;

  private specs: ResonantBodySpec[] = [];
  // Struck-body memory: how often each body has been hit (biases bed timbre).
  private strikeMemory: Float32Array = new Float32Array(0);
  private totalStrikes = 0;
  private startTime = 0;

  async start(specs: ResonantBodySpec[]): Promise<void> {
    type WindowWithWebkit = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor =
      window.AudioContext ||
      (window as WindowWithWebkit).webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();
    this.ctx = ctx;
    this.specs = specs;
    this.strikeMemory = new Float32Array(specs.length);
    this.startTime = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.value = 0.0;
    out.connect(ctx.destination);
    out.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 1.5);
    this.out = out;

    // Lush plate-ish reverb so strikes bloom into the room.
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulseResponse(ctx, 3.6, 2.4);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.5;
    reverb.connect(reverbGain).connect(out);
    this.convReverb = reverb;
    this.reverbGain = reverbGain;

    this.buildBed(specs);
  }

  // ── Sympathetic mode-bed: the accreting cloud ──
  private buildBed(specs: ResonantBodySpec[]): void {
    const ctx = this.ctx!;
    // A faint continuous noise source feeds the bed resonators; their gain is
    // near-zero until strikes "charge" them, then they slowly bleed energy.
    const noise = makeLoopNoise(ctx);
    const bedInput = ctx.createGain();
    bedInput.gain.value = 0.0008; // very faint continuous excitation
    noise.connect(bedInput);

    const bedMaster = ctx.createGain();
    bedMaster.gain.value = 0.0;
    bedMaster.connect(this.out!);
    bedMaster.connect(this.convReverb!);

    // One high-Q resonator per distinct scale frequency present in the field.
    const freqs = Array.from(new Set(specs.map((s) => s.freq))).sort((a, b) => a - b);
    for (const f of freqs) {
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = f;
      filt.Q.value = 90;
      const g = ctx.createGain();
      g.gain.value = 0.0;
      bedInput.connect(filt).connect(g).connect(bedMaster);
      this.bedNodes.push({ filt, gain: g });
    }

    noise.start();
    this.bedNoise = noise;
    this.bedInput = bedInput;
    this.bedMaster = bedMaster;

    // Bring the bed up slowly so it grows over the first minutes.
    bedMaster.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.1);
  }

  // Strike a body. velocity 0..1 sets brightness + amplitude.
  strike(spec: ResonantBodySpec, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const now = ctx.currentTime;
    const v = Math.max(0.05, Math.min(1, velocity));

    // Polyphony cap — steal oldest.
    if (this.voices.length >= this.maxVoices) {
      const oldest = this.voices.shift();
      if (oldest) this.disposeVoice(oldest, now);
    }

    const profile = PROFILES[spec.kind];
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(this.out);
    master.connect(this.convReverb!);

    // Excitation: a short filtered impulse (noise burst) shared by all modes.
    const exc = makeImpulseBurst(ctx, 0.012 + v * 0.01);
    const excGain = ctx.createGain();
    // Harder strike → brighter / louder excitation.
    excGain.gain.value = 0.6 + v * 0.9;
    exc.connect(excGain);

    const modes: BiquadFilterNode[] = [];
    const modeGains: GainNode[] = [];
    let maxDecay = 0;

    for (let m = 0; m < profile.ratios.length; m++) {
      const f = spec.freq * profile.ratios[m];
      if (f > ctx.sampleRate * 0.45) continue; // skip above Nyquist guard

      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      // Higher modes get higher Q so they read as discrete partials.
      const q = (40 + m * 30) * profile.q;
      filt.frequency.value = f;
      filt.Q.value = q;

      const g = ctx.createGain();
      // Higher modes excited less + decay faster (physical struck-body law).
      const modeGain = profile.gains[m] * (0.4 + v * 0.6);
      // Per-mode exponential decay: fundamental = baseDecay, scaled by 1/ratio.
      const decay = (profile.baseDecay / Math.pow(profile.ratios[m], 0.65)) * (0.6 + v * 0.5);
      maxDecay = Math.max(maxDecay, decay);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(modeGain, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      excGain.connect(filt).connect(g).connect(master);
      modes.push(filt);
      modeGains.push(g);
    }

    // Master strike envelope (very fast attack, long natural tail).
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.9, now + 0.003);
    master.gain.exponentialRampToValueAtTime(0.0001, now + maxDecay + 0.3);

    exc.start(now);
    exc.stop(now + 0.1);

    const voice: Voice = {
      bodyId: spec.id,
      master,
      modes,
      modeGains,
      startedAt: now,
      endsAt: now + maxDecay + 0.4,
    };
    this.voices.push(voice);

    // ── Accretion bookkeeping ──
    this.totalStrikes++;
    if (spec.id < this.strikeMemory.length) {
      this.strikeMemory[spec.id] = Math.min(8, this.strikeMemory[spec.id] + 1);
    }
    // Charge the matching bed resonator: this body now lingers sympathetically.
    this.chargeBed(spec.freq, v, now);
  }

  // Feed a little energy into the sympathetic resonator nearest this frequency.
  private chargeBed(freq: number, v: number, now: number): void {
    if (!this.bedMaster || this.bedNodes.length === 0) return;
    let best = this.bedNodes[0];
    let bestErr = Infinity;
    for (const n of this.bedNodes) {
      const e = Math.abs(n.filt.frequency.value - freq);
      if (e < bestErr) {
        bestErr = e;
        best = n;
      }
    }
    // Bump this resonator's gain; it bleeds back down slowly (lingering).
    const cur = best.gain.gain.value;
    const target = Math.min(0.22, cur + v * 0.05);
    best.gain.gain.cancelScheduledValues(now);
    best.gain.gain.setValueAtTime(cur, now);
    best.gain.gain.linearRampToValueAtTime(target, now + 0.4);
    // slow 25s decay back toward a floor proportional to overall accretion.
    const floor = Math.min(0.12, this.totalStrikes * 0.0015);
    best.gain.gain.linearRampToValueAtTime(floor, now + 25);
  }

  // Called ~once/second to evolve the long-form state.
  evolve(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bedMaster) return;
    const now = ctx.currentTime;
    const elapsed = now - this.startTime;

    // Bed master grows from 0 → ~0.5 over ~4 minutes, gated by activity.
    const grown = Math.min(0.5, (elapsed / 240) * 0.5);
    const activityBoost = Math.min(0.25, this.totalStrikes * 0.004);
    const target = Math.min(0.6, grown + activityBoost);
    this.bedMaster.gain.cancelScheduledValues(now);
    this.bedMaster.gain.setValueAtTime(this.bedMaster.gain.value, now);
    this.bedMaster.gain.linearRampToValueAtTime(target, now + 2);

    // Global root drift: a slow ±6-cent breathing detune on bed resonators so
    // the cloud is never static. Period ~ 90s.
    const detune = Math.sin(elapsed * (Math.PI * 2) / 90) * 0.0035; // ±0.35%
    for (let i = 0; i < this.bedNodes.length; i++) {
      const base = this.bedFreqBase(i);
      // Bodies struck more often pull their resonator slightly sharper (memory).
      const memBias = 1 + this.memoryForFreq(base) * 0.0008;
      this.bedNodes[i].filt.frequency.setTargetAtTime(
        base * (1 + detune) * memBias,
        now,
        4,
      );
    }
  }

  private bedFreqBaseCache: number[] | null = null;
  private bedFreqBase(i: number): number {
    if (!this.bedFreqBaseCache) {
      this.bedFreqBaseCache = this.bedNodes.map((n) => n.filt.frequency.value);
    }
    return this.bedFreqBaseCache[i];
  }
  private memoryForFreq(freq: number): number {
    // Sum strike memory of bodies near this frequency.
    let m = 0;
    for (const s of this.specs) {
      if (Math.abs(s.freq - freq) < 0.5) m += this.strikeMemory[s.id] ?? 0;
    }
    return m;
  }

  // For visuals: how "full" the accreting cloud currently is, 0..1.
  cloudLevel(): number {
    if (!this.bedMaster) return 0;
    return Math.min(1, this.bedMaster.gain.value / 0.6);
  }

  private disposeVoice(voice: Voice, now: number): void {
    try {
      voice.master.gain.cancelScheduledValues(now);
      voice.master.gain.setValueAtTime(voice.master.gain.value, now);
      voice.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        voice.master.disconnect();
        for (const f of voice.modes) f.disconnect();
        for (const g of voice.modeGains) g.disconnect();
      } catch {
        /* ignore */
      }
    }, 200);
  }

  // Remove voices whose tails have ended (housekeeping each frame).
  reap(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.endsAt < now) {
        try {
          v.master.disconnect();
          for (const f of v.modes) f.disconnect();
          for (const g of v.modeGains) g.disconnect();
        } catch {
          /* ignore */
        }
      } else {
        keep.push(v);
      }
    }
    this.voices = keep;
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.bedNoise?.stop();
    } catch {
      /* ignore */
    }
    for (const v of this.voices) {
      try {
        v.master.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.voices = [];
    try {
      void ctx.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

// ── Web-Audio buffer helpers ─────────────────────────────────────────────────

// Short impulse / noise burst that excites the modal resonators.
function makeImpulseBurst(ctx: AudioContext, dur: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Decaying noise burst → click + body.
    const env = Math.pow(1 - i / len, 2);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// Continuous low-level looping noise for the sympathetic bed excitation.
function makeLoopNoise(ctx: AudioContext): AudioBufferSourceNode {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

// Synthesised exponential-decay impulse response for the convolution reverb.
function makeImpulseResponse(
  ctx: AudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}
