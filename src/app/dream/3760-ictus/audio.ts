// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the Web Audio instrument for 3760 · Ictus.
//
// Two layers:
//   1. PERCUSSION — four synthesised strike voices (L-hand kick, R-hand snare,
//      L-foot tom, R-foot hat). A clean `hit()` when a contact lands on-grid; a
//      darker doubled `flam()` when it lands off-grid, so bad timing is audible.
//   2. A continuous PAD shaped by the body between strikes:
//        torso lean  → lowpass cutoff (openness)
//        arm spread  → chord voicing width (cluster → open voicing)
//        hand height → register (octave)
//   Plus a metronome `click()` marking the grid you must play against.
//
// Everything is synthesised (no samples). Master sits behind a limiter and is
// faded on start/stop; transient voices tear themselves down on `onended`.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = 110; // A2 — pad root
const PAD_INTERVALS = [0, 7, 10, 14, 17]; // root, 5th, m7, 9th, 11th

function midiRatio(semi: number): number {
  return Math.pow(2, semi / 12);
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

interface PadVoice {
  osc: OscillatorNode;
  gain: GainNode;
  baseSemi: number;
}

export class IctusAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private noiseBuf: AudioBuffer;

  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padVoices: PadVoice[] = [];

  private running = false;
  private lastStrike: number[] = [0, 0, 0, 0];

  // continuous timbre targets (0..1), smoothed toward each frame
  private lean = 0.5;
  private spread = 0.4;
  private height = 0.5;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // shared white-noise buffer for snare/hat
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // continuous pad
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 0.7;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);

    for (const semi of PAD_INTERVALS) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = ROOT * midiRatio(semi);
      osc.detune.value = (Math.random() - 0.5) * 7;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.11;
      osc.connect(gain);
      gain.connect(this.padFilter);
      osc.start();
      this.padVoices.push({ osc, gain, baseSemi: semi });
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.32, t + 1.0);
    this.padGain.gain.setTargetAtTime(0.22, t, 0.8);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Continuous body → pad timbre, called every frame with 0..1 values. */
  setTimbre(lean: number, spread: number, height: number): void {
    this.lean = clamp01(lean);
    this.spread = clamp01(spread);
    this.height = clamp01(height);
    if (!this.running) return;
    const t = this.ctx.currentTime;

    // lean → cutoff (openness): 260 Hz (closed) → 5.5 kHz (wide open)
    const cutoff = 260 + Math.pow(this.lean, 1.6) * 5200;
    this.padFilter.frequency.setTargetAtTime(cutoff, t, 0.08);

    // height → register: shift the whole pad up to ~+12 semitones
    const octShift = this.height * 12;
    // spread → voicing width: stretch the intervals outward
    const widen = 1 + this.spread * 1.4;
    for (const v of this.padVoices) {
      const semi = v.baseSemi * widen + octShift;
      v.osc.frequency.setTargetAtTime(ROOT * midiRatio(semi), t, 0.09);
    }
  }

  /** Metronome tick. accent: 0 offbeat, 1 beat, 2 downbeat. */
  click(accent: 0 | 1 | 2): void {
    if (!this.running || accent === 0) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = accent === 2 ? 1760 : 1320;
    const g = this.ctx.createGain();
    const level = accent === 2 ? 0.18 : 0.09;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(level, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.045);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.06);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** A clean, on-grid strike for a limb voice. */
  hit(limb: number, strength = 1, when?: number): void {
    this.voice(limb, clamp01(strength), when ?? this.ctx.currentTime, false);
  }

  /**
   * An off-grid flam: two closely-spaced, darker/quieter attacks — the audible
   * penalty for missing the beat. The doubled onset reads as "not locked".
   */
  flam(limb: number, strength = 1): void {
    const now = this.ctx.currentTime;
    const s = clamp01(strength) * 0.55;
    this.voice(limb, s, now, true);
    this.voice(limb, s * 0.8, now + 0.05, true);
  }

  private voice(limb: number, strength: number, when: number, dark: boolean): void {
    if (!this.running) return;
    // debounce a single limb so a held/rapid contact can't machine-gun
    if (when - (this.lastStrike[limb] ?? 0) < 0.045 && !dark) return;
    this.lastStrike[limb] = when;

    const reg = 1 + this.height * 0.5; // hand height nudges strike pitch up
    const amp = 0.5 + strength * 0.5;
    const bright = dark ? 0.4 : 1;

    switch (limb) {
      case 0:
        this.drawKick(when, amp, reg, bright);
        break;
      case 1:
        this.drawSnare(when, amp, bright);
        break;
      case 2:
        this.drawTom(when, amp, reg, bright);
        break;
      default:
        this.drawHat(when, amp, bright);
        break;
    }
  }

  private drawKick(when: number, amp: number, reg: number, bright: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const f0 = 150 * reg;
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.9 * amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, when + 0.22 * bright + 0.05);
    osc.connect(g);
    g.connect(this.master);
    osc.start(when);
    osc.stop(when + 0.4);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private drawSnare(when: number, amp: number, bright: number): void {
    // noise body
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700 + bright * 600;
    bp.Q.value = 0.8;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0, when);
    ng.gain.linearRampToValueAtTime(0.5 * amp, when + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0005, when + 0.14 * bright + 0.03);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    // tonal snap
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 190;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0, when);
    og.gain.linearRampToValueAtTime(0.28 * amp, when + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0005, when + 0.08);
    osc.connect(og);
    og.connect(this.master);
    src.start(when);
    src.stop(when + 0.25);
    osc.start(when);
    osc.stop(when + 0.12);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      ng.disconnect();
    };
    osc.onended = () => {
      osc.disconnect();
      og.disconnect();
    };
  }

  private drawTom(when: number, amp: number, reg: number, bright: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const f0 = 230 * reg;
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(110 * reg, when + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.7 * amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, when + 0.26 * bright + 0.05);
    osc.connect(g);
    g.connect(this.master);
    osc.start(when);
    osc.stop(when + 0.45);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private drawHat(when: number, amp: number, bright: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.32 * amp, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0004, when + 0.05 * bright + 0.01);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(when);
    src.stop(when + 0.1);
    src.onended = () => {
      src.disconnect();
      hp.disconnect();
      g.disconnect();
    };
  }

  stop(): void {
    if (!this.running) {
      void this.ctx.close();
      return;
    }
    this.running = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.35);
    window.setTimeout(() => {
      for (const v of this.padVoices) {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
      }
      void this.ctx.close();
    }, 450);
  }
}
