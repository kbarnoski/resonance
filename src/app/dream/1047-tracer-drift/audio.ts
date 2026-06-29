// ════════════════════════════════════════════════════════════════════════════
// Inline Web Audio engine for 1047-tracer-drift.
//
// The audible bed is a slow, drifting ambient drone — it must feel weightless
// and endless, never rhythmic:
//   - a stack of detuned sine/triangle oscillators (a low chord) with very slow
//     per-voice detune LFOs (the "melt"), plus a slow shared pitch-bend
//     portamento that drifts the whole chord up/down a few cents over minutes;
//   - a gentle filtered-noise wash (pink-ish noise -> slow lowpass sweep);
//   - everything summed under a master gain (~0.13) with click-free fades.
//
// Input model (per the brief):
//   - PRIMARY: microphone, ANALYSIS-ONLY. getUserMedia -> AnalyserNode. The mic
//     is NEVER routed to destination. Breath/energy reads as a slow swell.
//   - FALLBACK (no mic / denied): a self-driven LFO swell stands in for breath
//     so the piece drifts on a phone glance with zero permissions.
//
// read() returns slow, smoothed control values for the visuals:
//   lowEnergy -> feedback decay / zoom (trail length) + warp amplitude
//   level     -> saturation
// ════════════════════════════════════════════════════════════════════════════

export type AudioFrame = {
  lowEnergy: number; // 0..1 low-band energy, slow swell
  level: number; // 0..1 overall loudness
  /** True when the slow swell is mic-driven; false when self-driven fallback. */
  micDriven: boolean;
};

type DroneVoice = {
  osc: OscillatorNode;
  detuneLfo: OscillatorNode;
  detuneDepth: GainNode;
  gain: GainNode;
};

const MASTER_GAIN = 0.13;

export class TracerAudioEngine {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private freqData: Uint8Array<ArrayBuffer>;
  private master: GainNode;

