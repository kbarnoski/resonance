// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the "magnetospheric organ".
//
// A bank of INHARMONIC partials (non-just ratios) is the voice — deliberately not
// a cozy just-intonation drone. The live solar wind drives it:
//   speed   → base pitch (faster wind = higher, more urgent)
//   bz south→ the aurora "opens": filter brightens, upper partials enter (substorm)
//   kp      → intensity AND dissonance: storms detune the partials → tense beating
//   density → a granular noise texture layer
//
// Master chain: per-partial gain → bus → biquad(lowpass) → masterGain →
//               DynamicsCompressor → destination.
// ─────────────────────────────────────────────────────────────────────────────

// Inharmonic, NON-just ratios — gives the bank metallic, organ-but-wrong edges.
const PARTIAL_RATIOS = [1, 2.04, 3.11, 4.33, 5.78, 7.19, 9.02];

export interface OrganParams {
  speed: number; // km/s
  bz: number; // nT (negative = southward = open)
  kp: number; // 0–9
  density: number; // p/cm^3
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Partial {
  osc: OscillatorNode;
  detune: OscillatorNode; // a second slightly-detuned osc → beating when storms hit
  detuneGain: GainNode;
  gain: GainNode;
}

export class SolarOrgan {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private filter: BiquadFilterNode;
  private bus: GainNode;
  private partials: Partial[] = [];

  // granular density texture
  private noiseSrc: AudioBufferSourceNode;
  private noiseGain: GainNode;
  private noiseFilter: BiquadFilterNode;

  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    const c = this.ctx;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.28;
    this.comp.connect(c.destination);

    this.master = c.createGain();
    this.master.gain.value = 0.0; // raised on start
    this.master.connect(this.comp);

    this.filter = c.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);

    this.bus = c.createGain();
    this.bus.gain.value = 0.5;
    this.bus.connect(this.filter);

    // build the inharmonic partial bank (pre-built for low latency)
    for (let i = 0; i < PARTIAL_RATIOS.length; i++) {
      const osc = c.createOscillator();
      osc.type = i % 2 === 0 ? "triangle" : "sine";
      const detune = c.createOscillator();
      detune.type = "sine";
      const detuneGain = c.createGain();
      detuneGain.gain.value = 0.0;
      const gain = c.createGain();
      gain.gain.value = 0.0;
      osc.connect(gain);
      detune.connect(detuneGain);
      detuneGain.connect(gain);
      gain.connect(this.bus);
      this.partials.push({ osc, detune, detuneGain, gain });
    }

    // granular noise texture (density layer)
    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseSrc = c.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.noiseFilter = c.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 1200;
    this.noiseFilter.Q.value = 0.8;
    this.noiseGain = c.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.bus);
  }

  // Must be called inside a user gesture (iOS). Resumes + starts oscillators.
  async start(): Promise<void> {
    if (this.started) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      p.osc.start(t);
      p.detune.start(t);
    }
    this.noiseSrc.start(t);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.6, t + 1.5);
  }

  setVolume(v: number): void {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(clamp(v, 0, 1) * 0.6, t, 0.08);
  }

  // Drive the organ from the current playhead's space-weather frame.
  update(p: OrganParams): void {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const tau = 0.12; // smoothing time-constant

    // base pitch from wind speed: 300→~70Hz (A2-ish) ... 800→~165Hz, urgent.
    const speedN = clamp((p.speed - 300) / 500, 0, 1);
    const base = lerp(70, 165, speedN);

    // openness: southward Bz opens the magnetosphere → brighter filter, more partials.
    const south = clamp(-p.bz / 16, 0, 1); // 0 quiet (north) .. 1 strong south
    const cutoff = lerp(320, 5200, Math.pow(south, 0.7));
    this.filter.frequency.setTargetAtTime(cutoff, t, tau);
    this.filter.Q.setTargetAtTime(lerp(0.6, 3.5, south), t, tau);

    // storm → dissonance: high Kp detunes partials + raises the beating osc.
    const kpN = clamp(p.kp / 9, 0, 1);
    const detuneCents = lerp(0, 38, kpN); // up to ~38c of detune at storm peak
    const beat = lerp(0, 0.5, kpN * south); // beating only when storm AND open

    for (let i = 0; i < this.partials.length; i++) {
      const part = this.partials[i];
      const ratio = PARTIAL_RATIOS[i];
      const f = base * ratio;
      part.osc.frequency.setTargetAtTime(f, t, tau);
      // detune sign alternates so partials spread apart — tense, not chorused.
      const sign = i % 2 === 0 ? 1 : -1;
      part.osc.detune.setTargetAtTime(sign * detuneCents * (0.5 + i * 0.15), t, tau);
      // beating partner: a few Hz off the partial → slow roughness.
      part.detune.frequency.setTargetAtTime(f * 1.008 + 0.7, t, tau);
      part.detuneGain.gain.setTargetAtTime(beat * 0.25, t, tau);

      // higher partials only enter as the aurora opens (south) — substorm crescendo.
      const enter = clamp(south * 1.4 - i * 0.13, 0, 1);
      const amp = (0.42 / (i + 1.3)) * (0.25 + 0.75 * enter);
      part.gain.gain.setTargetAtTime(amp, t, tau);
    }

    // density → granular noise texture.
    const densN = clamp(p.density / 18, 0, 1);
    this.noiseGain.gain.setTargetAtTime(densN * 0.14, t, tau);
    this.noiseFilter.frequency.setTargetAtTime(
      lerp(600, 2600, speedN),
      t,
      tau,
    );
  }

  async close(): Promise<void> {
    try {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.1);
      await new Promise((r) => setTimeout(r, 220));
      await this.ctx.close();
    } catch {
      // already closed
    }
  }
}
