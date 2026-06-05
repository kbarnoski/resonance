// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the harmony engine.
//   Each food node owns ONE sustained voice tuned to a D-rooted just-intonation
//   modal set. A voice's gain + brightness rise as the slime network CONNECTS
//   that node to the trunk, and fall as the vein dies back. So the live chord
//   you hear IS the set of currently-connected nodes — the topology is the music.
//   An always-on faint root drone keeps the field from ever going silent.
//   Procedural ConvolverNode reverb, master ≤ 0.5 into a brick-wall compressor.
// ─────────────────────────────────────────────────────────────────────────────

import { ROOT_HZ, SCALE, type Seed } from "./source";

interface Voice {
  osc: OscillatorNode;
  sub: OscillatorNode; // a sub/fifth partial for body
  lpf: BiquadFilterNode;
  gain: GainNode;
  freq: number;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      // exponentially decaying noise — a cheap, warm procedural reverb tail
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export class ChoirEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private reverb: ConvolverNode;
  private wet: GainNode;
  private voices: Voice[] = [];
  private drone: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // faded in on start()
    this.master.connect(this.comp);

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = makeImpulse(this.ctx, 3.4, 2.6);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.34;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
  }

  /**
   * Append one sustained voice per seed. The first call also starts the
   * always-on root drone (guarded so click-to-plant doesn't stack drones).
   * Voices are pushed in order, so voice[i] stays aligned with food node i.
   */
  buildVoices(seeds: Seed[]): void {
    const now = this.ctx.currentTime;

    // root drone — two slightly-detuned saws an octave apart, always faintly on
    if (!this.drone) {
      const dOsc = this.ctx.createOscillator();
      dOsc.type = "sawtooth";
      dOsc.frequency.value = ROOT_HZ;
      const dOsc2 = this.ctx.createOscillator();
      dOsc2.type = "sine";
      dOsc2.frequency.value = ROOT_HZ * 2;
      dOsc2.detune.value = 4;
      const dLpf = this.ctx.createBiquadFilter();
      dLpf.type = "lowpass";
      dLpf.frequency.value = 320;
      const dGain = this.ctx.createGain();
      dGain.gain.value = 0.0;
      dGain.gain.setTargetAtTime(0.12, now, 1.5);
      dOsc.connect(dLpf);
      dOsc2.connect(dLpf);
      dLpf.connect(dGain);
      dGain.connect(this.master);
      dGain.connect(this.reverb);
      dOsc.start();
      dOsc2.start();
      this.drone = { osc: dOsc, osc2: dOsc2, gain: dGain };
    }

    for (const seed of seeds) {
      const freq = ROOT_HZ * Math.pow(2, seed.octave) * SCALE[seed.degree];
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = freq * 1.5; // a just fifth above for shimmer
      sub.detune.value = 3;
      const lpf = this.ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 400; // dark until connected
      lpf.Q.value = 0.6;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      osc.connect(lpf);
      sub.connect(lpf);
      lpf.connect(gain);
      gain.connect(this.master);
      gain.connect(this.reverb);
      osc.start();
      sub.start();
      this.voices.push({ osc, sub, lpf, gain, freq });
    }
  }

  /** Optionally play Karel's (or the synth) buffer as a faint, looping bed. */
  startBed(buffer: AudioBuffer | null): void {
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    gain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 2.0);
    src.connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    src.start();
    this.bed = { src, gain };
  }

  /** Fade the whole field in (called from a user gesture). */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.master.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.2);
  }

  /**
   * Drive the harmony from connectivity. `connection[i]` in [0,1] is how strongly
   * food node i is currently linked to the network (trail intensity near it,
   * gated by trunk-linkage). Voice i swells in and brightens as it connects.
   */
  setConnections(connection: Float32Array): void {
    const t = this.ctx.currentTime;
    const n = Math.min(connection.length, this.voices.length);
    for (let i = 0; i < n; i++) {
      const c = Math.max(0, Math.min(1, connection[i]));
      const v = this.voices[i];
      // gain rises with connection; keep total bounded by the compressor
      v.gain.gain.setTargetAtTime(0.0001 + c * 0.16, t, 0.25);
      // brightness opens up as the vein thickens
      const cutoff = 380 + c * c * 3600;
      v.lpf.frequency.setTargetAtTime(cutoff, t, 0.3);
    }
  }

  /** Full teardown — stop every node, close the context. */
  dispose(): void {
    const safeStop = (n: AudioScheduledSourceNode) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    };
    for (const v of this.voices) {
      safeStop(v.osc);
      safeStop(v.sub);
    }
    this.voices = [];
    if (this.drone) {
      safeStop(this.drone.osc);
      safeStop(this.drone.osc2);
      this.drone = null;
    }
    if (this.bed) {
      safeStop(this.bed.src);
      this.bed = null;
    }
    try {
      if (this.ctx.state !== "closed") void this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
