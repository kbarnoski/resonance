// audio.ts — depth-driven granular/additive voice bank, spatialized.
//
// The whole composition lives in PROXIMITY, SPACE and MOTION — never in
// intervals. Pitch is LOCKED to one fixed mode (a drone + fifth + a small
// pentatonic stack), so nothing can ever clash. Distance is the instrument.
//
//   NEAR depth (lean in)  -> bright foreground voices bloom, more density
//   FAR depth (pull back) -> thins to a low soft drone bed
//   centroid-x            -> pans the active voices L <-> R (HRTF panner)
//   motion-in-depth       -> shimmer/density (grain rate + a tremolo top)
//
// Kids-safe gentle chain: master gain <= 0.3, lowpass, compressor.

import type { DepthFeatures } from "./depth";

// One fixed mode — a low drone root, its fifth, and a pentatonic shimmer stack.
// Hz values, no transposition ever happens. Frequencies only fade in/out.
const DRONE_HZ = 55; // A1
const FIFTH_HZ = 82.41; // E2
// A-minor-ish pentatonic shimmer (A2, C3, D3, E3, G3, A3) — foreground bloom
const SHIMMER_HZ = [110, 130.81, 146.83, 164.81, 196.0, 220.0];

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  baseGain: number;
}

export class DepthInstrument {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  droneVoices: Voice[] = [];
  shimmerVoices: Voice[] = [];
  // grain bed (filtered noise bursts) gives the "granular" texture for motion
  noiseSrc: AudioBufferSourceNode | null = null;
  grainGain: GainNode;
  grainFilter: BiquadFilterNode;
  tremGain: GainNode;
  tremLfo: OscillatorNode;
  started = false;

  constructor() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.3;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 1200;
    this.lowpass.Q.value = 0.6;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    // listener at origin facing -z; HRTF panners place voices around it
    this.comp.connect(this.lowpass);
    this.lowpass.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.grainGain = this.ctx.createGain();
    this.grainGain.gain.value = 0;
    this.grainFilter = this.ctx.createBiquadFilter();
    this.grainFilter.type = "bandpass";
    this.grainFilter.frequency.value = 900;
    this.grainFilter.Q.value = 0.8;
    this.tremGain = this.ctx.createGain();
    this.tremGain.gain.value = 1;
    this.grainFilter.connect(this.tremGain);
    this.tremGain.connect(this.grainGain);
    this.grainGain.connect(this.comp);
    this.tremLfo = this.ctx.createOscillator();
    this.tremLfo.frequency.value = 5.5;
    const tremDepth = this.ctx.createGain();
    tremDepth.gain.value = 0.4;
    this.tremLfo.connect(tremDepth);
    tremDepth.connect(this.tremGain.gain);
  }

  private makeVoice(freq: number, type: OscillatorType, baseGain: number): Voice {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    // tiny detune drift per voice for warmth
    osc.detune.value = (Math.random() - 0.5) * 6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.positionZ.value = -1;
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.comp);
    return { osc, gain, panner, baseGain };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    this.droneVoices = [
      this.makeVoice(DRONE_HZ, "sine", 0.5),
      this.makeVoice(DRONE_HZ * 2, "sine", 0.22),
      this.makeVoice(FIFTH_HZ, "sine", 0.3),
    ];
    this.shimmerVoices = SHIMMER_HZ.map((hz) =>
      this.makeVoice(hz, "triangle", 0.16),
    );

    for (const v of [...this.droneVoices, ...this.shimmerVoices]) {
      v.osc.start(now);
    }

    // grain bed: looping pink-ish noise gated by grainGain
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.98 * last + 0.02 * white;
      ch[i] = last * 3.0;
    }
    this.noiseSrc = this.ctx.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.noiseSrc.connect(this.grainFilter);
    this.noiseSrc.start(now);
    this.tremLfo.start(now);

    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(0.3, now + 1.6);
  }

  // Push live features into the audio graph. Called every animation frame.
  update(f: DepthFeatures): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const tc = 0.12; // smoothing time constant

    // pan: centroid 0..1 -> x position -3..3
    const panX = (f.centroidX - 0.5) * 6;
    const panY = (0.5 - f.centroidY) * 2;

    // FAR (low nearEnergy) -> drone bed stays present; NEAR -> shimmer blooms.
    const droneLevel = 0.55 + 0.25 * (1 - f.nearEnergy);
    for (const v of this.droneVoices) {
      v.gain.gain.setTargetAtTime(v.baseGain * droneLevel, now, 0.4);
      v.panner.positionX.setTargetAtTime(panX * 0.25, now, tc);
    }

    // shimmer voices bloom with nearEnergy; spread opens more of the stack
    const stackOpen = 0.3 + 0.7 * f.spread;
    this.shimmerVoices.forEach((v, idx) => {
      const reach = idx / (this.shimmerVoices.length - 1);
      const within = reach <= stackOpen ? 1 : Math.max(0, 1 - (reach - stackOpen) * 4);
      const level = v.baseGain * f.nearEnergy * within;
      v.gain.gain.setTargetAtTime(level, now, tc);
      v.panner.positionX.setTargetAtTime(panX, now, tc);
      v.panner.positionY.setTargetAtTime(panY, now, tc);
    });

    // brightness: near pixels open the lowpass
    const cutoff = 600 + f.nearEnergy * 3200 + f.motion * 1800;
    this.lowpass.frequency.setTargetAtTime(cutoff, now, tc);

    // motion-in-depth -> grain density/shimmer
    const grain = Math.min(0.18, f.motion * 0.22 + f.nearEnergy * 0.04);
    this.grainGain.gain.setTargetAtTime(grain, now, tc);
    this.grainFilter.frequency.setTargetAtTime(
      500 + f.nearEnergy * 1600,
      now,
      tc,
    );
    // tremolo speeds up with motion (shimmer)
    this.tremLfo.frequency.setTargetAtTime(4 + f.motion * 9, now, 0.2);
  }

  async close(): Promise<void> {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.15);
      await new Promise((r) => setTimeout(r, 220));
      for (const v of [...this.droneVoices, ...this.shimmerVoices]) {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        this.noiseSrc?.stop();
        this.tremLfo.stop();
      } catch {
        /* already stopped */
      }
      if (this.ctx.state !== "closed") await this.ctx.close();
    } catch {
      /* best effort */
    }
  }
}
