// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — the audio subsystem for 11240-datamatics.
//
// Two source paths, one output node:
//   • SEEDED path: a deterministic 16th-note step sequencer built from a fixed
//     mulberry32 seed (NOT Math.random), so the page always demos the same
//     clinical Ikeda-ish pattern — sine sub kicks, pure sine "data" blips,
//     filtered-noise hats, sustained sine bass. The whole musical content is
//     reproducible frame-for-frame from the seed.
//   • BUFFER path: a decoded audio file (WAV/MP3) played on loop.
//
// Both feed a single output GainNode. The caller routes that node into the
// shared safe master AND taps it with an AnalyserNode for the FFT visuals.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — fixed seed → fixed musical content. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Step {
  kick: boolean;
  hat: boolean;
  blip: number; // 0 = none, else Hz
  bass: number; // 0 = none, else Hz
}

const BASS_HZ = [55, 65.41, 73.42, 82.41, 98.0];
const BLIP_HZ = [1046.5, 1244.5, 1567.98, 2093.0, 880.0, 3135.96];

/** Build the deterministic 64-step (4-bar) pattern from a seed. */
function makePattern(seed: number): Step[] {
  const rng = mulberry32(seed);
  const steps: Step[] = [];
  for (let i = 0; i < 64; i++) {
    const kick = i % 4 === 0 || rng() < 0.12;
    const hat = i % 2 === 1 ? rng() < 0.7 : rng() < 0.18;
    const blip = rng() < 0.11 ? BLIP_HZ[Math.floor(rng() * BLIP_HZ.length)] : 0;
    const bass = i % 8 === 0 ? BASS_HZ[Math.floor(rng() * BASS_HZ.length)] : 0;
    steps.push({ kick, hat, blip, bass });
  }
  return steps;
}

const TEMPO = 132; // BPM
const STEP_DUR = 60 / TEMPO / 4; // 16th note
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds

export class DatamaticsAudio {
  private ctx: AudioContext;
  private out: GainNode;
  private noiseBuf: AudioBuffer;
  private pattern: Step[];
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bufSource: AudioBufferSourceNode | null = null;

  constructor(ctx: AudioContext, dest: AudioNode, seed: number) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.pattern = makePattern(seed);

    // one-shot white-noise buffer reused for every hat
    const n = Math.floor(ctx.sampleRate * 0.3);
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    const rng = mulberry32(seed ^ 0x9e3779b9);
    for (let i = 0; i < n; i++) ch[i] = rng() * 2 - 1;
  }

  /** The node other subsystems (safe master / analyser) connect FROM. */
  get output(): GainNode {
    return this.out;
  }

  /** Start the deterministic seeded sequencer. */
  startSeeded(): void {
    this.stopBuffer();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.rampIn();
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
    }
  }

  /** Swap to a decoded audio file, looped. Stops the sequencer. */
  playBuffer(buffer: AudioBuffer): void {
    this.stopSequencer();
    this.stopBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.out);
    src.start();
    this.bufSource = src;
    this.rampIn();
  }

  private rampIn(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.linearRampToValueAtTime(0.9, t + 0.4);
  }

  private stopSequencer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private stopBuffer(): void {
    if (this.bufSource) {
      try {
        this.bufSource.stop();
        this.bufSource.disconnect();
      } catch {
        /* already stopped */
      }
      this.bufSource = null;
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.schedule(this.pattern[this.step % 64], this.nextTime);
      this.nextTime += STEP_DUR;
      this.step++;
    }
  }

  private schedule(s: Step, t: number): void {
    if (s.kick) this.kick(t);
    if (s.bass) this.bass(t, s.bass);
    if (s.hat) this.hat(t);
    if (s.blip) this.blip(t, s.blip);
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.24);
  }

  private bass(t: number, hz: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(hz, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
  }

  private blip(t: number, hz: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(hz, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.06);
  }

  private hat(t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(hp).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.05);
  }

  /** Stop everything and detach. Safe to call twice. */
  dispose(): void {
    this.stopSequencer();
    this.stopBuffer();
    const t = this.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(0, t, 0.03);
    } catch {
      /* ctx closing */
    }
    window.setTimeout(() => {
      try {
        this.out.disconnect();
      } catch {
        /* ctx closing */
      }
    }, 120);
  }
}
