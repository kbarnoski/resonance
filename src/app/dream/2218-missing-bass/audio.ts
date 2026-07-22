// ─────────────────────────────────────────────────────────────────────────────
// 2218 · MISSING BASS — audio engine
//
// The felt bass of this piece is a PHANTOM. For each phantom root f0 we synth
// ONLY the upper harmonics (3·f0 … 8·f0). No oscillator is ever created at f0
// itself, and everything is summed through a cascaded high-pass filter whose
// cutoff sits ABOVE every fundamental in the scale — so there is provably no
// acoustic energy at f0. Yet the ear reconstructs the absent low pitch
// (Schouten's residue pitch / the missing-fundamental illusion).
//
// A slow binaural beat is layered by detuning the right-ear harmonics by a few
// Hz relative to the left. The "Reveal" control adds a real sine at f0 that
// BYPASSES the high-pass, so a listener can A/B their reconstructed pitch
// against the genuine fundamental.
// ─────────────────────────────────────────────────────────────────────────────

// Upper harmonics we render. Deliberately starts at the 3rd — no 1st (f0) and
// no 2nd (an octave, which would too-strongly imply the fundamental).
export const HARMONICS = [3, 4, 5, 6, 7, 8] as const;

// High-pass cutoff (Hz). Sits above the top of the phantom-root scale (110 Hz)
// and below the lowest rendered harmonic (3·55 = 165 Hz), guaranteeing the
// entire low band — every fundamental — is empty of real energy.
export const HIGHPASS_HZ = 135;

// The playable scale of ABSENT fundamentals (A natural-minor, A1 → A2).
// Mapped onto the home row: A S D F G H J K.
export const SCALE: { key: string; note: string; f0: number }[] = [
  { key: "a", note: "A1", f0: 55.0 },
  { key: "s", note: "B1", f0: 61.74 },
  { key: "d", note: "C2", f0: 65.41 },
  { key: "f", note: "D2", f0: 73.42 },
  { key: "g", note: "E2", f0: 82.41 },
  { key: "h", note: "F2", f0: 87.31 },
  { key: "j", note: "G2", f0: 98.0 },
  { key: "k", note: "A2", f0: 110.0 },
];

const ATTACK = 1.2; // s — slow, so this is a drone not a note
const RELEASE = 2.0; // s
const VOICE_PEAK = 0.85;
const FUND_LEVEL = 0.22; // level of the revealed real fundamental
const HARM_SCALE = 0.42; // overall headroom for the harmonic stack

// Gentle spectral rolloff so upper harmonics sit softly under the lower ones.
function rolloff(h: number): number {
  return Math.pow(0.72, h - 3);
}

// How present harmonic h is given a fractional "density/brightness" d (3..8).
// Fully on below d, a soft fractional edge at the top — lets density ramp live.
function densityMask(h: number, d: number): number {
  if (h <= d - 1) return 1;
  if (h < d) return d - (h - 1);
  return 0;
}

function harmTarget(h: number, density: number): number {
  return HARM_SCALE * rolloff(h) * densityMask(h, density);
}

interface Harmonic {
  h: number;
  oscL: OscillatorNode;
  oscR: OscillatorNode;
  gain: GainNode;
}

interface Voice {
  f0: number;
  env: GainNode; // slow attack/release
  harmonics: Harmonic[];
  fundOsc: OscillatorNode; // real fundamental — used only by Reveal
  fundGain: GainNode; // 0 unless Reveal is on
  active: boolean; // key currently held
  level: number; // last env target (for visuals)
}

