// 1770-dmt-hyperbolic — audio engine.
//
// DEFAULT + REQUIRED GHOST: a deterministic, self-playing generative carrier.
// With no file and no mic it plays on its own forever — a slow inharmonic
// pentatonic piano-like arpeggio over a detuned drone — so a headless review
// box is alive and audible. Determinism: a fixed-seed mulberry32 PRNG + an
// integer step counter choose every note. ctx.currentTime is used ONLY for
// Web Audio scheduling/ramps (allowed).
//
// An AnalyserNode taps the master bus; getBands() returns bass / mid / high /
// loudness for the shader. OPTIONAL: loadFile() decodes a dropped track and
// routes it through the same analyser (the generative carrier is ducked away).
//
// Master chain: sources → bus → DynamicsCompressor → masterGain(≈0.15) →
// analyser → destination.

// ── deterministic PRNG (fixed seed) ──────────────────────────────────────────
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

// A minor-pentatonic-ish set with a mild inharmonic stretch (semitone offsets
// from a root), spread over three octaves.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const ROOT_HZ = 110; // A2

function midiRatio(semi: number): number {
  // slight octave stretch (Railsback-ish) → piano-like inharmonicity
  const stretch = 1 + 0.0009 * (semi / 12);
  return Math.pow(2, semi / 12) * stretch;
}

export interface Bands {
  bass: number;
  mid: number;
  high: number;
  loud: number;
}

export class HyperbolicAudio {
  private ctx: AudioContext;
  private bus: GainNode;
  private comp: DynamicsCompressorNode;
  private master: GainNode;
  private analyser: AnalyserNode;
  private freq: Uint8Array;

  private rand: () => number;
  private step = 0;
  private nextTime = 0;
  private schedTimer: number | null = null;

  // drone nodes (kept for teardown)
  private droneOscs: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private droneLfo: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;

  // dropped-file playback
  private fileSrc: AudioBufferSourceNode | null = null;
  private fileGain: GainNode | null = null;
  private generative = true;

  private muted = false;
  private stopped = false;

  // smoothed bands
  private sBass = 0;
  private sMid = 0;
  private sHigh = 0;
  private sLoud = 0;

  constructor(ctx: AudioContext, seed = 0x1770d7ec) {
    this.ctx = ctx;
    this.rand = mulberry32(seed >>> 0);

    this.bus = ctx.createGain();
    this.bus.gain.value = 1.0;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;

    this.master = ctx.createGain();
    this.master.gain.value = 0.15;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    this.bus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  start(): void {
    this.buildDrone();
    this.nextTime = this.ctx.currentTime + 0.08;
    this.scheduleLoop();
  }

  // ── the detuned, slowly-filtered drone bed ─────────────────────────────────
  private buildDrone(): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.gain.setTargetAtTime(0.16, ctx.currentTime, 3.0); // gentle fade-in

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 420;
    filt.Q.value = 0.7;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05; // very slow filter sweep (well below flicker band)
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    lfo.start();

    const detunes = [-7, -0.5, 6.5, 0.2];
    detunes.forEach((cents, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 === 0 ? "sawtooth" : "triangle";
      o.frequency.value = ROOT_HZ * (i < 2 ? 1 : 1.5); // root + a fifth
      o.detune.value = cents;
      o.connect(filt);
      o.start();
      this.droneOscs.push(o);
    });

    filt.connect(g);
    g.connect(this.bus);

    this.droneGain = g;
    this.droneLfo = lfo;
    this.droneFilter = filt;
  }

  // ── look-ahead scheduler for the arpeggio ──────────────────────────────────
  private scheduleLoop = (): void => {
    if (this.stopped) return;
    const ctx = this.ctx;
    const lookahead = 0.25;
    while (this.nextTime < ctx.currentTime + lookahead) {
      if (this.generative) this.scheduleStep(this.nextTime);
      // slow, evolving tempo grid — step length wanders deterministically
      const swing = 0.42 + 0.30 * this.rand();
      this.nextTime += swing;
      this.step++;
    }
    this.schedTimer = window.setTimeout(this.scheduleLoop, 60);
  };

