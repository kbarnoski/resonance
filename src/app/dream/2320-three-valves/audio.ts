// ════════════════════════════════════════════════════════════════════════════
// 2320-three-valves · audio.ts
//
// Three independent timbral valves — the sonic mirror of the C×G×D cube. There
// is NO master intensity: each axis moves a different, orthogonal quality.
//
//   C → detune-spread / inharmonicity of the modal pad. Relax = wider beating,
//       partials drift off their pure ratios (a consonant bed dissolves into a
//       shimmering, inharmonic cloud).
//   G → a formant / vowel filter. Low G = dark, noise-forward abstract texture;
//       high G = resonant vocal formants (F1/F2 open, Q sharpens → almost-vocal).
//   D → dry/reverb + stereo spread. Low D = drowned in the shared void reverb and
//       smeared wide (unreal, in-here); high D = dry, mono-centred, present.
//
// Harmony is a just-intoned Phrygian-flavoured chord (flat 2nd + minor 6th),
// deliberately NOT pentatonic. Master ≤ 0.18 behind a compressor; 1 s fade-in;
// silent until start().
// ════════════════════════════════════════════════════════════════════════════

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// Just-intoned modal chord (Phrygian colour): root, b2, m3, P5, m6.
const RATIOS = [1, 16 / 15, 6 / 5, 3 / 2, 8 / 5];
// How far each partial drifts off its pure ratio as C relaxes (inharmonicity).
const INHARM = [0.0, 0.006, 0.011, 0.015, 0.022];
const ROOT_HZ = 98; // G2

interface PadVoice {
  osc: OscillatorNode;
  baseFreq: number;
  inharm: number;
  detuneSign: number; // -1 or +1 for the beating pair
}