export class PhantomBassEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private readonly hpIn: BiquadFilterNode;
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly voices = new Map<number, Voice>();

  private density = 6;
  private beat = 4;
  private reveal = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ac = this.ctx;

    // ── master chain: [voices] → hp×2 → master → limiter → destination ──
    this.master = ac.createGain();
    this.master.gain.value = 0.55;

    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    // Cascaded high-pass = ~24 dB/oct: the guarantee that f0 carries no energy.
    this.hpIn = ac.createBiquadFilter();
    this.hpIn.type = "highpass";
    this.hpIn.frequency.value = HIGHPASS_HZ;
    this.hpIn.Q.value = 0.7;
    const hp2 = ac.createBiquadFilter();
    hp2.type = "highpass";
    hp2.frequency.value = HIGHPASS_HZ;
    hp2.Q.value = 0.7;

    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.75;

    this.hpIn.connect(hp2);
    hp2.connect(this.master);
    // NOTE: revealed fundamentals connect straight to master, bypassing hp.
    this.master.connect(this.limiter);
    this.limiter.connect(ac.destination);
    // Tap the post-master signal for the spectrum view (proves the empty band).
    this.master.connect(this.analyser);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get masterGain(): GainNode {
    return this.master;
  }

  private makeVoice(f0: number): Voice {
    const ac = this.ctx;
    const now = ac.currentTime;

    const env = ac.createGain();
    env.gain.setValueAtTime(0, now);
    env.connect(this.hpIn);

    const harmonics: Harmonic[] = HARMONICS.map((h) => {
      const gain = ac.createGain();
      gain.gain.setValueAtTime(harmTarget(h, this.density), now);
      gain.connect(env);

      const oscL = ac.createOscillator();
      oscL.type = "sine";
      oscL.frequency.setValueAtTime(h * f0, now);
      const panL = ac.createStereoPanner();
      panL.pan.setValueAtTime(-1, now);
      oscL.connect(panL);
      panL.connect(gain);
      oscL.start(now);

      const oscR = ac.createOscillator();
      oscR.type = "sine";
      // Right ear detuned by the binaural-beat rate → a slow phantom beat.
      oscR.frequency.setValueAtTime(h * f0 + this.beat, now);
      const panR = ac.createStereoPanner();
      panR.pan.setValueAtTime(1, now);
      oscR.connect(panR);
      panR.connect(gain);
      oscR.start(now);

      return { h, oscL, oscR, gain };
    });

    // Real fundamental — silent until Reveal, and it BYPASSES the high-pass.
    const fundGain = ac.createGain();
    fundGain.gain.setValueAtTime(0, now);
    fundGain.connect(this.master);
    const fundOsc = ac.createOscillator();
    fundOsc.type = "sine";
    fundOsc.frequency.setValueAtTime(f0, now);
    fundOsc.connect(fundGain);
    fundOsc.start(now);

    return { f0, env, harmonics, fundOsc, fundGain, active: false, level: 0 };
  }

  noteOn(index: number, f0: number): void {
    let v = this.voices.get(index);
    if (!v) {
      v = this.makeVoice(f0);
      this.voices.set(index, v);
    }
    const now = this.ctx.currentTime;
    v.active = true;
    v.level = VOICE_PEAK;
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(v.env.gain.value, now);
    v.env.gain.linearRampToValueAtTime(VOICE_PEAK, now + ATTACK);
    if (this.reveal) this.rampFund(v, FUND_LEVEL);
  }

  noteOff(index: number): void {
    const v = this.voices.get(index);
    if (!v) return;
    const now = this.ctx.currentTime;
    v.active = false;
    v.level = 0;
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(v.env.gain.value, now);
    v.env.gain.linearRampToValueAtTime(0, now + RELEASE);
    this.rampFund(v, 0);
  }

  private rampFund(v: Voice, target: number): void {
    const now = this.ctx.currentTime;
    v.fundGain.gain.cancelScheduledValues(now);
    v.fundGain.gain.setValueAtTime(v.fundGain.gain.value, now);
    v.fundGain.gain.linearRampToValueAtTime(target, now + 0.9);
  }

  setDensity(d: number): void {
    this.density = d;
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      for (const hn of v.harmonics) {
        hn.gain.gain.cancelScheduledValues(now);
        hn.gain.gain.setValueAtTime(hn.gain.gain.value, now);
        hn.gain.gain.linearRampToValueAtTime(harmTarget(hn.h, d), now + 0.4);
      }
    }
  }

  setBeat(b: number): void {
    this.beat = b;
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      for (const hn of v.harmonics) {
        hn.oscR.frequency.cancelScheduledValues(now);
        hn.oscR.frequency.setValueAtTime(hn.oscR.frequency.value, now);
        hn.oscR.frequency.linearRampToValueAtTime(hn.h * v.f0 + b, now + 0.3);
      }
    }
  }

  setReveal(on: boolean): void {
    this.reveal = on;
    for (const v of this.voices.values()) {
      // Only sound the real fundamental for roots currently being held.
      this.rampFund(v, on && v.active ? FUND_LEVEL : 0);
    }
  }

  setVolume(v: number): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(v, now + 0.1);
  }

  // Snapshot for the visual: which roots are audible, and how loud.
  activeRoots(): { f0: number; level: number }[] {
    const out: { f0: number; level: number }[] = [];
    for (const v of this.voices.values()) {
      const g = v.env.gain.value;
      if (g > 0.003) out.push({ f0: v.f0, level: g });
    }
    return out;
  }

  get beatHz(): number {
    return this.beat;
  }
  get revealed(): boolean {
    return this.reveal;
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      for (const hn of v.harmonics) {
        try {
          hn.oscL.stop(now);
          hn.oscR.stop(now);
        } catch {
          /* already stopped */
        }
      }
      try {
        v.fundOsc.stop(now);
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    this.ctx.close().catch(() => {
      /* already closed */
    });
  }
}
