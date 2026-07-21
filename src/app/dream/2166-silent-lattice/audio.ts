// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the crossfading Sethares engine for the Silent Lattice.
//
//   Two stretched-partial timbre sets, per Sethares (1993): partial n of a voice
//   with fundamental f0 sits at f0 · n^log2(A), where A is the pseudo-octave
//   "stretch". NOT harmonic, NOT pentatonic, NOT JI, NOT Bohlen–Pierce.
//
//     • ACTIVE  A = 2.02  — near-harmonic, warm. The familiar, sensory world.
//     • DORMANT A = 2.30  — strongly stretched, inharmonic, metallic "machine".
//
//   Every played voice runs BOTH banks in parallel; dissociation depth D
//   crossfades their gains, so the timbre melts from warm to alien machine as
//   the switch engages. The played scale itself also stretches with D (2.02 →
//   2.30), so pitch relationships dissociate too. A slow two-note drone bed sits
//   underneath. Pitch comes from played Y; pan from played X; fast drags fire a
//   short metallic ignition tick. Silent until resume() after a user gesture.
//
//   No Math.random / Date — the reverb impulse uses a seeded PRNG.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./scene";

const A_ACTIVE = 2.02;
const A_DORMANT = 2.3;
const PARTIALS = 4;
const BASE_FREQ = 138; // ~C#3 anchor for the played scale
const SCALE_DEGREES = 15; // Y is quantised across this many stretched steps

function partialAmp(n: number): number {
  return 1 / Math.pow(n, 0.85);
}
function partialFreq(f0: number, n: number, A: number): number {
  return f0 * Math.pow(n, Math.log2(A));
}
/** Quantised fundamental for a normalised Y (0 top → 1 bottom, higher Y lower
 *  pitch) under a stretched scale of pseudo-octave `A`. */
function freqForY(y01: number, A: number): number {
  const deg = Math.round((1 - Math.min(1, Math.max(0, y01))) * (SCALE_DEGREES - 1));
  return BASE_FREQ * Math.pow(A, deg / SCALE_DEGREES);
}

interface Bank {
  oscs: OscillatorNode[];
  gain: GainNode; // bank crossfade gain
}
interface Voice {
  active: Bank;
  dormant: Bank;
  out: GainNode; // per-voice envelope
  pan: StereoPannerNode;
  x01: number;
  y01: number;
}