  private scheduleStep(when: number): void {
    // density evolves: rests thin out and cluster over a long cycle
    const density = 0.55 + 0.35 * Math.sin(this.step * 0.037);
    if (this.rand() > density) return; // a rest

    const idx = Math.floor(this.rand() * SCALE.length);
    const semi = SCALE[idx];
    const octave = this.rand() < 0.28 ? 12 : this.rand() < 0.5 ? -12 : 0;
    const freq = ROOT_HZ * midiRatio(semi + octave);

    // occasional two-note bloom (a soft chord)
    this.pluck(freq, when, 0.9);
    if (this.rand() < 0.22) {
      this.pluck(freq * midiRatio(3), when + 0.02, 0.6);
    }
  }

  // a piano-like tone: struck attack, inharmonic partials, exponential decay
  private pluck(freq: number, when: number, vel: number): void {
    const ctx = this.ctx;
    const partials = [
      { r: 1.0, g: 1.0 },
      { r: 2.01, g: 0.42 },
      { r: 3.03, g: 0.22 },
      { r: 4.98, g: 0.12 },
    ];
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(0.22 * vel, when + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0004, when + 2.4 + 1.2 * vel);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(4200, when);
    tone.frequency.exponentialRampToValueAtTime(900, when + 1.6);

    partials.forEach((p) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq * p.r;
      const pg = ctx.createGain();
      pg.gain.value = p.g;
      o.connect(pg);
      pg.connect(tone);
      o.start(when);
      o.stop(when + 4.2);
    });
    tone.connect(amp);
    amp.connect(this.bus);
  }

  // ── dropped-file carrier ───────────────────────────────────────────────────
  async loadFile(file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const decoded = await this.ctx.decodeAudioData(buf);
    // duck the generative carrier away
    this.generative = false;
    if (this.droneGain)
      this.droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.2);

    this.stopFile();
    const src = this.ctx.createBufferSource();
    src.buffer = decoded;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.8);
    src.connect(g);
    g.connect(this.bus);
    src.start();
    this.fileSrc = src;
    this.fileGain = g;
  }

  private stopFile(): void {
    if (this.fileSrc) {
      try {
        this.fileSrc.stop();
      } catch {
        /* already stopped */
      }
      this.fileSrc.disconnect();
      this.fileSrc = null;
    }
    if (this.fileGain) {
      this.fileGain.disconnect();
      this.fileGain = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    const target = m ? 0.0 : 0.15;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  isMuted(): boolean {
    return this.muted;
  }

  usingFile(): boolean {
    return !this.generative;
  }

  // ── FFT → bands (called once per animation frame) ──────────────────────────
  getBands(): Bands {
    this.analyser.getByteFrequencyData(this.freq as Uint8Array<ArrayBuffer>);
    const n = this.freq.length; // 512 bins
    const avg = (lo: number, hi: number) => {
      let s = 0;
      const a = Math.max(0, Math.floor(lo));
      const b = Math.min(n, Math.floor(hi));
      for (let i = a; i < b; i++) s += this.freq[i];
      return b > a ? s / (b - a) / 255 : 0;
    };
    // bins: sampleRate/fftSize per bin (~46 Hz at 48k / 1024)
    const bass = avg(1, 8); // ~46–370 Hz
    const mid = avg(8, 60); // ~370–2800 Hz
    const high = avg(60, 240); // ~2.8–11 kHz
    let loud = 0;
    for (let i = 0; i < n; i++) loud += this.freq[i];
    loud = loud / n / 255;

    // one-pole smoothing (extra glue on top of the analyser)
    const k = 0.18;
    this.sBass += (bass - this.sBass) * k;
    this.sMid += (mid - this.sMid) * k;
    this.sHigh += (high - this.sHigh) * k;
    this.sLoud += (loud - this.sLoud) * k;

    return {
      bass: Math.min(1, this.sBass * 2.2),
      mid: Math.min(1, this.sMid * 2.6),
      high: Math.min(1, this.sHigh * 3.4),
      loud: Math.min(1, this.sLoud * 2.4),
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.schedTimer != null) {
      clearTimeout(this.schedTimer);
      this.schedTimer = null;
    }
    this.stopFile();
    const now = this.ctx.currentTime;
    this.droneOscs.forEach((o) => {
      try {
        o.stop(now + 0.05);
      } catch {
        /* noop */
      }
      o.disconnect();
    });
    this.droneOscs = [];
    try {
      this.droneLfo?.stop(now + 0.05);
    } catch {
      /* noop */
    }
    this.droneLfo?.disconnect();
    this.droneFilter?.disconnect();
    this.droneGain?.disconnect();
    this.bus.disconnect();
    this.comp.disconnect();
    this.master.disconnect();
    this.analyser.disconnect();
  }
}
