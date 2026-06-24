// 909-resonant-field-volume — audio.ts
// Spatial granular re-synth + dumb drone bed + synthetic auto-demo source.
//
// Signal philosophy: the visitor's own sound is captured into a rolling ring
// buffer and scattered back around the listener as HRTF-panned grains. Grain
// POSITION is dictated by TIMBRE (brightness/flatness/loudness), never by
// pitch — grains keep whatever pitch the source had. Harmony is held
// deliberately dumb by a single fixed drone (root + fifth/octave partial).
//
// Anti-feedback: the live mic feeds the analyser + the capture buffer ONLY.
// It is NEVER routed to destination. Grains are re-synthesised copies.

import { Features } from "./features";

export type AudioMode = "idle" | "mic" | "demo";

interface GrainParams {
  centroid: number;
  flatness: number;
  rms: number;
  flux: number;
}

const RING_SECONDS = 3.5;

export class ResonantFieldAudio {
  ctx: AudioContext | null = null;

  // Master chain.
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private listener: AudioListener | null = null;

  // Mic / capture.
  micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Capture ring: a ScriptProcessor-free approach using a recorder -> ring.
  // We tap the active source through a capture node into a ring buffer via an
  // AnalyserNode time-domain read each frame (simple, dependency-free).
  private captureAnalyser: AnalyserNode | null = null;
  private ring: Float32Array | null = null;
  private ringWrite = 0;
  private ringFilled = 0;
  private captureScratch: Float32Array | null = null;

  // Drone bed nodes (so we can tear them down).
  private droneNodes: AudioScheduledSourceNode[] = [];
  private droneGain: GainNode | null = null;

  // Auto-demo synth nodes.
  private demoNodes: AudioScheduledSourceNode[] = [];
  private demoGain: GainNode | null = null;
  private demoFilter: BiquadFilterNode | null = null;
  private demoLfo: OscillatorNode | null = null;

  // Grain scheduler.
  private grainGain: GainNode | null = null;
  private nextGrainTime = 0;

  mode: AudioMode = "idle";
  available = true;

  /** Create + resume the context. MUST be called from a user gesture. */
  async init(): Promise<boolean> {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        this.available = false;
        return false;
      }
      this.ctx = new Ctor();
      await this.ctx.resume();

      // Master chain: grains/drone -> master -> lowpass -> compressor -> out.
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;

      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = "lowpass";
      this.lowpass.frequency.value = 7000;
      this.lowpass.Q.value = 0.5;

      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.005;
      this.comp.release.value = 0.25;

      this.master.connect(this.lowpass);
      this.lowpass.connect(this.comp);
      this.comp.connect(this.ctx.destination);

      this.listener = this.ctx.listener;
      // Listener faces -Z (default). Keep at origin.

      // Sub-bus for grains so we can balance against drone.
      this.grainGain = this.ctx.createGain();
      this.grainGain.gain.value = 1.0;
      this.grainGain.connect(this.master);

      // Capture ring.
      const sr = this.ctx.sampleRate;
      this.ring = new Float32Array(Math.ceil(sr * RING_SECONDS));

      // Capture analyser (time-domain tap shared with whichever source is live).
      this.captureAnalyser = this.ctx.createAnalyser();
      this.captureAnalyser.fftSize = 2048;
      this.captureScratch = new Float32Array(this.captureAnalyser.fftSize);

      // Feature analyser.
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.5;

      this.startDrone();
      this.nextGrainTime = this.ctx.currentTime + 0.1;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** The dumb drone: ONE fixed root + one fixed partial. No melody, no changes. */
  private startDrone() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.12;
    this.droneGain.connect(this.master);