export class SilentLatticeAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private voices = new Map<string, Voice>();
  private depth = 0;
  private rnd = mulberry32(0x5e7ba);
  private droneActive: OscillatorNode[] = [];
  private droneDormant: OscillatorNode[] = [];
  private droneActiveGain: GainNode;
  private droneDormantGain: GainNode;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;

    const conv = this.ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.8, 2.6);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.4;
    const dry = this.ctx.createGain();
    dry.gain.value = 0.85;

    this.master.connect(comp);
    comp.connect(dry).connect(this.ctx.destination);
    comp.connect(conv).connect(wet).connect(this.ctx.destination);

    // slow, fade the master up so there is never a click on unlock.
    this.master.gain.linearRampToValueAtTime(0.9, this.ctx.currentTime + 0.8);

    // ── drone bed: two low fundamentals, each with both banks ──────────────
    this.droneActiveGain = this.ctx.createGain();
    this.droneDormantGain = this.ctx.createGain();
    this.droneActiveGain.gain.value = 0.5;
    this.droneDormantGain.gain.value = 0.0;
    this.droneActiveGain.connect(this.master);
    this.droneDormantGain.connect(this.master);
    const droneRoots = [BASE_FREQ / 2, (BASE_FREQ / 2) * Math.pow(A_ACTIVE, 7 / 12)];
    for (const root of droneRoots) {
      for (let n = 1; n <= 3; n++) {
        const oa = this.mkOsc(partialFreq(root, n, A_ACTIVE), partialAmp(n) * 0.09, this.droneActiveGain);
        const od = this.mkOsc(partialFreq(root, n, A_DORMANT), partialAmp(n) * 0.09, this.droneDormantGain);
        oa.type = "sine";
        od.type = "triangle";
        this.droneActive.push(oa);
        this.droneDormant.push(od);
      }
    }
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  private mkOsc(freq: number, amp: number, dest: AudioNode): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = amp;
    osc.connect(g).connect(dest);
    osc.start();
    return osc;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (this.rnd() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  /** Dissociation depth 0→1: crossfade banks, drone timbre, and scale stretch. */
  setDepth(d: number): void {
    this.depth = Math.min(1, Math.max(0, d));
    const now = this.ctx.currentTime;
    const A = A_ACTIVE + (A_DORMANT - A_ACTIVE) * this.depth;
    // equal-power-ish crossfade
    const aGain = Math.cos((this.depth * Math.PI) / 2);
    const dGain = Math.sin((this.depth * Math.PI) / 2);
    this.droneActiveGain.gain.setTargetAtTime(0.5 * aGain, now, 0.2);
    this.droneDormantGain.gain.setTargetAtTime(0.5 * dGain, now, 0.2);
    for (const v of this.voices.values()) {
      v.active.gain.gain.setTargetAtTime(aGain, now, 0.15);
      v.dormant.gain.gain.setTargetAtTime(dGain, now, 0.15);
      // retune partials as the played scale stretches with depth
      const f0 = freqForY(v.y01, A);
      this.retune(v.active, f0, A_ACTIVE);
      this.retune(v.dormant, f0, A_DORMANT);
    }
  }

  private retune(bank: Bank, f0: number, A: number): void {
    const now = this.ctx.currentTime;
    for (let i = 0; i < bank.oscs.length; i++) {
      bank.oscs[i].frequency.setTargetAtTime(partialFreq(f0, i + 1, A), now, 0.08);
    }
  }

  private makeBank(f0: number, A: number, wave: OscillatorType, dest: AudioNode): Bank {
    const gain = this.ctx.createGain();
    gain.connect(dest);
    const oscs: OscillatorNode[] = [];
    for (let n = 1; n <= PARTIALS; n++) {
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = partialFreq(f0, n, A);
      const g = this.ctx.createGain();
      g.gain.value = partialAmp(n) * 0.18;
      osc.connect(g).connect(gain);
      osc.start();
      oscs.push(osc);
    }
    return { oscs, gain };
  }

  noteOn(id: string, x01: number, y01: number): void {
    if (this.voices.has(id)) return;
    const now = this.ctx.currentTime;
    const A = A_ACTIVE + (A_DORMANT - A_ACTIVE) * this.depth;
    const f0 = freqForY(y01, A);

    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(0.5, now + 0.08);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (x01 - 0.5) * 1.4;
    out.connect(pan).connect(this.master);

    const active = this.makeBank(f0, A_ACTIVE, "sine", out);
    const dormant = this.makeBank(f0, A_DORMANT, "triangle", out);
    const aGain = Math.cos((this.depth * Math.PI) / 2);
    const dGain = Math.sin((this.depth * Math.PI) / 2);
    active.gain.gain.value = aGain;
    dormant.gain.gain.value = dGain;

    this.voices.set(id, { active, dormant, out, pan, x01, y01 });
  }

  noteMove(id: string, x01: number, y01: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    v.x01 = x01;
    v.y01 = y01;
    const now = this.ctx.currentTime;
    const A = A_ACTIVE + (A_DORMANT - A_ACTIVE) * this.depth;
    const f0 = freqForY(y01, A);
    v.pan.pan.setTargetAtTime((x01 - 0.5) * 1.4, now, 0.05);
    this.retune(v.active, f0, A_ACTIVE);
    this.retune(v.dormant, f0, A_DORMANT);
  }

  noteOff(id: string): void {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const now = this.ctx.currentTime;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0.0001, now, 0.28);
    const stopAt = now + 1.4;
    for (const b of [v.active, v.dormant]) {
      for (const o of b.oscs) {
        try {
          o.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
    }
  }

  /** Short metallic ignition tick — fired on fast drags. Intensity scales with
   *  drag speed and depth (the machine sparks as it assembles). */
  spark(speed01: number, depth01: number): void {
    if (this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    const A = A_DORMANT;
    const base = 400 + this.rnd() * 900;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * Math.log2(A), now + 0.14);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = base * 1.5;
    bp.Q.value = 8;
    const g = this.ctx.createGain();
    const amp = 0.05 + 0.1 * speed01 * (0.3 + 0.7 * depth01);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  dispose(): void {
    for (const id of Array.from(this.voices.keys())) this.noteOff(id);
    const now = this.ctx.currentTime;
    for (const o of [...this.droneActive, ...this.droneDormant]) {
      try {
        o.stop(now + 0.2);
      } catch {
        /* noop */
      }
    }
    this.master.gain.setTargetAtTime(0.0001, now, 0.15);
    setTimeout(() => {
      if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    }, 400);
  }
}
