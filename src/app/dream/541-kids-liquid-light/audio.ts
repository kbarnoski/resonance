// Liquid Light — sonification engine.
// The fluid sings: velocity magnitude + dye energy under/around the finger
// drive a small additive wash of triangle/sine voices on a C-major pentatonic.
// An always-on ambient pad (C2 + G2) keeps it NEVER silent.
// Master chain is kids-safe: gain -> lowpass(<=8kHz) -> brick-wall limiter -> out.

// C-major pentatonic, C3 -> C5 (so nothing is ever "wrong").
const PENTA_HZ = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  196.0, // G3
  220.0, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
  523.25, // C5
];

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  partialGain: GainNode;
  noteIdx: number;
  busyUntil: number;
}

type WinAudio = typeof window & { webkitAudioContext?: typeof AudioContext };

export class LiquidAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private padGains: GainNode[] = [];
  private voices: Voice[] = [];
  private readonly NUM_VOICES = 6;
  private lastTrigger = 0;
  private started = false;

  get isStarted(): boolean {
    return this.started;
  }

  // MUST be called from inside a user gesture (iOS unlock).
  start(): void {
    if (this.started) return;
    const W = window as WinAudio;
    const Ctor = window.AudioContext || W.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    void ctx.resume();

    // --- master chain: gain -> lowpass -> limiter -> destination ---
    const master = ctx.createGain();
    master.gain.value = 0.9;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4200; // brightened by motion, capped at 8000
    lowpass.Q.value = 0.4;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20; // brick-wall
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    master.connect(lowpass);
    lowpass.connect(limiter);
    limiter.connect(ctx.destination);

    this.master = master;
    this.lowpass = lowpass;
    this.limiter = limiter;

    // --- always-on ambient pad: C2 + G2 (very soft) ---
    [65.41, 98.0].forEach((hz) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = hz * 2;
      const g = ctx.createGain();
      g.gain.value = 0.0;
      const sg = ctx.createGain();
      sg.gain.value = 0.35;
      sub.connect(sg);
      sg.connect(g);
      osc.connect(g);
      g.connect(master);
      osc.start();
      sub.start();
      // gentle fade-in so the start is never a transient
      g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
      this.padGains.push(g);
      // slow LFO shimmer on the pad
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.06 + Math.random() * 0.05;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.02;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      lfo.start();
    });

    // --- pool of melodic voices (additive wash) ---
    for (let i = 0; i < this.NUM_VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = PENTA_HZ[5];
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = PENTA_HZ[5] * 2;
      const partialGain = ctx.createGain();
      partialGain.gain.value = 0.18;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc2.connect(partialGain);
      partialGain.connect(gain);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc2.start();
      this.voices.push({ osc, osc2, gain, partialGain, noteIdx: 5, busyUntil: 0 });
    }

    this.started = true;
  }

  // Continuous excitation from the fluid.
  // speed: 0..1 swirl strength under finger.  energy: 0..1 dye brightness.
  // hue01: 0..1 maps to pentatonic register.  voicesWanted: how many to ring.
  excite(speed: number, energy: number, hue01: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !this.lowpass) return;
    const now = ctx.currentTime;

    // Faster swirl -> brighter timbre (lowpass opens, capped at 8kHz).
    const cutoff = 1800 + speed * 6200; // up to 8000
    this.lowpass.frequency.setTargetAtTime(Math.min(8000, cutoff), now, 0.12);

    // Faster swirl -> more simultaneous voices.
    const voicesWanted = 1 + Math.round(speed * (this.NUM_VOICES - 1));

    // Throttle new note triggers so it's a wash, not a machine gun.
    const minGap = 0.09;
    if (now - this.lastTrigger < minGap) return;
    this.lastTrigger = now;

    const intensity = Math.min(1, 0.25 + speed * 0.8 + energy * 0.4);

    let triggered = 0;
    for (const v of this.voices) {
      if (triggered >= voicesWanted) break;
      if (v.busyUntil > now) continue;
      triggered++;
      // hue/position selects a register; small random spread keeps it alive.
      const base = Math.floor(hue01 * (PENTA_HZ.length - 3));
      const idx = Math.max(
        0,
        Math.min(PENTA_HZ.length - 1, base + Math.floor(Math.random() * 4)),
      );
      v.noteIdx = idx;
      const hz = PENTA_HZ[idx];
      v.osc.frequency.setTargetAtTime(hz, now, 0.04);
      v.osc2.frequency.setTargetAtTime(hz * 2, now, 0.04);

      const peak = 0.06 + intensity * 0.12; // stays well under the limiter
      const dur = 0.6 + Math.random() * 0.8;
      // glide up then settle down (setTargetAtTime — no clicks)
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(peak, now, 0.05);
      v.gain.gain.setTargetAtTime(0.0001, now + 0.12, dur * 0.5);
      v.busyUntil = now + dur;
    }
  }

  // No finger / calm: let things settle but keep the pad breathing.
  rest(): void {
    const ctx = this.ctx;
    if (!ctx || !this.lowpass) return;
    this.lowpass.frequency.setTargetAtTime(2600, ctx.currentTime, 0.6);
  }

  dispose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.voices.forEach((v) => {
        v.osc.stop();
        v.osc2.stop();
      });
    } catch {
      // already stopped
    }
    void ctx.close();
    this.ctx = null;
    this.started = false;
    this.voices = [];
    this.padGains = [];
  }
}