  // audible bed
  private bedGain: GainNode;
  private voices: DroneVoice[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseFilterLfo: OscillatorNode | null = null;
  private noiseFilterLfoDepth: GainNode | null = null;
  private bendLfo: OscillatorNode | null = null;
  private bendDepth: GainNode | null = null;
  private started = false;
  private startTime = 0;

  // mic
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micActive = false;

  // smoothed control values (very slow — this is a drift, not a meter)
  private sLow = 0;
  private sLevel = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.9;
    this.freqData = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount)
    );

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // the audible bed feeds BOTH the speakers and (so the fallback can drive
    // the visuals without a mic) the analyser tap.
    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 1;
    this.bedGain.connect(this.master);
    this.bedGain.connect(this.analyser);
  }

  private async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Start the drifting ambient bed. Always call this (it is the sound). */
  async startBed(): Promise<void> {
    await this.resume();
    if (this.started) return;
    const t0 = this.ctx.currentTime;

    // A soft low chord: root, octave, fifth, a high colour tone — detuned.
    // Frequencies in Hz; small offsets create slow beating.
    const partials = [
      { f: 65.41, type: "sine" as OscillatorType, g: 0.5 }, // C2
      { f: 98.0, type: "sine" as OscillatorType, g: 0.34 }, // G2 (fifth)
      { f: 130.81, type: "triangle" as OscillatorType, g: 0.22 }, // C3
      { f: 196.0, type: "sine" as OscillatorType, g: 0.16 }, // G3
      { f: 261.63, type: "triangle" as OscillatorType, g: 0.1 }, // C4 colour
    ];

    // Shared slow pitch-bend portamento ("melt"): a very slow LFO that nudges
    // every oscillator's detune together, drifting the whole chord a few cents.
    this.bendLfo = this.ctx.createOscillator();
    this.bendLfo.type = "sine";
    this.bendLfo.frequency.value = 1 / 67; // one slow cycle per ~67s
    this.bendDepth = this.ctx.createGain();
    this.bendDepth.gain.value = 7; // cents
    this.bendLfo.connect(this.bendDepth);
    this.bendLfo.start();

    for (let i = 0; i < partials.length; i++) {
      const p = partials[i];
      const osc = this.ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = p.f;

      // per-voice slow detune LFO (the drift / beating)
      const detuneLfo = this.ctx.createOscillator();
      detuneLfo.type = "sine";
      detuneLfo.frequency.value = 0.03 + i * 0.017; // 0.03..0.1 Hz
      const detuneDepth = this.ctx.createGain();
      detuneDepth.gain.value = 4 + i * 2; // cents of wobble
      detuneLfo.connect(detuneDepth);
      detuneDepth.connect(osc.detune);
      // shared portamento also rides the detune
      this.bendDepth.connect(osc.detune);
      detuneLfo.start();

      const g = this.ctx.createGain();
      g.gain.value = 0;
      // long swell-in per voice, staggered so the chord blooms
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(p.g, t0 + 4 + i * 1.5);

      osc.connect(g);
      g.connect(this.bedGain);
      osc.start();

      this.voices.push({ osc, detuneLfo, detuneDepth, gain: g });
    }

    // Gentle filtered-noise wash: white noise -> lowpass that slowly sweeps.
    const noiseBuf = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 2,
      this.ctx.sampleRate
    );
    const ch = noiseBuf.getChannelData(0);
    // pink-ish noise via a simple running average of white noise
    let last = 0;
    for (let i = 0; i < ch.length; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.96 + w * 0.04;
      ch[i] = last * 3.2;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = "lowpass";
    nFilter.frequency.value = 600;
    nFilter.Q.value = 0.5;

    // slow filter sweep LFO
    const nLfo = this.ctx.createOscillator();
    nLfo.type = "sine";
    nLfo.frequency.value = 1 / 41; // ~41s sweep
    const nLfoDepth = this.ctx.createGain();
    nLfoDepth.gain.value = 380; // Hz swing around base
    nLfo.connect(nLfoDepth);
    nLfoDepth.connect(nFilter.frequency);

    const nGain = this.ctx.createGain();
    nGain.gain.value = 0;
    nGain.gain.setValueAtTime(0, t0);
    nGain.gain.linearRampToValueAtTime(0.14, t0 + 8);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.bedGain);
    noise.start();
    nLfo.start();

    this.noiseSrc = noise;
    this.noiseFilter = nFilter;
    this.noiseFilterLfo = nLfo;
    this.noiseFilterLfoDepth = nLfoDepth;

    // click-free master fade-in
    this.master.gain.cancelScheduledValues(t0);
    this.master.gain.setValueAtTime(0, t0);
    this.master.gain.linearRampToValueAtTime(MASTER_GAIN, t0 + 6);

    this.started = true;
    this.startTime = t0;
  }

  /** Open the mic for ANALYSIS ONLY (never routed to destination). */
  async startMic(): Promise<void> {
    await this.resume();
    if (this.micActive) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.micStream = stream;
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.analyser); // tap only — NOT to destination
    this.micActive = true;
  }

  get micDriven(): boolean {
    return this.micActive;
  }

  /** Per-frame slow control read. */
  read(): AudioFrame {
    this.analyser.getByteFrequencyData(this.freqData);
    const data = this.freqData;
    const n = data.length;
    const lowEnd = Math.max(1, Math.floor(n * 0.12));

    let lowSum = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const v = data[i] / 255;
      total += v;
      if (i < lowEnd) lowSum += v;
    }
    let low = lowSum / lowEnd;
    let level = total / n;

    if (!this.micActive) {
      // Self-driven swell fallback: a slow LFO breath so the visuals drift
      // even with zero permissions. Blend with the bed's own low energy.
      const t = this.ctx.currentTime - this.startTime;
      const breath =
        0.45 +
        0.32 * Math.sin(t * 0.13) +
        0.12 * Math.sin(t * 0.041 + 1.3);
      low = Math.max(low, breath * 0.7);
      level = Math.max(level, breath * 0.45);
    } else {
      // emphasise breath dynamics from the mic
      low = Math.min(1, low * 1.6);
      level = Math.min(1, level * 1.4);
    }

    // very slow smoothing — this is a drift, not a VU meter
    const a = 0.035;
    this.sLow += (low - this.sLow) * a;
    this.sLevel += (level - this.sLevel) * a;

    return {
      lowEnergy: this.sLow,
      level: this.sLevel,
      micDriven: this.micActive,
    };
  }

  dispose(): void {
    try {
      const t = this.ctx.currentTime;
      // click-free fade then teardown
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.4);
    } catch {
      /* ignore */
    }
    const stopSoon = () => {
      try {
        for (const v of this.voices) {
          try {
            v.osc.stop();
          } catch {
            /* already stopped */
          }
          try {
            v.detuneLfo.stop();
          } catch {
            /* already stopped */
          }
          v.osc.disconnect();
          v.detuneLfo.disconnect();
          v.detuneDepth.disconnect();
          v.gain.disconnect();
        }
        this.voices = [];
        try {
          this.noiseSrc?.stop();
        } catch {
          /* already stopped */
        }
        this.noiseSrc?.disconnect();
        this.noiseFilter?.disconnect();
        try {
          this.noiseFilterLfo?.stop();
        } catch {
          /* already stopped */
        }
        this.noiseFilterLfo?.disconnect();
        this.noiseFilterLfoDepth?.disconnect();
        try {
          this.bendLfo?.stop();
        } catch {
          /* already stopped */
        }
        this.bendLfo?.disconnect();
        this.bendDepth?.disconnect();
        if (this.micSource) this.micSource.disconnect();
        if (this.micStream) {
          for (const tr of this.micStream.getTracks()) tr.stop();
        }
        this.bedGain.disconnect();
        this.analyser.disconnect();
        this.master.disconnect();
        void this.ctx.close();
      } catch {
        /* best-effort teardown */
      }
    };
    // let the fade finish, then close
    setTimeout(stopSoon, 480);
  }
}