    // Fixed root ~55 Hz + a fixed octave/fifth partial. Held flat forever.
    const freqs = [55, 82.5]; // root A1 + fixed fifth (E2). Never changes.
    const types: OscillatorType[] = ["sine", "triangle"];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = freqs[i];
      // gentle slow vibrato-free detune shimmer via a second tiny osc gain.
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.7 : 0.35;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 400;
      osc.connect(g);
      g.connect(lp);
      lp.connect(this.droneGain);
      osc.start();
      this.droneNodes.push(osc);
    }
  }

  /** Attach the mic. Returns false if denied / unavailable. */
  async startMic(): Promise<boolean> {
    if (!this.ctx || !this.analyser || !this.captureAnalyser) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      // Mic -> analyser (features) and mic -> captureAnalyser (ring tap).
      // NEVER mic -> destination.
      this.micSource.connect(this.analyser);
      this.micSource.connect(this.captureAnalyser);
      this.stopDemo();
      this.mode = "mic";
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Synthetic auto-demo source: evolving filtered noise + slow centroid/flatness
   * sweep. Routed to BOTH the feature analyser AND the capture ring, so the
   * exact same pipeline blooms with zero input.
   */
  startDemo() {
    if (!this.ctx || !this.analyser || !this.captureAnalyser) return;
    if (this.mode === "demo") return;
    const ctx = this.ctx;

    this.demoGain = ctx.createGain();
    this.demoGain.gain.value = 0.9;

    // Filtered noise buffer (looping) -> bandpass that sweeps = morphing timbre.
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    this.demoFilter = ctx.createBiquadFilter();
    this.demoFilter.type = "bandpass";
    this.demoFilter.frequency.value = 600;
    this.demoFilter.Q.value = 2.5;

    // Add a breathy tone partial so flatness oscillates between noisy/tonal.
    const tone = ctx.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.value = 180; // arbitrary, NOT a musical choice; provides texture.
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.25;
    const toneLp = ctx.createBiquadFilter();
    toneLp.type = "lowpass";
    toneLp.frequency.value = 1200;

    // Slow LFO sweeps the bandpass centre -> centroid morphs over ~20 s.
    this.demoLfo = ctx.createOscillator();
    this.demoLfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 1400;
    this.demoLfo.connect(lfoGain);
    lfoGain.connect(this.demoFilter.frequency);

    // Amplitude breathing so RMS rises/falls (not a flat VU).
    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.value = 0.13;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.35;
    const breathBias = ctx.createConstantSource();
    breathBias.offset.value = 0.55;
    breathLfo.connect(breathGain);
    breathGain.connect(this.demoGain.gain);
    breathBias.connect(this.demoGain.gain);

    noise.connect(this.demoFilter);
    this.demoFilter.connect(this.demoGain);
    tone.connect(toneGain);
    toneGain.connect(toneLp);
    toneLp.connect(this.demoGain);

    // Demo -> analyser + capture (same contract as mic). NOT to destination
    // directly; its sound reaches the ears only via re-synthesised grains.
    this.demoGain.connect(this.analyser);
    this.demoGain.connect(this.captureAnalyser);

    noise.start();
    tone.start();
    this.demoLfo.start();
    breathLfo.start();
    breathBias.start();
    this.demoNodes.push(noise, tone, this.demoLfo, breathLfo, breathBias);
    this.mode = "demo";
  }

  private stopDemo() {
    for (const n of this.demoNodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
    this.demoNodes = [];
    if (this.demoGain) {
      try {
        this.demoGain.disconnect();
      } catch {
        /* noop */
      }
      this.demoGain = null;
    }
    this.demoFilter = null;
    this.demoLfo = null;
  }

  /** Pull latest captured samples into the ring. Call once per animation frame. */
  pumpCapture() {
    if (!this.captureAnalyser || !this.ring || !this.captureScratch) return;
    this.captureAnalyser.getFloatTimeDomainData(
      this.captureScratch as unknown as Float32Array<ArrayBuffer>
    );
    const buf = this.captureScratch;
    const ring = this.ring;
    for (let i = 0; i < buf.length; i++) {
      ring[this.ringWrite] = buf[i];
      this.ringWrite = (this.ringWrite + 1) % ring.length;
    }
    this.ringFilled = Math.min(this.ringFilled + buf.length, ring.length);
  }

  /**
   * Schedule HRTF-panned grains from the ring, positioned by timbre. Call once
   * per frame; it batches grains up to a small horizon.
   */
  scheduleGrains(f: Features) {
    if (!this.ctx || !this.grainGain || !this.ring || this.ringFilled < 2048)
      return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const horizon = now + 0.12;

    // RMS -> density (grains/sec). Silence = sparse, loud = a shower.
    const density = 4 + f.rms * 55; // ~4..59 grains/sec
    const interval = 1 / density;
    // Grain length: brighter/noisier -> shorter grains (more shimmer).
    const grainLen = 0.12 - f.centroid * 0.06 - f.flatness * 0.02; // ~0.04..0.12 s

    while (this.nextGrainTime < horizon) {
      if (this.nextGrainTime < now) {
        this.nextGrainTime = now + interval;
        continue;
      }
      this.spawnGrain(this.nextGrainTime, grainLen, {
        centroid: f.centroid,
        flatness: f.flatness,
        rms: f.rms,
        flux: f.flux,
      });
      // Jitter the interval a touch so it never machine-guns.
      this.nextGrainTime += interval * (0.7 + Math.random() * 0.6);
    }
  }

  private spawnGrain(when: number, len: number, p: GrainParams) {
    if (!this.ctx || !this.ring || !this.grainGain) return;
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const lenSamp = Math.max(256, Math.floor(len * sr));
    if (this.ringFilled < lenSamp) return;

    // Read a contiguous slice from somewhere in the recent ring history.
    // Position chosen randomly within the available history -> texture, not
    // pitch sequencing. We do NOT repitch; playbackRate stays 1.
    const maxStart = this.ringFilled - lenSamp;
    const offset = Math.floor(Math.random() * maxStart);
    // Convert logical offset (from oldest) to physical ring index.
    const oldest =
      (this.ringWrite - this.ringFilled + this.ring.length * 4) %
      this.ring.length;
    const grainBuf = ctx.createBuffer(1, lenSamp, sr);
    const gd = grainBuf.getChannelData(0);
    for (let i = 0; i < lenSamp; i++) {
      const ri = (oldest + offset + i) % this.ring.length;
      // Hann window.
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (lenSamp - 1));
      gd[i] = this.ring[ri] * w;
    }

    const src = ctx.createBufferSource();
    src.buffer = grainBuf;
    src.playbackRate.value = 1; // never repitch by any musical rule.

    const g = ctx.createGain();
    g.gain.value = 0.6 + p.rms * 0.4;

    // HRTF panner positioned by TIMBRE.
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1;

    // brightness -> elevation (y) + forward distance (-z deeper when bright).
    const elevation = (p.centroid - 0.4) * 6; // -2.4 .. +3.6
    const forward = -(0.5 + p.centroid * 4); // brighter = further in front
    // flatness -> azimuth spread/width. Noisy -> wide scatter, tonal -> centred.
    const spread = 0.5 + p.flatness * 9;
    const az = (Math.random() * 2 - 1) * spread;
    // flux gives an extra radial kick outward on transients.
    const radial = 1 + p.flux * 5;

    const x = az;
    const y = elevation + (Math.random() * 2 - 1) * 0.8;
    const z = forward * radial * 0.4 - 0.5;

    if (typeof panner.positionX !== "undefined") {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      // Older Safari fallback.
      (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
    }

    src.connect(g);
    g.connect(panner);
    panner.connect(this.grainGain);

    src.start(when);
    src.stop(when + len + 0.02);
    // Auto-disconnect when finished to avoid node leaks.
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
        panner.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  /** Full teardown. Safe to call multiple times. */
  async dispose() {
    this.stopDemo();
    for (const n of this.droneNodes) {
      try {
        n.stop();
      } catch {
        /* noop */
      }
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
    this.droneNodes = [];
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) t.stop();
      this.micStream = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        /* noop */
      }
      this.micSource = null;
    }
    const nodes = [
      this.analyser,
      this.captureAnalyser,
      this.grainGain,
      this.droneGain,
      this.master,
      this.lowpass,
      this.comp,
    ];
    for (const n of nodes) {
      try {
        n?.disconnect();
      } catch {
        /* noop */
      }
    }
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* noop */
      }
    }
    this.ctx = null;
    this.ring = null;
    this.analyser = null;
    this.captureAnalyser = null;
    this.mode = "idle";
  }
}