export class ValveAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private reverb: VoidReverb;

  private padSum: GainNode;
  private noiseGain: GainNode;
  private noiseSrc: AudioBufferSourceNode | null = null;

  // G — formant / dark crossfade
  private formantIn: GainNode;
  private dark: BiquadFilterNode;
  private darkGain: GainNode;
  private f1: BiquadFilterNode;
  private f2: BiquadFilterNode;
  private vocalGain: GainNode;
  private voiceBus: GainNode;

  // D — Haas widener taps
  private widthL: GainNode;
  private widthR: GainNode;

  private voices: PadVoice[] = [];
  private started = false;
  private closed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // master chain: everything → compressor → master gain → speakers
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0; // silent until start()
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    // shared void reverb — D drowns the signal in it.
    this.reverb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.6, wet: 0.5 });
    this.reverb.output.connect(this.compressor);

    // ── D · Haas widener → reverb ─────────────────────────────────────────
    this.voiceBus = ctx.createGain();
    const center = ctx.createGain();
    center.gain.value = 0.8;
    this.voiceBus.connect(center);
    center.connect(this.reverb.input);

    const dl = ctx.createDelay(0.05);
    dl.delayTime.value = 0.012;
    const dr = ctx.createDelay(0.05);
    dr.delayTime.value = 0.023;
    const panL = ctx.createStereoPanner();
    panL.pan.value = -1;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 1;
    this.widthL = ctx.createGain();
    this.widthR = ctx.createGain();
    this.widthL.gain.value = 0.0;
    this.widthR.gain.value = 0.0;
    this.voiceBus.connect(dl);
    dl.connect(panL);
    panL.connect(this.widthL);
    this.widthL.connect(this.reverb.input);
    this.voiceBus.connect(dr);
    dr.connect(panR);
    panR.connect(this.widthR);
    this.widthR.connect(this.reverb.input);

    // ── G · formant vs dark crossfade → voiceBus ──────────────────────────
    this.formantIn = ctx.createGain();

    this.dark = ctx.createBiquadFilter();
    this.dark.type = "lowpass";
    this.dark.frequency.value = 520;
    this.dark.Q.value = 0.6;
    this.darkGain = ctx.createGain();
    this.darkGain.gain.value = 1.0;
    this.formantIn.connect(this.dark);
    this.dark.connect(this.darkGain);
    this.darkGain.connect(this.voiceBus);

    this.f1 = ctx.createBiquadFilter();
    this.f1.type = "bandpass";
    this.f1.frequency.value = 420;
    this.f1.Q.value = 4;
    this.f2 = ctx.createBiquadFilter();
    this.f2.type = "bandpass";
    this.f2.frequency.value = 900;
    this.f2.Q.value = 6;
    this.vocalGain = ctx.createGain();
    this.vocalGain.gain.value = 0.0;
    this.formantIn.connect(this.f1);
    this.formantIn.connect(this.f2);
    this.f1.connect(this.vocalGain);
    this.f2.connect(this.vocalGain);
    this.vocalGain.connect(this.voiceBus);

    // ── sources: modal pad + noise → formantIn ────────────────────────────
    this.padSum = ctx.createGain();
    this.padSum.gain.value = 0.5;
    this.padSum.connect(this.formantIn);

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseGain.connect(this.formantIn);

    // build pad voices (silent until start)
    for (let i = 0; i < RATIOS.length; i++) {
      const base = ROOT_HZ * RATIOS[i];
      for (const sign of [-1, 1]) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.value = base;
        const vg = ctx.createGain();
        vg.gain.value = 0.16 / RATIOS.length;
        osc.connect(vg);
        vg.connect(this.padSum);
        this.voices.push({ osc, baseFreq: base, inharm: INHARM[i], detuneSign: sign });
      }
    }

    // initial neutral valve positions
    this.setC(0.2);
    this.setG(0.2);
    this.setD(0.5);
  }

  private makeNoiseBuffer(): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = rate * 2;
    const buf = this.ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    // deterministic LCG — no Math.random.
    let seed = 0x2320f00d >>> 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buf;
  }

  async start(): Promise<void> {
    if (this.started || this.closed) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const now = this.ctx.currentTime;
    for (const v of this.voices) v.osc.start();

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer();
    noise.loop = true;
    noise.connect(this.noiseGain);
    noise.start();
    this.noiseSrc = noise;

    // 1 s fade-in to master ≤ 0.18
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.16, now + 1.0);
  }

  // ── C · detune-spread + inharmonicity ─────────────────────────────────────
  setC(c: number): void {
    if (this.closed) return;
    const now = this.ctx.currentTime;
    const spread = c * 42; // cents at the extreme
    for (const v of this.voices) {
      const f = v.baseFreq * (1 + c * v.inharm);
      v.osc.frequency.setTargetAtTime(f, now, 0.15);
      v.osc.detune.setTargetAtTime(v.detuneSign * spread, now, 0.15);
    }
  }

  // ── G · dark → vocal formant crossfade ────────────────────────────────────
  setG(g: number): void {
    if (this.closed) return;
    const now = this.ctx.currentTime;
    // vowel sweep: dark "oo" → open "ah"
    const f1 = 300 + g * 480; // 300 → 780
    const f2 = 780 + g * 780; // 780 → 1560
    this.f1.frequency.setTargetAtTime(f1, now, 0.2);
    this.f2.frequency.setTargetAtTime(f2, now, 0.2);
    this.f1.Q.setTargetAtTime(3 + g * 8, now, 0.2);
    this.f2.Q.setTargetAtTime(4 + g * 10, now, 0.2);
    // crossfade dark abstract → resonant vocal
    this.vocalGain.gain.setTargetAtTime(0.15 + g * 0.9, now, 0.2);
    this.darkGain.gain.setTargetAtTime(1.0 - g * 0.6, now, 0.2);
    // noise is abstract fuel: loud & un-vocal at low G, thinned as it turns vocal
    this.noiseGain.gain.setTargetAtTime(0.06 + (1 - g) * 0.16, now, 0.2);
    this.dark.frequency.setTargetAtTime(420 + g * 900, now, 0.2);
  }

  // ── D · dry/reverb + stereo spread ────────────────────────────────────────
  setD(d: number): void {
    if (this.closed) return;
    const now = this.ctx.currentTime;
    // low D → drowned in the void; high D → dry & present.
    this.reverb.setWet(0.85 * (1 - d) + 0.08);
    // low D → wide Haas spread; high D → mono-centred.
    const spread = (1 - d) * 0.7;
    this.widthL.gain.setTargetAtTime(spread, now, 0.2);
    this.widthR.gain.setTargetAtTime(spread, now, 0.2);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.2);
    } catch {
      /* no-op */
    }
    const stopAt = now + 0.6;
    for (const v of this.voices) {
      try {
        v.osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      this.noiseSrc?.stop(stopAt);
    } catch {
      /* no-op */
    }
    // close after the reverb tail has rung out.
    window.setTimeout(() => {
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    }, 5200);
  }
}
