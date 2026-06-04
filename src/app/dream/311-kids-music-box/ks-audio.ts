// Karplus-Strong plucked-string ("comb tooth") synthesis for the music box.
//
// Approach: precompute one short KS-rendered AudioBuffer per pitch at init by
// manually filling a Float32Array (noise burst -> tuned delay line with a
// lowpass-averaging feedback term). At play time we just fire a cheap
// BufferSource through a shared gain -> reverb -> limiter -> master chain.
// This is the simplest reliable low-latency path: no ScriptProcessor, no
// AudioWorklet, no per-note synthesis cost.

// ── scale ──────────────────────────────────────────────────────────────────
// D Lydian hexachord (bright, consonant) — explicitly NOT C-major-pentatonic.
// D E F# G# A B  -> we voice it low->high so row 0 (bottom) is the deepest.
// Semitone offsets from D3 (146.83 Hz). Rows render bottom (low) to top (high).
const D3 = 146.83;
const SEMI = (n: number) => D3 * Math.pow(2, n / 12);

// six pitches, low to high: D3 E3 F#3 G#3 A3 B3, then we can index up.
// We use a 6-row grid. Pleasant Lydian color.
export const SCALE_HZ: number[] = [
  SEMI(0),  // D3
  SEMI(2),  // E3
  SEMI(4),  // F#3
  SEMI(6),  // G#3 (the Lydian #4 sparkle)
  SEMI(7),  // A3
  SEMI(9),  // B3
];

export const ROW_COUNT = SCALE_HZ.length;

// Friendly per-row colors (warm toy palette), bottom->top.
export const ROW_COLORS: string[] = [
  "#ff8a5c", // warm orange (low)
  "#ffd166", // amber
  "#9be15d", // green
  "#5cc8ff", // sky
  "#b48cff", // violet
  "#ff7eb6", // pink (high)
];

// ── KS buffer rendering ──────────────────────────────────────────────────────

function renderKarplusStrong(
  sampleRate: number,
  freq: number,
  durationSec: number,
  brightness: number, // 0..1 feedback lowpass blend (lower = darker/shorter)
  damping: number,    // overall decay factor per delay-line pass
): Float32Array<ArrayBuffer> {
  const total = Math.floor(sampleRate * durationSec);
  // Backed by a concrete ArrayBuffer so the type matches AudioBuffer.copyToChannel.
  const out = new Float32Array(new ArrayBuffer(total * 4));
  const delayLen = Math.max(2, Math.round(sampleRate / freq));
  const buf = new Float32Array(delayLen);

  // Excitation: short filtered noise burst (a softened pluck, not a click).
  for (let i = 0; i < delayLen; i++) {
    buf[i] = Math.random() * 2 - 1;
  }
  // one-pole lowpass over the initial burst to take the harsh edge off.
  let prev = 0;
  for (let i = 0; i < delayLen; i++) {
    prev = prev * 0.35 + buf[i] * 0.65;
    buf[i] = prev;
  }

  // KS loop: y[n] = damping * ( (1-b)*buf[i] + b*buf[i-1] )
  let idx = 0;
  let last = 0;
  const b = 0.5 * (1 - brightness) + 0.05; // averaging amount
  for (let n = 0; n < total; n++) {
    const cur = buf[idx];
    const filtered = (1 - b) * cur + b * last;
    last = cur;
    const v = damping * filtered;
    buf[idx] = v;
    out[n] = v;
    idx = (idx + 1) % delayLen;
  }

  // amplitude envelope: tiny attack + smooth tail fade to avoid end clicks.
  const atk = Math.min(64, total);
  const rel = Math.floor(total * 0.25);
  for (let n = 0; n < total; n++) {
    let g = 1;
    if (n < atk) g = n / atk;
    if (n > total - rel) g = (total - n) / rel;
    out[n] *= g;
  }
  return out;
}

// ── reverb impulse (synthesized, no files) ───────────────────────────────────

function makeReverbImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.5);
      // filtered (warm) decaying noise
      const noise = (Math.random() * 2 - 1) * decay;
      lp = lp * 0.6 + noise * 0.4;
      data[i] = lp;
    }
  }
  return impulse;
}

// ── engine ───────────────────────────────────────────────────────────────────

export class MusicBoxAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private buffers: AudioBuffer[] = [];
  ready = false;
  supported = true;

  init(): boolean {
    if (this.ctx) return true;
    type WinAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext || (window as WinAudio).webkitAudioContext
        : undefined;
    if (!Ctor) {
      this.supported = false;
      return false;
    }
    const ctx = new Ctor();
    this.ctx = ctx;

    // chain: [sources] -> master -> dry/reverb -> limiter -> destination
    const master = ctx.createGain();
    master.gain.value = 0.55; // modest master (kids + dense patterns)

    const dry = ctx.createGain();
    dry.gain.value = 0.85;

    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbImpulse(ctx, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;

    // hard-ish limiter to keep dense patterns safe.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    master.connect(dry);
    master.connect(convolver);
    convolver.connect(wet);
    dry.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);

    this.master = master;
    this.dryGain = dry;
    this.reverbGain = wet;
    this.limiter = limiter;

    // Render one KS buffer per pitch. Higher pitches a touch brighter/shorter.
    const sr = ctx.sampleRate;
    this.buffers = SCALE_HZ.map((hz, i) => {
      const t = i / (SCALE_HZ.length - 1);
      const dur = 2.4 - t * 0.9;          // low notes ring longer
      const brightness = 0.35 + t * 0.4;  // high notes brighter
      const damping = 0.997 - t * 0.004;  // high notes decay a bit faster
      const data = renderKarplusStrong(sr, hz, dur, brightness, damping);
      const ab = ctx.createBuffer(1, data.length, sr);
      ab.copyToChannel(data, 0);
      return ab;
    });

    this.ready = true;
    return true;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // Pluck a row. velocity 0..1 scales the note level.
  pluck(row: number, velocity = 1): void {
    if (!this.ctx || !this.master || !this.ready) return;
    const buf = this.buffers[row];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // tiny detune for organic feel
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.006;
    const g = this.ctx.createGain();
    g.gain.value = 0.32 * Math.max(0.2, Math.min(1, velocity));
    src.connect(g);
    g.connect(this.master);
    src.start();
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  dispose(): void {
    try {
      this.master?.disconnect();
      this.dryGain?.disconnect();
      this.reverbGain?.disconnect();
      this.limiter?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.master = null;
    this.ready = false;
  }
}
