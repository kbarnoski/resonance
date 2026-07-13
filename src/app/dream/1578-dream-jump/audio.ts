// audio.ts — the Dream Jump sound world.
//
// A just-intonation drone/pad (a few detuned oscillators + a sub) that
// RE-TUNES its root to the current scene, a soft filtered-noise "whoosh" swell
// on each teleport, and a "voice-follow" oscillator that tracks sung pitch so
// the mic feels connected. Everything is gesture-gated: nothing is created
// until start() is called from a user click. Master gain <= 0.16 into a
// DynamicsCompressor. Steady voice count: 5 pad + 1 sub + 1 voice = 7 (plus a
// short transient per whoosh), well under the 14-voice ceiling.

import { mulberry32 } from "./random";

export interface Analysis {
  pitchHz: number; // -1 when no confident pitch
  energy: number; // RMS of the mic frame
}

// Just-intonation pad ratios over the root.
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 15 / 8];

export class DreamAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padOscs: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private voiceOsc: OscillatorNode | null = null;
  private voiceGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private timeBuf = new Float32Array(2048);
  private rootHz = 110;
  private smoothedPitch = 0;

  get ready(): boolean {
    return this.ctx !== null;
  }

  async start(rootHz: number): Promise<void> {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.rootHz = rootHz;

    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.6;
    padFilter.connect(master);
    this.padFilter = padFilter;

    RATIOS.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sawtooth";
      osc.frequency.value = rootHz * r;
      osc.detune.value = (i - 2) * 3; // a few cents of spread for warmth
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
      this.padOscs.push(osc);
      this.padGains.push(g);
    });

    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = rootHz / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start();
    this.subOsc = subOsc;
    this.subGain = subGain;

    const voiceOsc = ctx.createOscillator();
    voiceOsc.type = "sine";
    voiceOsc.frequency.value = rootHz * 2;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceOsc.connect(voiceGain);
    voiceGain.connect(padFilter);
    voiceOsc.start();
    this.voiceOsc = voiceOsc;
    this.voiceGain = voiceGain;

    // Deterministic noise buffer for the teleport whoosh (mulberry32 only).
    const len = Math.floor(ctx.sampleRate * 1.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const nr = mulberry32(0x51785eed);
    for (let i = 0; i < len; i++) data[i] = nr() * 2 - 1;
    this.noiseBuf = buf;

    await ctx.resume();

    // Fade the bed in gently.
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.16, now + 1.4);
    this.padGains.forEach((g) => {
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.09, now + 1.6);
    });
    subGain.gain.linearRampToValueAtTime(0.14, now + 1.6);
  }

  retune(rootHz: number): void {
    if (!this.ctx) return;
    this.rootHz = rootHz;
    const t = this.ctx.currentTime;
    this.padOscs.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(rootHz * RATIOS[i], t, 0.25);
    });
    this.subOsc?.frequency.setTargetAtTime(rootHz / 2, t, 0.3);
  }

  whoosh(seed: number): void {
    if (!this.ctx || !this.noiseBuf || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    const rnd = mulberry32(seed >>> 0);
    const t = ctx.currentTime;
    const f0 = 300 + rnd() * 400;
    const f1 = 1800 + rnd() * 1600;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + 0.5);
    bp.frequency.exponentialRampToValueAtTime(Math.max(200, f0 * 0.6), t + 1.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  async enableMic(): Promise<void> {
    if (!this.ctx) throw new Error("audio not started");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.micStream = stream;
    const src = this.ctx.createMediaStreamSource(stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.15;
    src.connect(an); // analyser only — never routed to destination (no feedback)
    this.micSource = src;
    this.analyser = an;
  }

  analyse(): Analysis | null {
    if (!this.analyser || !this.ctx) return null;
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      sum += this.timeBuf[i] * this.timeBuf[i];
    }
    const energy = Math.sqrt(sum / this.timeBuf.length);
    const pitchHz = detectPitch(this.timeBuf, this.ctx.sampleRate, energy);
    return { pitchHz, energy };
  }

  nudge(a: Analysis): void {
    if (!this.ctx || !this.voiceOsc || !this.voiceGain || !this.padFilter) return;
    const t = this.ctx.currentTime;
    const cutoff = 700 + Math.min(1, a.energy * 12) * 2600;
    this.padFilter.frequency.setTargetAtTime(cutoff, t, 0.12);
    if (a.pitchHz > 60 && a.pitchHz < 1400) {
      this.smoothedPitch =
        this.smoothedPitch === 0
          ? a.pitchHz
          : this.smoothedPitch * 0.8 + a.pitchHz * 0.2;
      this.voiceOsc.frequency.setTargetAtTime(this.smoothedPitch, t, 0.06);
      const vg = Math.min(0.05, a.energy * 0.6);
      this.voiceGain.gain.setTargetAtTime(vg, t, 0.08);
    } else {
      this.voiceGain.gain.setTargetAtTime(0, t, 0.15);
    }
  }

  dispose(): void {
    try {
      this.micStream?.getTracks().forEach((tr) => tr.stop());
    } catch {
      /* ignore */
    }
    const all: (OscillatorNode | null)[] = [
      ...this.padOscs,
      this.subOsc,
      this.voiceOsc,
    ];
    all.forEach((o) => {
      try {
        o?.stop();
      } catch {
        /* already stopped */
      }
    });
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.padFilter = null;
    this.analyser = null;
    this.micSource = null;
    this.micStream = null;
    this.subOsc = null;
    this.voiceOsc = null;
    this.padOscs = [];
    this.padGains = [];
  }
}

// Autocorrelation pitch detection (Chris Wilson's method): trim quiet edges,
// autocorrelate, take the first strong lag, refine with parabolic interpolation.
function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  rms: number,
): number {
  if (rms < 0.008) return -1;
  const SIZE = buf.length;
  const thres = 0.2;
  let r1 = 0;
  let r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }
  const b = buf.subarray(r1, r2);
  const n = b.length;
  if (n < 32) return -1;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < n - i; j++) acc += b[j] * b[j + i];
    c[i] = acc;
  }
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0) return -1;
  let T0 = maxpos;
  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 = T0 - bb / (2 * a);
  if (!T0) return -1;
  return sampleRate / T0;
}
