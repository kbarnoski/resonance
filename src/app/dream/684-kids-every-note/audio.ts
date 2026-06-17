// audio.ts — Web Audio engine for "Every Note".
//
// Voices:
//   1) DRONE bed — always-on, soft sub + fifth, so it is never silent.
//   2) PAD — 4 gliding sine/triangle voices that GLIDE (setTargetAtTime,
//      ~0.12s) to the reharmonized chord. These chase the tapped note.
//   3) BELL — a soft struck bell on top playing the literal tapped note.
//
// KIDS-SAFE master chain (hard requirement):
//   masterGain (≤0.36) → lowpass (≤7.5kHz) → DynamicsCompressor (limiter) → dest
// Gains capped, triggers rate-limited, context resumed on first gesture (iOS).
// Test bar: safe to play near a sleeping toddler — calm, no loud transients,
// no high ringing.

const PAD_VOICES = 4;

export class EveryNoteAudio {
  ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;

  // pad voices (sustained, gliding)
  private padOsc: OscillatorNode[] = [];
  private padGain: GainNode[] = [];

  // drone bed
  private droneSub!: OscillatorNode;
  private droneFifth!: OscillatorNode;
  private droneGain!: GainNode;
  private droneLfo!: OscillatorNode;
  private droneLfoGain!: GainNode;

  private convBuffer: AudioBuffer;
  private lastBell = 0;
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001; // fade in on start

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7200; // ≤7.5kHz, no high ringing
    this.lowpass.Q.value = 0.4;

    // brick-wall-ish limiter so nothing can spike
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 16;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.3;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.convBuffer = this.makeReverb(3.2);
    this.buildPad();
    this.buildDrone();
  }

  private makeReverb(seconds: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.0);
      }
    }
    return buf;
  }

  private buildPad() {
    const ctx = this.ctx;

    // shared soft tone filter + reverb send for all pad voices
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    tone.Q.value = 0.5;
    tone.connect(this.master);

    const conv = ctx.createConvolver();
    conv.buffer = this.convBuffer;
    const revG = ctx.createGain();
    revG.gain.value = 0.28;
    tone.connect(conv);
    conv.connect(revG);
    revG.connect(this.master);

    for (let i = 0; i < PAD_VOICES; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = 220 + i * 30;
      const g = ctx.createGain();
      g.gain.value = 0.0; // silent until first chord lands
      o.connect(g);
      g.connect(tone);
      o.start();
      this.padOsc.push(o);
      this.padGain.push(g);
    }
  }

  private buildDrone() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    this.droneGain = g;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600; // warm, deep, no fizz
    lp.Q.value = 0.5;
    g.connect(lp);
    lp.connect(this.master);

    const mk = (
      freq: number,
      type: OscillatorType,
      level: number,
    ): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const vg = ctx.createGain();
      vg.gain.value = level;
      o.connect(vg);
      vg.connect(g);
      o.start();
      return o;
    };

    // a calm C pedal: sub + fifth. Stays put — the pads do the moving.
    this.droneSub = mk(65.41, "sine", 0.6); // C2
    this.droneFifth = mk(98.0, "triangle", 0.12); // G2

    // slow breathing
    this.droneLfo = ctx.createOscillator();
    this.droneLfo.type = "sine";
    this.droneLfo.frequency.value = 0.06;
    this.droneLfoGain = ctx.createGain();
    this.droneLfoGain.gain.value = 0.12;
    this.droneLfo.connect(this.droneLfoGain);
    this.droneLfoGain.connect(g.gain);
    this.droneLfo.start();
  }

  async start() {
    if (this.started) return;
    this.started = true;
    await this.ctx.resume();
    const now = this.ctx.currentTime;
    // master capped at 0.36 (kids-safe)
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.34, now + 1.8);
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.linearRampToValueAtTime(0.28, now + 2.4);
  }

  // Glide the 4 sustained pad voices to a new chord (the chase).
  // voiceHz length should match PAD_VOICES; extra/missing handled gracefully.
  glideChord(voiceHz: number[], borrowed: boolean) {
    const t = this.ctx.currentTime;
    const tc = 0.12; // ~0.12s glide per brief
    const level = borrowed ? 0.1 : 0.085; // borrowed chords a touch more present
    for (let i = 0; i < PAD_VOICES; i++) {
      const hz = voiceHz[i] ?? voiceHz[voiceHz.length - 1] ?? 220;
      this.padOsc[i].frequency.setTargetAtTime(hz, t, tc);
      // ensure voices are audible (gentle fade up the first time)
      this.padGain[i].gain.setTargetAtTime(level, t, 0.25);
    }
  }

  // Soft struck bell playing the literal tapped note. role tints brightness.
  bell(hz: number, role: "chord-tone" | "extension" | "color"): boolean {
    const now = this.ctx.currentTime;
    if (now - this.lastBell < 0.04) return false; // rate-limit ~40ms
    this.lastBell = now;

    const ctx = this.ctx;
    const env = ctx.createGain();
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = hz;
    o2.frequency.value = hz * 2.01; // gentle inharmonic shimmer
    const o2g = ctx.createGain();
    o2g.gain.value = 0.12;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    // a "color"/extension note is a touch softer/darker so nothing ever stabs
    tone.frequency.value =
      role === "chord-tone" ? 3200 : role === "extension" ? 2600 : 2000;
    tone.Q.value = 0.6;

    const peak = 0.16; // capped, soft
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0006, now + 2.2);

    o1.connect(tone);
    o2.connect(o2g);
    o2g.connect(tone);
    tone.connect(env);
    env.connect(this.master);

    const conv = ctx.createConvolver();
    conv.buffer = this.convBuffer;
    const revG = ctx.createGain();
    revG.gain.value = 0.32;
    env.connect(conv);
    conv.connect(revG);
    revG.connect(this.master);

    o1.start(now);
    o2.start(now);
    o1.stop(now + 2.4);
    o2.stop(now + 2.4);
    return true;
  }

  async dispose() {
    const stop = (o?: OscillatorNode) => {
      try {
        o?.stop();
      } catch {
        /* already stopped */
      }
    };
    this.padOsc.forEach(stop);
    stop(this.droneSub);
    stop(this.droneFifth);
    stop(this.droneLfo);
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
